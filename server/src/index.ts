import compression from 'compression';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { FieldValue, getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { onRequest } from 'firebase-functions/v2/https';
import { put } from '@vercel/blob';
import { addCacheTag, getCache, invalidateByTag, waitUntil } from '@vercel/functions';
import {
  products as defaultProducts,
  type Product,
} from './data/products.js';
import type { ProductOptionCategory, ProductOptionValue } from './data/options.js';
import { services as defaultServices, type Service } from './data/services.js';
import { CatalogueCache, type SharedStore, type VersionSource } from './catalogueCache.js';

// .env.local holds machine-only settings (e.g. the service key path); it is never deployed.
for (const name of ['../.env.local', '../.env']) {
  const envFile = fileURLToPath(new URL(name, import.meta.url));
  if (existsSync(envFile)) process.loadEnvFile(envFile);
}

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const allowedExtensions = new Set(['.stl', '.obj']);
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  // CLIENT_ORIGIN may list several origins separated by commas.
  ...(process.env.CLIENT_ORIGIN ?? '').split(',').map((origin) => origin.trim()),
].filter((origin): origin is string => Boolean(origin));

/**
 * Runs a Vercel platform helper without ever breaking the request: depending on the runtime
 * these return a promise, nothing, or throw when no Vercel context is available (locally).
 */
function safely(task: () => unknown, label: string) {
  const report = (error: unknown) => console.warn(`[vercel] ${label} impossible.`, error);
  try {
    const result = task();
    if (result instanceof Promise) waitUntil(result.catch(report));
  } catch (error) {
    report(error);
  }
}

// Public catalogue reads (no credentials) are cacheable by the CDN.
const PUBLIC_CATALOGUE_PATH = /^\/api\/(products(\/[^/]+)?|options|services|carriers|testimonials)\/?$/;
const CATALOGUE_CDN_TAG = 'catalogue';
const isPublicCatalogueRead = (req: Request) =>
  (req.method === 'GET' || req.method === 'HEAD') && PUBLIC_CATALOGUE_PATH.test(req.path);

// Public catalogue reads allow any origin: the answer is the same for everyone, so a single
// CDN copy can serve every domain of the site. Everything else keeps the origin allow-list.
app.use(cors((req, callback) => {
  callback(null, isPublicCatalogueRead(req as Request) ? { origin: '*' } : { origin: allowedOrigins });
}));
// The CDN keeps public catalogue answers 5 min (an admin change also purges them, see /api/admin).
app.use((req, res, next) => {
  if (isPublicCatalogueRead(req)) {
    res.set('Cache-Control', 'public, max-age=0, must-revalidate');
    res.set('Vercel-CDN-Cache-Control', 'max-age=300, stale-while-revalidate=86400');
    safely(() => addCacheTag(CATALOGUE_CDN_TAG), 'marquage CDN');
  }
  next();
});
app.use(compression());
// Product and option images travel inline as base64 data URLs.
app.use(express.json({ limit: '12mb' }));

let firebaseApp: App | undefined;

function getConfiguredApp(): App {
  const projectId =
    process.env.PROJECT_ID ||
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId && !process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('Firebase is not configured.');
  }

  if (!firebaseApp) {
    const credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const absoluteCredentialPath = credentialPath
      ? fileURLToPath(
          new URL(credentialPath, new URL('..', import.meta.url)),
        )
      : undefined;
    // On hosts without Google credentials (e.g. Vercel) the service account JSON comes from an env var.
    const inlineServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
    const credential = inlineServiceAccount
      ? cert(JSON.parse(inlineServiceAccount))
      : absoluteCredentialPath && existsSync(absoluteCredentialPath)
        ? cert(absoluteCredentialPath)
        : undefined;
    firebaseApp = getApps()[0] ?? initializeApp({
      ...(projectId ? { projectId } : {}),
      ...(process.env.STORAGE_BUCKET
        ? { storageBucket: process.env.STORAGE_BUCKET }
        : {}),
      ...(credential ? { credential } : {}),
    });
  }
  return firebaseApp;
}

function getDb(): Firestore {
  const databaseId = process.env.FIRESTORE_DATABASE_ID?.trim();
  return databaseId
    ? getFirestore(getConfiguredApp(), databaseId)
    : getFirestore(getConfiguredApp());
}

function hasFirebaseProject(): boolean {
  return Boolean(
    process.env.PROJECT_ID ||
      process.env.GCLOUD_PROJECT ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.FIRESTORE_EMULATOR_HOST,
  );
}

function sendFirebaseError(res: Response, error: unknown) {
  console.error('[firebase]', error);
  res.set('Vercel-CDN-Cache-Control', 'no-store');
  const message = error instanceof Error ? error.message : '';
  if (message.includes('RESOURCE_EXHAUSTED') || message.includes('Quota')) {
    res.status(503).json({
      error: 'Quota Firestore journalier atteint. Réessayez après la réinitialisation (minuit, heure du Pacifique).',
    });
    return;
  }
  if (message.includes('bucket does not exist')) {
    res.status(503).json({
      error: 'Le bucket Cloud Storage n’existe pas. Activez Storage dans la console Firebase et vérifiez STORAGE_BUCKET.',
    });
    return;
  }
  res.status(503).json({
    error: 'Le service Firebase est indisponible. Vérifiez la configuration du projet.',
  });
}

async function requireAdmin(req: Request, res: Response): Promise<boolean> {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!adminEmail) {
    res.status(503).json({ error: 'L’adresse administrateur n’est pas encore configurée.' });
    return false;
  }

  const authorization = req.header('authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) {
    res.status(401).json({ error: 'Connexion administrateur requise.' });
    return false;
  }

  try {
    const decoded = await getAuth(getConfiguredApp()).verifyIdToken(token);
    if (decoded.email?.toLowerCase() !== adminEmail) {
      res.status(403).json({ error: 'Accès réservé à l’administrateur autorisé.' });
      return false;
    }
    return true;
  } catch (error) {
    console.warn('[admin-auth] Token Firebase refusé.', error);
    res.status(401).json({ error: 'Session invalide. Reconnectez-vous.' });
    return false;
  }
}

async function requireSignedInUser(req: Request, res: Response): Promise<DecodedIdToken | null> {
  const authorization = req.header('authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) {
    res.status(401).json({ error: 'Connexion requise pour accéder au profil.' });
    return null;
  }

  try {
    const decoded = await getAuth(getConfiguredApp()).verifyIdToken(token);
    if (decoded.firebase.sign_in_provider === 'anonymous') {
      res.status(403).json({ error: 'Connectez-vous avec un compte pour accéder au profil.' });
      return null;
    }
    return decoded;
  } catch (error) {
    console.warn('[profile-auth] Token Firebase refusé.', error);
    res.status(401).json({ error: 'Session invalide. Reconnectez-vous.' });
    return null;
  }
}

/** The signed-in account behind a request, or null for a guest (never answers the request). */
async function optionalSignedInUser(req: Request): Promise<DecodedIdToken | null> {
  const authorization = req.header('authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return null;
  try {
    const decoded = await getAuth(getConfiguredApp()).verifyIdToken(token);
    return decoded.firebase.sign_in_provider === 'anonymous' ? null : decoded;
  } catch {
    return null;
  }
}

function isValidProfileInput(value: unknown): value is {
  firstName: string;
  lastName: string;
  address: string;
  city: string;
  country: string;
  phone: string;
} {
  if (!value || typeof value !== 'object') return false;
  const profile = value as Record<string, unknown>;
  return (
    typeof profile.firstName === 'string' &&
    profile.firstName.trim().length > 0 &&
    profile.firstName.length <= 100 &&
    typeof profile.lastName === 'string' &&
    profile.lastName.trim().length > 0 &&
    profile.lastName.length <= 100 &&
    typeof profile.address === 'string' &&
    profile.address.trim().length > 0 &&
    profile.address.length <= 300 &&
    typeof profile.city === 'string' &&
    profile.city.trim().length > 0 &&
    profile.city.length <= 100 &&
    typeof profile.country === 'string' &&
    profile.country.trim().length > 0 &&
    profile.country.length <= 100 &&
    typeof profile.phone === 'string' &&
    profile.phone.trim().length > 0 &&
    profile.phone.length <= 40
  );
}

function asIsoDate(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

function isValidProduct(value: unknown): value is Product {
  if (!value || typeof value !== 'object') return false;
  const product = value as Partial<Product>;
  const validImages = product.images === undefined || (
    Array.isArray(product.images) &&
    product.images.every((image) => typeof image === 'string')
  );
  return (
    typeof product.id === 'string' &&
    typeof product.name === 'string' &&
    typeof product.slug === 'string' &&
    typeof product.description === 'string' &&
    typeof product.longDescription === 'string' &&
    typeof product.price === 'number' &&
    Number.isFinite(product.price) &&
    product.price >= 0 &&
    (product.category === 'ready' || product.category === 'customizable') &&
    typeof product.material === 'string' &&
    Array.isArray(product.colors) &&
    product.colors.every((color) => typeof color === 'string') &&
    typeof product.imageGradient === 'string' &&
    validImages &&
    Array.isArray(product.tags) &&
    product.tags.every((tag) => typeof tag === 'string') &&
    (product.active === undefined || typeof product.active === 'boolean')
  );
}

function isValidOptionCategory(value: unknown): value is ProductOptionCategory {
  if (!value || typeof value !== 'object') return false;
  const category = value as Partial<ProductOptionCategory>;
  const type = category.type ?? 'values';
  return (
    typeof category.id === 'string' &&
    /^[a-z0-9-]{1,120}$/.test(category.id) &&
    typeof category.title === 'string' &&
    category.title.trim().length > 0 &&
    category.title.length <= 120 &&
    (type === 'values' || type === 'text' || type === 'image') &&
    (category.productCategories === undefined || (
      Array.isArray(category.productCategories) &&
      category.productCategories.length > 0 &&
      category.productCategories.every((productCategory) => (
        productCategory === 'ready' || productCategory === 'customizable'
      )) &&
      new Set(category.productCategories).size === category.productCategories.length
    )) &&
    Array.isArray(category.values) &&
    (type === 'values' ? category.values.length > 0 && category.values.length <= 50 && category.values.every((option) => (
      Boolean(option) &&
      typeof option.id === 'string' &&
      /^[a-zA-Z0-9_-]{1,80}$/.test(option.id) &&
      typeof option.label === 'string' &&
      option.label.trim().length > 0 &&
      option.label.length <= 120 &&
      (option.imageUrl === undefined || isValidOptionImage(option.imageUrl)) &&
      (option.price === undefined || isValidPrice(option.price))
  )) : true) &&
    (category.pricedValues === undefined || typeof category.pricedValues === 'boolean')
  );
}

function isColorOptionCategory(category: ProductOptionCategory) {
  if (category.type !== undefined && category.type !== 'values') return false;
  const key = `${category.id} ${category.title}`.toLowerCase();
  return key.includes('couleur') || key.includes('color');
}

/** Extra price of one option value, or 0 when the category has no priced values. */
function optionValuePrice(category: ProductOptionCategory, value: ProductOptionValue | undefined) {
  if (!category.pricedValues || !value || !isValidPrice(value.price)) return 0;
  return value.price;
}

/**
 * Sum of the extra prices of the chosen option values, recomputed from the catalogue:
 * the price sent by the browser is never trusted.
 */
function optionsSurcharge(product: Product, customization: unknown, categories: ProductOptionCategory[]) {
  if (!customization || typeof customization !== 'object') return 0;
  const { color, options } = customization as { color?: unknown; options?: unknown };
  const applicable = categories.filter(
    (category) => category.productCategories?.includes(product.category) ?? true,
  );
  let surcharge = 0;
  const counted = new Set<string>();
  if (Array.isArray(options)) {
    for (const option of options) {
      if (!option || typeof option !== 'object') continue;
      const { categoryId, value, valueId } = option as { categoryId?: unknown; value?: unknown; valueId?: unknown };
      const category = applicable.find((item) => item.id === categoryId);
      if (!category || counted.has(category.id)) continue;
      counted.add(category.id);
      const chosen = category.values.find((item) => item.id === valueId)
        ?? category.values.find((item) => item.label === value);
      surcharge += optionValuePrice(category, chosen);
    }
  }
  if (typeof color === 'string' && color) {
    const colorCategory = applicable.find(isColorOptionCategory);
    if (colorCategory && !counted.has(colorCategory.id)) {
      surcharge += optionValuePrice(colorCategory, colorCategory.values.find((item) => item.label === color));
    }
  }
  return surcharge;
}

// Images are stored inline as base64 data URLs (≤ 500 Ko binary ≈ 700 Ko encoded).
const MAX_OPTION_IMAGE_LENGTH = 700 * 1024;
const optionImagePattern = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;

function isValidOptionImage(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    value.length <= MAX_OPTION_IMAGE_LENGTH &&
    (optionImagePattern.test(value) || value.startsWith('https://'))
  );
}

const imageUploadParser = express.raw({
  type: ['image/jpeg', 'image/png', 'image/webp'],
  limit: '5mb',
});

async function uploadAdminImage(req: Request, res: Response, folder: string) {
  const contentType = req.header('content-type');
  const extensionByType: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  if (
    !contentType ||
    !extensionByType[contentType] ||
    !Buffer.isBuffer(req.body) ||
    req.body.length === 0
  ) {
    res.status(400).json({ error: 'Choisissez une image JPEG, PNG ou WebP valide.' });
    return;
  }

  try {
    const url = await storeImage(req.body, contentType, folder);
    res.status(201).json({ url });
  } catch (error) {
    sendFirebaseError(res, error);
  }
}

// ---------- Images: Vercel Blob instead of base64 inside Firestore documents ----------
// Inline images made every product read cost ~400 Ko; stored as files they are served by a CDN
// and the Firestore documents stay a few Ko.
const blobEnabled = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const dataUrlPattern = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+=*)$/;

async function storeImage(bytes: Buffer, contentType: string, folder: string): Promise<string> {
  const extension = contentType === 'image/jpeg' ? 'jpg' : contentType.slice('image/'.length);
  // Content-addressed name: saving the same image twice reuses the same file.
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 20);
  const { url } = await put(`${folder}/${hash}.${extension}`, bytes, {
    access: 'public',
    contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 365 * 24 * 60 * 60,
  });
  return url;
}

/** Replaces a base64 data URL by a Blob file URL; any other value is returned unchanged. */
async function externalizeImage(value: string, folder: string): Promise<string> {
  const match = blobEnabled ? dataUrlPattern.exec(value) : null;
  if (!match) return value;
  return storeImage(Buffer.from(match[2], 'base64'), match[1], folder);
}

async function withStoredProductImages<P extends { id: string; images?: string[] }>(product: P): Promise<P> {
  if (!product.images?.length) return product;
  const folder = `products/${product.id}`;
  return { ...product, images: await Promise.all(product.images.map((image) => externalizeImage(image, folder))) };
}

async function withStoredOptionImages(category: ProductOptionCategory): Promise<ProductOptionCategory> {
  const folder = `options/${category.id}`;
  return {
    ...category,
    values: await Promise.all(category.values.map(async (value) => (
      value.imageUrl ? { ...value, imageUrl: await externalizeImage(value.imageUrl, folder) } : value
    ))),
  };
}

function isValidService(value: unknown): value is Service {
  if (!value || typeof value !== 'object') return false;
  const service = value as Partial<Service>;
  return (
    typeof service.id === 'string' &&
    typeof service.title === 'string' &&
    typeof service.summary === 'string' &&
    Array.isArray(service.details) &&
    service.details.every((detail) => typeof detail === 'string') &&
    typeof service.fromPrice === 'number' &&
    Number.isFinite(service.fromPrice) &&
    service.fromPrice >= 0 &&
    typeof service.unit === 'string' &&
    typeof service.icon === 'string'
  );
}

// Catalogue caches: each collection is read from Firestore once, then kept in memory.
// Several servers write to the same Firestore (Vercel API, local dev API): every write records
// a new version of the collection in one small document, which each server checks at most once
// a minute, and a collection is reloaded only when its version changed.
const onVercel = Boolean(process.env.VERCEL);
const runInBackground = (task: Promise<unknown>) => {
  if (onVercel) waitUntil(task);
};
const VERSION_CHECK_MS = 60_000;
const versionsDoc = () => getDb().collection('_meta').doc('cacheVersions');
let knownVersions: { at: number; values: Record<string, string> } | null = null;
let versionsRead: Promise<Record<string, string>> | null = null;

const cacheVersions: VersionSource = {
  current() {
    if (knownVersions && Date.now() - knownVersions.at < VERSION_CHECK_MS) {
      return Promise.resolve(knownVersions.values);
    }
    versionsRead ??= versionsDoc()
      .get()
      .then((snapshot) => {
        const values = (snapshot.data() ?? {}) as Record<string, string>;
        knownVersions = { at: Date.now(), values };
        return values;
      })
      .finally(() => {
        versionsRead = null;
      });
    return versionsRead;
  },
  bump(name) {
    const version = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    if (knownVersions) knownVersions.values = { ...knownVersions.values, [name]: version };
    const write = versionsDoc()
      .set({ [name]: version }, { merge: true })
      .catch((error: unknown) => console.warn(`[cache] ${name}: version non enregistrée.`, error));
    runInBackground(write);
    return version;
  },
};

// On Vercel, instances also share their copies through the Runtime Cache, so a cold start
// does not read Firestore when the collection has not changed.
const sharedStore: SharedStore | null = onVercel
  ? {
      get: (key) => getCache().get(key),
      set: (key, value) => getCache().set(key, value, { ttl: 30 * 24 * 60 * 60 }),
      delete: (key) => getCache().delete(key),
      background: runInBackground,
    }
  : null;
const cacheOptions = { versions: cacheVersions, shared: sharedStore };

function toIsoDate(value: unknown): string | undefined {
  return value instanceof Timestamp ? value.toDate().toISOString() : undefined;
}

const productsCache = new CatalogueCache<Product>('products', cacheOptions, async () => {
  const snapshot = await getDb().collection('products').get();
  const list: Product[] = [];
  snapshot.docs.forEach((doc) => {
    const data = doc.data();
    if (!data.deletedAt && !data.deleted) {
      const { createdAt, updatedAt, ...fields } = data;
      const item = {
        ...fields,
        id: data.id || doc.id,
        active: data.active !== false,
        createdAt: toIsoDate(createdAt) ?? toIsoDate(updatedAt),
      } as Product;
      if (isValidProduct(item)) {
        list.push(item);
      }
    }
  });
  return list;
});

// ---------- Transporteurs & livraison ----------
interface CarrierZone {
  id: string;
  /** Villes desservies au même prix, ex. ["Rabat", "Salé", "Témara"]. */
  cities: string[];
  /** Frais de livraison pour toutes les villes de la zone (MAD). */
  price: number;
  /** Délai propre à la zone ; vide = délai par défaut du transporteur. */
  delay: string;
}

interface Carrier {
  id: string;
  name: string;
  description: string;
  /** Délai par défaut affiché au client, ex. « 24 à 48 h ». */
  delay: string;
  /** Livraison offerte à partir de ce montant de panier (MAD), null = jamais. */
  freeFrom: number | null;
  /** Zones tarifaires : chaque zone regroupe des villes au même prix. */
  zones: CarrierZone[];
  /** Lien de suivi, {tracking} est remplacé par le numéro de colis. */
  trackingUrl: string;
  active: boolean;
}

const MAX_CARRIER_ZONES = 500;
const MAX_CARRIER_CITIES = 3000;

function isValidPrice(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100000;
}

function isValidCarrierZone(value: unknown): value is CarrierZone {
  if (!value || typeof value !== 'object') return false;
  const zone = value as Partial<CarrierZone>;
  return (
    typeof zone.id === 'string' && zone.id.length > 0 && zone.id.length <= 80 &&
    Array.isArray(zone.cities) && zone.cities.length > 0 && zone.cities.length <= MAX_CARRIER_CITIES &&
    zone.cities.every((city) => typeof city === 'string' && city.trim().length > 0 && city.length <= 120) &&
    isValidPrice(zone.price) &&
    typeof zone.delay === 'string' && zone.delay.length <= 120
  );
}

function isValidCarrier(value: unknown): value is Carrier {
  if (!value || typeof value !== 'object') return false;
  const c = value as Partial<Carrier>;
  if (!(Array.isArray(c.zones) && c.zones.length <= MAX_CARRIER_ZONES && c.zones.every(isValidCarrierZone))) {
    return false;
  }
  // A city may belong to only one zone of a carrier.
  const cities = c.zones.flatMap((zone) => zone.cities.map((city) => city.trim().toLowerCase()));
  return (
    cities.length <= MAX_CARRIER_CITIES &&
    new Set(cities).size === cities.length &&
    typeof c.id === 'string' && /^[a-z0-9-]{1,80}$/.test(c.id) &&
    typeof c.name === 'string' && c.name.trim().length > 0 && c.name.length <= 120 &&
    typeof c.description === 'string' && c.description.length <= 1000 &&
    typeof c.delay === 'string' && c.delay.length <= 120 &&
    (c.freeFrom === null || isValidPrice(c.freeFrom)) &&
    typeof c.trackingUrl === 'string' && c.trackingUrl.length <= 500 &&
    typeof c.active === 'boolean'
  );
}

function toCarrier(body: Carrier): Carrier {
  return {
    id: body.id,
    name: body.name.trim(),
    description: body.description.trim(),
    delay: body.delay.trim(),
    freeFrom: body.freeFrom,
    zones: body.zones.map((zone) => ({
      id: zone.id,
      cities: zone.cities.map((city) => city.trim()),
      price: zone.price,
      delay: zone.delay.trim(),
    })),
    trackingUrl: body.trackingUrl.trim(),
    active: body.active,
  };
}

/**
 * Converts carriers saved with earlier formats:
 * v1 = one carrier price + list of city names; v2 = one city per zone ({ name, price, delay }).
 */
function migrateCarrier(raw: Record<string, unknown>): Carrier | null {
  const zones = Array.isArray(raw.zones) ? raw.zones as unknown[] : [];
  let migratedZones: unknown[] = zones;
  if (zones.some((zone) => typeof zone === 'string') || (zones.length === 0 && 'price' in raw)) {
    const cities = (zones.length ? zones : ['Tout le Maroc'])
      .filter((zone): zone is string => typeof zone === 'string' && zone.trim().length > 0);
    migratedZones = [{ id: randomUUID(), cities, price: isValidPrice(raw.price) ? raw.price : 0, delay: '' }];
  } else {
    migratedZones = zones.map((zone) => {
      const z = (zone ?? {}) as Record<string, unknown>;
      return Array.isArray(z.cities) ? z : { ...z, cities: typeof z.name === 'string' ? [z.name] : [] };
    });
  }
  const candidate = {
    id: raw.id,
    name: raw.name,
    description: typeof raw.description === 'string' ? raw.description : '',
    delay: typeof raw.delay === 'string' ? raw.delay : '',
    freeFrom: raw.freeFrom ?? null,
    zones: migratedZones,
    trackingUrl: typeof raw.trackingUrl === 'string' ? raw.trackingUrl : '',
    active: raw.active !== false,
  };
  return isValidCarrier(candidate) ? toCarrier(candidate) : null;
}

const carriersCache = new CatalogueCache<Carrier>('carriers', cacheOptions, async () => {
  const snapshot = await getDb().collection('Carriers').get();
  const list: Carrier[] = [];
  snapshot.docs.forEach((doc) => {
    const carrier = migrateCarrier({ ...doc.data(), id: doc.id });
    if (carrier) list.push(carrier);
  });
  return list;
});

/** City name compared without accents, case or punctuation ("Fès" = "fes", "Salé" = "SALE"). */
function normalizeCity(city: string) {
  return city.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Delivery price and delay of a carrier for a city and a cart subtotal,
 * or null when the carrier does not serve that city.
 */
function shippingQuote(carrier: Carrier, city: string, subtotal: number) {
  const wanted = normalizeCity(city);
  if (!wanted) return null;
  const zone = carrier.zones.find((item) => item.cities.some((name) => normalizeCity(name) === wanted));
  if (!zone) return null;
  const free = carrier.freeFrom !== null && subtotal >= carrier.freeFrom;
  return { price: free ? 0 : zone.price, delay: zone.delay || carrier.delay };
}

/** Cached carriers, normalised (the on-disk copy may still hold the first format). */
async function listCarriers(): Promise<Carrier[]> {
  return (await carriersCache.list())
    .map((carrier) => migrateCarrier(carrier as unknown as Record<string, unknown>))
    .filter((carrier): carrier is Carrier => carrier !== null)
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

type StoredService = Service & { active?: boolean };

const servicesCache = new CatalogueCache<StoredService>('services', cacheOptions, async () => {
  const snapshot = await getDb().collection('services').get();
  const stored: StoredService[] = [];
  snapshot.docs.forEach((doc) => {
    const data = doc.data();
    if (data.active === false) {
      const base = defaultServices.find((service) => service.id === doc.id);
      if (base) stored.push({ ...base, active: false });
    } else if (isValidService(data)) {
      stored.push({ ...data, id: doc.id });
    }
  });
  return stored;
});

const optionsCache = new CatalogueCache<ProductOptionCategory>('options', cacheOptions, async () => {
  const snapshot = await getDb().collection('Options').get();
  return snapshot.docs.map((doc) => doc.data()).filter(isValidOptionCategory);
});

// Orders and quotes: dates are stored as ISO strings so the cache survives JSON persistence.
type StoredRecord = Record<string, unknown> & { id: string; createdAt: string | null };

function toStoredRecord(id: string, data: Record<string, unknown>): StoredRecord {
  return { ...data, id, createdAt: asIsoDate(data.createdAt) };
}

function newestFirst(records: StoredRecord[]): StoredRecord[] {
  return [...records].sort((left, right) => (right.createdAt ?? '').localeCompare(left.createdAt ?? ''));
}

const ordersCache = new CatalogueCache<StoredRecord>('orders', cacheOptions, async () => {
  const snapshot = await getDb().collection('orders').orderBy('createdAt', 'desc').limit(500).get();
  return snapshot.docs.map((doc) => toStoredRecord(doc.id, doc.data()));
});

const quotesCache = new CatalogueCache<StoredRecord>('quotes', cacheOptions, async () => {
  const snapshot = await getDb().collection('quotes').orderBy('createdAt', 'desc').limit(500).get();
  return snapshot.docs.map((doc) => toStoredRecord(doc.id, doc.data()));
});

// ---------- Charges (dépenses de l'atelier) ----------
const EXPENSE_CATEGORIES = new Set([
  'matieres', 'consommables', 'electricite', 'entretien', 'materiel',
  'emballage', 'transport', 'loyer', 'telecom', 'publicite', 'autre',
]);
const EXPENSE_PAYMENTS = new Set(['especes', 'carte', 'virement', 'cheque', 'autre']);

interface Expense {
  id: string;
  /** Day of the expense, YYYY-MM-DD. */
  date: string;
  category: string;
  label: string;
  amount: number;
  paymentMethod: string;
  note: string;
}

function parseExpense(body: unknown, id: string): Expense | null {
  if (!body || typeof body !== 'object') return null;
  const e = body as Record<string, unknown>;
  const date = typeof e.date === 'string' ? e.date : '';
  const amount = typeof e.amount === 'number' ? Math.round(e.amount * 100) / 100 : NaN;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) ||
    typeof e.category !== 'string' || !EXPENSE_CATEGORIES.has(e.category) ||
    typeof e.label !== 'string' || !e.label.trim() || e.label.length > 160 ||
    !Number.isFinite(amount) || amount <= 0 || amount > 10_000_000 ||
    (e.paymentMethod !== undefined && (typeof e.paymentMethod !== 'string' || !EXPENSE_PAYMENTS.has(e.paymentMethod))) ||
    (e.note !== undefined && (typeof e.note !== 'string' || e.note.length > 1000))
  ) return null;
  return {
    id,
    date,
    category: e.category,
    label: e.label.trim(),
    amount,
    paymentMethod: (e.paymentMethod as string | undefined) ?? 'autre',
    note: ((e.note as string | undefined) ?? '').trim(),
  };
}

const expensesCache = new CatalogueCache<StoredRecord>('expenses', cacheOptions, async () => {
  const snapshot = await getDb().collection('Expenses').orderBy('date', 'desc').limit(2000).get();
  return snapshot.docs.map((doc) => toStoredRecord(doc.id, doc.data()));
});

// Customer reviews of the home page ("Ils nous recommandent"), managed in the Admin.
interface Testimonial {
  id: string;
  name: string;
  place: string;
  text: string;
  rating: number;
  published: boolean;
  /** Display order (smallest first). */
  order: number;
}

function parseTestimonial(value: unknown, id: string): Testimonial | null {
  if (!value || typeof value !== 'object') return null;
  const t = value as Record<string, unknown>;
  const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim().length <= max ? v.trim() : null);
  const name = text(t.name, 80);
  const place = text(t.place ?? '', 80);
  const body = text(t.text, 600);
  const rating = Number(t.rating);
  if (!name || place === null || !body || !Number.isInteger(rating) || rating < 1 || rating > 5) return null;
  return {
    id,
    name,
    place,
    text: body,
    rating,
    published: t.published === true,
    order: Number.isFinite(Number(t.order)) ? Number(t.order) : Date.now(),
  };
}

const testimonialsCache = new CatalogueCache<Testimonial>('testimonials', cacheOptions, async () => {
  const snapshot = await getDb().collection('Testimonials').get();
  return snapshot.docs
    .map((doc) => parseTestimonial(doc.data(), doc.id))
    .filter((item): item is Testimonial => item !== null);
});

const byDisplayOrder = (a: Testimonial, b: Testimonial) => a.order - b.order;

interface StoredProfile {
  id: string;
  firstName: string;
  lastName: string;
  address: string;
  city: string;
  country: string;
  phone: string;
  email: string;
}

function toStoredProfile(id: string, data: Record<string, unknown>, email: string): StoredProfile {
  const text = (value: unknown) => (typeof value === 'string' ? value : '');
  return {
    id,
    firstName: text(data.firstName),
    lastName: text(data.lastName),
    address: text(data.address),
    city: text(data.city),
    country: text(data.country),
    phone: text(data.phone),
    email: text(data.email) || email,
  };
}

// Whole Users collection is read once; profile reads then never touch Firestore.
const profilesCache = new CatalogueCache<StoredProfile>('profiles', cacheOptions, async () => {
  const snapshot = await getDb().collection('Users').get();
  return snapshot.docs.map((doc) => toStoredProfile(doc.id, doc.data(), ''));
});

/**
 * An order placed with an account shows the account's current details (name, phone, address,
 * city), so a profile change is seen everywhere. Empty profile fields keep the order's value.
 */
function withCurrentCustomer<T extends Record<string, unknown>>(order: T, profiles: Map<string, StoredProfile>): T {
  const profile = typeof order.uid === 'string' ? profiles.get(order.uid) : undefined;
  if (!profile) return order;
  const customer = (order.customer ?? {}) as Record<string, unknown>;
  const name = `${profile.firstName} ${profile.lastName}`.trim();
  return {
    ...order,
    customer: {
      ...customer,
      ...(name ? { name } : {}),
      ...(profile.phone ? { phone: profile.phone } : {}),
      ...(profile.address ? { address: profile.address } : {}),
      ...(profile.city ? { city: profile.city } : {}),
    },
  };
}

async function profilesById(): Promise<Map<string, StoredProfile>> {
  try {
    return new Map((await profilesCache.list()).map((profile) => [profile.id, profile]));
  } catch {
    return new Map();
  }
}

async function listProducts(): Promise<Product[]> {
  if (!hasFirebaseProject()) return defaultProducts;
  try {
    return await productsCache.list();
  } catch (error) {
    console.warn('[firebase] Firestore indisponible, utilisation des produits par défaut.', error);
    return defaultProducts;
  }
}

// Listing responses only need the cover image; the full gallery is served by the detail endpoint.
function toProductSummary(product: Product): Product {
  const images = product.images ?? [];
  // Inline (base64) photos are heavy: only the first one goes in the list.
  const hasInlineImages = images.some((image) => image.startsWith('data:'));
  return { ...product, images: hasInlineImages ? images.slice(0, 1) : images };
}

async function listServices(): Promise<Service[]> {
  if (!hasFirebaseProject()) return defaultServices;
  let stored: Array<Service & { active?: boolean }>;
  try {
    stored = await servicesCache.list();
  } catch (error) {
    console.warn('[firebase] Firestore indisponible, utilisation des services par défaut.', error);
    return defaultServices;
  }
  if (stored.length === 0) return defaultServices;

  const saved = new Map<string, Service>();
  const hidden = new Set<string>();
  stored.forEach((entry) => {
    if (entry.active === false) {
      hidden.add(entry.id);
    } else {
      const { active: _active, ...service } = entry;
      saved.set(entry.id, service);
    }
  });

  return [
    ...defaultServices
      .filter((service) => !hidden.has(service.id))
      .map((service) => saved.get(service.id) ?? service),
    ...[...saved.entries()]
      .filter(([id]) => !defaultServices.some((service) => service.id === id))
      .map(([, service]) => service),
  ];
}

async function listOptionCategories(): Promise<ProductOptionCategory[]> {
  if (!hasFirebaseProject()) return [];
  try {
    return (await optionsCache.list())
      .sort((left, right) => left.title.localeCompare(right.title, 'fr'));
  } catch (error) {
    console.warn('[firebase] Firestore indisponible, liste des options vide.', error);
    return [];
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, brand: '3alam3D' });
});

app.get('/api/profile', async (req, res) => {
  const user = await requireSignedInUser(req, res);
  if (!user) return;

  let stored: StoredProfile | undefined;
  try {
    stored = (await profilesCache.list()).find((profile) => profile.id === user.uid);
    if (!stored) {
      // Direct Firestore fallback: try both 'Users' and 'users' collections
      for (const coll of ['Users', 'users']) {
        try {
          const docSnap = await getDb().collection(coll).doc(user.uid).get();
          if (docSnap.exists) {
            const data = docSnap.data();
            if (data) {
              stored = toStoredProfile(user.uid, data, user.email ?? '');
              profilesCache.remember(stored);
              break;
            }
          }
        } catch {
          // ignore and try next collection
        }
      }
    }
    if (!stored) {
      // Account without a "Users" document (its sign-up could not save it): create it now,
      // so every account appears in the collection with what Firebase Auth knows.
      const [firstName = '', ...rest] = (typeof user.name === 'string' ? user.name : '').trim().split(/\s+/);
      stored = toStoredProfile(user.uid, { firstName, lastName: rest.join(' '), country: 'Maroc' }, user.email ?? '');
      const { id: _newId, ...fields } = stored;
      await getDb().collection('Users').doc(user.uid).set({
        ...fields,
        role: 'Utilisateur',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      profilesCache.upsert(stored);
    }
  } catch (error) {
    console.warn('[firebase] Firestore indisponible, profil vide.', error);
  }
  const { id: _id, ...profile } = stored ?? toStoredProfile(user.uid, {}, user.email ?? '');
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const role = (adminEmail && user.email?.toLowerCase() === adminEmail) ? 'Administrateur' : 'Utilisateur';

  res.json({ ...profile, email: user.email ?? profile.email, role });
});

app.put('/api/profile', async (req, res) => {
  const user = await requireSignedInUser(req, res);
  if (!user) return;
  if (!isValidProfileInput(req.body)) {
    res.status(400).json({ error: 'Vérifiez les informations du profil et réessayez.' });
    return;
  }

  try {
    const profile: StoredProfile = {
      id: user.uid,
      firstName: req.body.firstName.trim(),
      lastName: req.body.lastName.trim(),
      address: req.body.address.trim(),
      city: req.body.city.trim(),
      country: req.body.country.trim(),
      phone: req.body.phone.trim(),
      email: user.email ?? '',
    };
    const { id: _id, ...fields } = profile;
    // Existence is checked against the cache, so no read is needed before the write.
    let known = false;
    try {
      known = (await profilesCache.list()).some((entry) => entry.id === user.uid);
    } catch {
      known = false;
    }
    await getDb().collection('Users').doc(user.uid).set({
      ...fields,
      ...(known ? {} : { createdAt: FieldValue.serverTimestamp() }),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    profilesCache.upsert(profile);
    const updatedOrders = await syncOpenOrdersWithProfile(user.uid, profile);
    res.json({ ok: true, updatedOrders });
  } catch (error) {
    sendFirebaseError(res, error);
  }
});

/**
 * Copies the new contact details onto the customer's orders (all except the cancelled ones),
 * so the workshop and the invoices always use the account's current details.
 */
async function syncOpenOrdersWithProfile(uid: string, profile: StoredProfile): Promise<number> {
  try {
    const snapshot = await getDb().collection('orders').where('uid', '==', uid).get();
    const open = snapshot.docs.filter((doc) => {
      const order = doc.data();
      return order.status !== 'cancelled';
    });
    if (open.length === 0) return 0;
    const name = `${profile.firstName} ${profile.lastName}`.trim();
    const batch = getDb().batch();
    open.forEach((doc) => batch.update(doc.ref, {
      ...(name ? { 'customer.name': name } : {}),
      ...(profile.phone ? { 'customer.phone': profile.phone } : {}),
      ...(profile.address ? { 'customer.address': profile.address } : {}),
      ...(profile.city ? { 'customer.city': profile.city } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    }));
    await batch.commit();
    open.forEach((doc) => {
      const order = doc.data();
      ordersCache.upsert({
        ...toStoredRecord(doc.id, order),
        customer: {
          ...(order.customer ?? {}),
          ...(name ? { name } : {}),
          ...(profile.phone ? { phone: profile.phone } : {}),
          ...(profile.address ? { address: profile.address } : {}),
          ...(profile.city ? { city: profile.city } : {}),
        },
      });
    });
    return open.length;
  } catch (error) {
    // The profile itself is saved; the orders can still be corrected by the workshop.
    console.warn('[profile] Mise à jour des commandes impossible.', error);
    return 0;
  }
}

// ---------- Panier lié au compte ----------
// One Firestore document per cart line (Carts/{uid}/items/{lineId}) so that
// customer-uploaded option images never hit the 1 MB per-document limit.
const MAX_CART_LINES = 100;
const MAX_CART_LINE_BYTES = 900 * 1024;

interface StoredCartLine {
  productId: string;
  slug: string;
  name: string;
  price: number;
  quantity: number;
  imageGradient: string;
  imageUrl?: string;
  customization?: Record<string, unknown>;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function cartLineId(line: StoredCartLine) {
  return createHash('sha1')
    .update(`${line.productId}::${JSON.stringify(line.customization ?? {})}`)
    .digest('hex');
}

function toCartLine(value: unknown): StoredCartLine | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if (typeof item.productId !== 'string' || !item.productId || item.productId.length > 200) return null;
  if (typeof item.slug !== 'string' || typeof item.name !== 'string') return null;
  if (typeof item.price !== 'number' || !Number.isFinite(item.price) || item.price < 0) return null;
  if (typeof item.quantity !== 'number' || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 999) return null;
  if (item.customization !== undefined && (typeof item.customization !== 'object' || item.customization === null)) return null;
  const line: StoredCartLine = {
    productId: item.productId,
    slug: item.slug.slice(0, 200),
    name: item.name.slice(0, 300),
    price: item.price,
    quantity: item.quantity,
    imageGradient: typeof item.imageGradient === 'string' ? item.imageGradient.slice(0, 500) : '',
  };
  // Product photos are re-resolved from the catalogue on the client: only keep short URLs.
  if (typeof item.imageUrl === 'string' && item.imageUrl.length <= 2000 && !item.imageUrl.startsWith('data:')) {
    line.imageUrl = item.imageUrl;
  }
  if (item.customization) line.customization = item.customization as Record<string, unknown>;
  if (Buffer.byteLength(JSON.stringify(line)) > MAX_CART_LINE_BYTES) return null;
  return line;
}

app.get('/api/cart', async (req, res) => {
  const user = await requireSignedInUser(req, res);
  if (!user) return;
  try {
    const snapshot = await getDb().collection('Carts').doc(user.uid).collection('items').get();
    const items = snapshot.docs
      .map((doc) => doc.data() as StoredCartLine & { position?: number })
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map(({ position: _position, ...line }) => line);
    res.json({ items });
  } catch (error) {
    sendFirebaseError(res, error);
  }
});

// ---------- Wishlist: product ids, one Firestore document per account ----------
const MAX_WISHLIST_ITEMS = 200;
const wishlistDoc = (uid: string) => getDb().collection('Wishlists').doc(uid);

app.get('/api/wishlist', async (req, res) => {
  const user = await requireSignedInUser(req, res);
  if (!user) return;
  try {
    const snapshot = await wishlistDoc(user.uid).get();
    const productIds = snapshot.get('productIds');
    res.json({ productIds: Array.isArray(productIds) ? productIds : [] });
  } catch (error) {
    sendFirebaseError(res, error);
  }
});

// Notifications of the signed-in customer. ?unread=1 → only the unread ones (cheap poll).
app.get('/api/notifications', async (req, res) => {
  const user = await requireSignedInUser(req, res);
  if (!user) return;
  try {
    let query = getDb().collection('Notifications').where('uid', '==', user.uid);
    if (req.query.unread === '1') query = query.where('read', '==', false);
    const snapshot = await query.get();
    const list = snapshot.docs
      .map((doc) => {
        const { uid: _uid, ...data } = doc.data();
        return { id: doc.id, ...data } as Record<string, unknown> & { id: string; createdAt?: string };
      })
      .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
      .slice(0, 30);
    res.setHeader('Cache-Control', 'private, no-store');
    res.json(list);
  } catch (error) {
    sendFirebaseError(res, error);
  }
});

// Marks the customer's unread notifications as read.
app.post('/api/notifications/read', async (req, res) => {
  const user = await requireSignedInUser(req, res);
  if (!user) return;
  try {
    const snapshot = await getDb().collection('Notifications')
      .where('uid', '==', user.uid).where('read', '==', false).get();
    if (!snapshot.empty) {
      const batch = getDb().batch();
      snapshot.docs.forEach((doc) => batch.update(doc.ref, { read: true }));
      await batch.commit();
    }
    res.json({ ok: true, updated: snapshot.size });
  } catch (error) {
    sendFirebaseError(res, error);
  }
});

// Orders of the signed-in customer: those placed with the account, plus older ones
// sent with the same e-mail address when that address is verified.
app.get('/api/my-orders', async (req, res) => {
  const user = await requireSignedInUser(req, res);
  if (!user) return;
  const email = user.email_verified && user.email ? user.email.trim() : null;
  try {
    // Read straight from Firestore (a few documents): a status changed anywhere,
    // even in the Firebase console, is what the customer sees.
    const orders = getDb().collection('orders');
    const [byAccount, byEmail] = await Promise.all([
      orders.where('uid', '==', user.uid).get(),
      email ? orders.where('customer.email', '==', email).get() : Promise.resolve(null),
    ]);
    const found = new Map<string, StoredRecord>();
    byAccount.docs.forEach((doc) => found.set(doc.id, toStoredRecord(doc.id, doc.data())));
    byEmail?.docs.forEach((doc) => {
      if (!doc.get('uid')) found.set(doc.id, toStoredRecord(doc.id, doc.data()));
    });
    const mine = [...found.values()];
    res.setHeader('Cache-Control', 'private, no-store');
    const profiles = await profilesById();
    res.json(newestFirst(mine).map((order) => {
      const { id: _id, uid: _uid, ...rest } = withCurrentCustomer(order, profiles);
      return rest;
    }));
  } catch (error) {
    sendFirebaseError(res, error);
  }
});

app.put('/api/wishlist', async (req, res) => {
  const user = await requireSignedInUser(req, res);
  if (!user) return;
  const raw = req.body?.productIds;
  if (
    !Array.isArray(raw) ||
    raw.length > MAX_WISHLIST_ITEMS ||
    !raw.every((id) => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,120}$/.test(id))
  ) {
    res.status(400).json({ error: 'Liste de favoris invalide.' });
    return;
  }
  try {
    await wishlistDoc(user.uid).set({
      productIds: [...new Set(raw as string[])],
      updatedAt: FieldValue.serverTimestamp(),
    });
    res.json({ ok: true });
  } catch (error) {
    sendFirebaseError(res, error);
  }
});

app.put('/api/cart', async (req, res) => {
  const user = await requireSignedInUser(req, res);
  if (!user) return;
  const raw = req.body?.items;
  if (!Array.isArray(raw) || raw.length > MAX_CART_LINES) {
    res.status(400).json({ error: 'Panier invalide.' });
    return;
  }
  const lines = raw.map(toCartLine);
  if (lines.some((line) => line === null)) {
    res.status(400).json({ error: 'Un article du panier est invalide.' });
    return;
  }

  try {
    const itemsRef = getDb().collection('Carts').doc(user.uid).collection('items');
    const existing = await itemsRef.get();
    const previous = new Map(existing.docs.map((doc) => [doc.id, stableStringify(doc.data())]));
    const batch = getDb().batch();
    const kept = new Set<string>();
    (lines as StoredCartLine[]).forEach((line, position) => {
      const id = cartLineId(line);
      kept.add(id);
      const data = { ...line, position };
      // Only write lines that actually changed, to keep Firestore writes low.
      if (previous.get(id) !== stableStringify(data)) batch.set(itemsRef.doc(id), data);
    });
    existing.docs.forEach((doc) => {
      if (!kept.has(doc.id)) batch.delete(doc.ref);
    });
    await batch.commit();
    res.json({ ok: true });
  } catch (error) {
    sendFirebaseError(res, error);
  }
});

app.post('/api/register', async (req, res) => {
  // Only the new account itself may write its profile: the uid comes from its session token.
  const user = await requireSignedInUser(req, res);
  if (!user) return;
  const { uid } = user;
  const { firstName, lastName, phone, address, city, country } = req.body ?? {};
  const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

  const profileData = {
    firstName: text(firstName, 100),
    lastName: text(lastName, 100),
    email: user.email ?? '',
    phone: text(phone, 40),
    address: text(address, 300),
    city: text(city, 100),
    country: text(country, 100) || 'Maroc',
    role: 'Utilisateur',
  };

  try {
    const db = getDb();
    // Save to Firestore collection 'Users'
    await db.collection('Users').doc(uid).set({
      ...profileData,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    // Also update profiles cache so admin immediately sees the new user with name
    profilesCache.upsert({
      id: uid,
      ...profileData,
    });

    // Also update displayName in Firebase Auth if possible
    try {
      const auth = getAuth(getConfiguredApp());
      const fullName = `${profileData.firstName} ${profileData.lastName}`.trim();
      if (fullName) {
        await auth.updateUser(uid, { displayName: fullName });
      }
    } catch (authErr) {
      console.warn('[register] Impossible de mettre à jour le displayName Auth:', authErr);
    }

    res.status(201).json({ ok: true });
  } catch (error) {
    console.error('[register] Erreur lors de l’enregistrement dans Users:', error);
    sendFirebaseError(res, error);
  }
});

/**
 * JPEG copy of a stored image, for browsers that refuse WebP (Safari in Lockdown Mode, old iOS).
 * Only our own blob store is accepted; the CDN keeps each copy for a year (blob URLs never change).
 */
const BLOB_IMAGE_URL = /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\/[A-Za-z0-9/_.-]+\.(webp|png|jpe?g)$/;
app.get('/api/image.jpg', async (req, res) => {
  const src = typeof req.query.src === 'string' ? req.query.src : '';
  if (!BLOB_IMAGE_URL.test(src)) {
    res.status(400).json({ error: 'Image invalide.' });
    return;
  }
  try {
    const upstream = await fetch(src);
    if (!upstream.ok) {
      res.status(upstream.status === 404 ? 404 : 502).end();
      return;
    }
    const { default: sharp } = await import('sharp');
    const width = Math.min(Math.max(Number(req.query.w) || 1200, 64), 2000);
    const jpeg = await sharp(Buffer.from(await upstream.arrayBuffer()))
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.set('Vercel-CDN-Cache-Control', 'max-age=31536000, immutable');
    res.send(jpeg);
  } catch (error) {
    console.error('Conversion JPEG impossible.', error);
    res.status(502).end();
  }
});

app.get('/api/products', async (req, res) => {
  try {
    const { category, q } = req.query;
    let list = await listProducts();

    // Only active products are visible in the boutique
    list = list.filter((product) => product.active !== false);

    if (category === 'ready' || category === 'customizable') {
      list = list.filter((product) => product.category === category);
    }

    if (typeof q === 'string' && q.trim()) {
      const term = q.trim().toLowerCase();
      list = list.filter(
        (product) =>
          product.name.toLowerCase().includes(term) ||
          product.description.toLowerCase().includes(term) ||
          product.tags.some((tag) => tag.includes(term)),
      );
    }

    res.json(list.map(toProductSummary));
  } catch (error) {
    sendFirebaseError(res, error);
  }
});

app.get('/api/products/:slug', async (req, res) => {
  try {
    const product = (await listProducts()).find((item) => item.slug === req.params.slug && item.active !== false);
    if (!product) {
      res.status(404).json({ error: 'Produit introuvable' });
      return;
    }
    res.json(product);
  } catch (error) {
    sendFirebaseError(res, error);
  }
});

app.get('/api/options', async (_req, res) => {
  res.json(await listOptionCategories());
});

app.get('/api/services', async (_req, res) => {
  try {
    res.json(await listServices());
  } catch (error) {
    sendFirebaseError(res, error);
  }
});

app.get('/api/carriers', async (_req, res) => {
  try {
    res.json((await listCarriers()).filter((carrier) => carrier.active));
  } catch (error) {
    sendFirebaseError(res, error);
  }
});

app.get('/api/testimonials', async (_req, res) => {
  try {
    const list = (await testimonialsCache.list()).filter((item) => item.published).sort(byDisplayOrder);
    res.json(list.map(({ published: _published, order: _order, ...item }) => item));
  } catch (error) {
    console.warn('[testimonials] Lecture impossible.', error);
    res.json([]);
  }
});

app.post('/api/contact', (req, res) => {
  const { name, email, subject, message, serviceId } = req.body ?? {};

  if (!name || !email || !message) {
    res.status(400).json({ error: 'Nom, e-mail et message sont requis.' });
    return;
  }

  console.log('[contact]', { name, email, subject, serviceId, message });
  res.status(201).json({
    ok: true,
    message: 'Demande reçue. Nous vous répondons sous 24 h ouvrées.',
  });
});

app.post('/api/orders', async (req, res) => {
  const { items, customer, carrierId, paymentMethod } = req.body ?? {};
  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: 'Le panier est vide.' });
    return;
  }
  if (typeof customer?.name !== 'string' || typeof customer?.email !== 'string') {
    res.status(400).json({ error: 'Coordonnées client incomplètes.' });
    return;
  }
  const city = typeof customer.city === 'string' ? customer.city.trim().slice(0, 120) : '';
  if (paymentMethod !== 'cash_on_delivery' && paymentMethod !== 'bank_transfer') {
    res.status(400).json({ error: 'Choisissez un mode de paiement.' });
    return;
  }

  let products: Product[];
  let optionCategories: ProductOptionCategory[];
  let activeCarriers: Carrier[];
  try {
    let carriers: Carrier[];
    [products, optionCategories, carriers] = await Promise.all([
      listProducts(),
      listOptionCategories(),
      listCarriers(),
    ]);
    activeCarriers = carriers.filter((carrier) => carrier.active);
  } catch (error) {
    sendFirebaseError(res, error);
    return;
  }

  let orderItems: Array<{
    productId: string;
    slug: string;
    name: string;
    price: number;
    quantity: number;
    customization: object;
  }>;
  try {
    orderItems = items.map((item: unknown) => {
      if (!item || typeof item !== 'object') throw new Error('Article invalide.');
      const input = item as { productId?: unknown; quantity?: unknown; customization?: unknown };
      const product = products.find((entry) => entry.id === input.productId);
      if (
        !product ||
        product.active === false ||
        typeof input.quantity !== 'number' ||
        !Number.isInteger(input.quantity) ||
        input.quantity < 1 ||
        input.quantity > 99
      ) {
        throw new Error('Un article du panier n’est plus disponible.');
      }
      return {
        productId: product.id,
        slug: product.slug,
        name: product.name,
        price: product.price + optionsSurcharge(product, input.customization, optionCategories),
        quantity: input.quantity,
        customization:
          input.customization && typeof input.customization === 'object'
            ? input.customization
            : {},
      };
    });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Un article du panier est invalide.',
    });
    return;
  }

  const uploadedOptionImagesSize = orderItems.reduce((total, item) => {
    const options = (item.customization as { options?: unknown }).options;
    if (!Array.isArray(options)) return total;
    return total + options.reduce((size, option) => {
      if (!option || typeof option !== 'object') return size;
      const imageUrl = (option as { imageUrl?: unknown }).imageUrl;
      return typeof imageUrl === 'string' && imageUrl.startsWith('data:image/')
        ? size + imageUrl.length
        : size;
    }, 0);
  }, 0);
  if (uploadedOptionImagesSize > MAX_OPTION_IMAGE_LENGTH) {
    res.status(400).json({
      error: 'Le total des images téléversées dépasse la limite de 700 Ko par commande.',
    });
    return;
  }

  // Delivery: the carrier chosen by the customer, priced for their city (never trusted from the browser).
  const subtotal = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  let shipping: { carrierId: string; carrierName: string; price: number; delay: string } | null = null;
  if (activeCarriers.length > 0) {
    const carrier = activeCarriers.find((item) => item.id === carrierId);
    if (!carrier) {
      res.status(400).json({ error: 'Choisissez un transporteur.' });
      return;
    }
    if (!city) {
      res.status(400).json({ error: 'Indiquez votre ville de livraison.' });
      return;
    }
    const quote = shippingQuote(carrier, city, subtotal);
    if (!quote) {
      res.status(400).json({ error: `${carrier.name} ne livre pas à ${city}. Choisissez un autre transporteur ou vérifiez la ville.` });
      return;
    }
    shipping = { carrierId: carrier.id, carrierName: carrier.name, price: quote.price, delay: quote.delay };
  }

  // Orders placed while signed in are linked to the account ("Mes commandes").
  const account = await optionalSignedInUser(req);

  try {
    const orderId = `3A-${randomUUID().slice(0, 8).toUpperCase()}`;
    const total = subtotal + (shipping?.price ?? 0);
    const order = {
      orderId,
      uid: account?.uid ?? null,
      items: orderItems,
      customer: {
        name: customer.name.trim().slice(0, 120),
        email: customer.email.trim().slice(0, 254),
        phone: typeof customer.phone === 'string' ? customer.phone.slice(0, 40) : '',
        address: typeof customer.address === 'string' ? customer.address.trim().slice(0, 500) : '',
        city,
        note: typeof customer.note === 'string' ? customer.note.slice(0, 2000) : '',
      },
      subtotal,
      shipping,
      paymentMethod,
      total,
      status: 'pending',
    };
    await getDb().collection('orders').doc(orderId).set({ ...order, createdAt: FieldValue.serverTimestamp() });
    ordersCache.upsert({ ...order, id: orderId, createdAt: new Date().toISOString() });
    res.status(201).json({
      ok: true,
      orderId,
      message: paymentMethod === 'bank_transfer'
        ? `Commande ${orderId} enregistrée. L’atelier vous envoie ses coordonnées bancaires à ${customer.email} ; la commande sera préparée dès réception du virement.`
        : `Commande ${orderId} enregistrée. Vous paierez à la livraison ; l’atelier vous recontactera à ${customer.email}.`,
    });
  } catch (error) {
    sendFirebaseError(res, error);
  }
});

app.post('/api/quotes', async (req, res) => {
  const { name, email, message, filePath, fileName, fileSize } = req.body ?? {};
  if (
    typeof name !== 'string' ||
    !name.trim() ||
    typeof email !== 'string' ||
    !email.trim() ||
    typeof message !== 'string' ||
    !message.trim()
  ) {
    res.status(400).json({ error: 'Nom, e-mail et description du projet sont requis.' });
    return;
  }

  const hasFileDetails = filePath !== undefined || fileName !== undefined || fileSize !== undefined;
  if (
    hasFileDetails &&
    (typeof filePath !== 'string' ||
      typeof fileName !== 'string' ||
      typeof fileSize !== 'number' ||
      !Number.isInteger(fileSize) ||
      fileSize <= 0 ||
      fileSize > MAX_UPLOAD_BYTES)
  ) {
    res.status(400).json({ error: 'Le fichier doit être un STL ou OBJ valide de 50 Mo maximum.' });
    return;
  }

  const authorization = req.header('authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) {
    res.status(401).json({ error: 'Session de dépôt expirée. Réessayez.' });
    return;
  }

  let decoded: DecodedIdToken;
  try {
    decoded = await getAuth(getConfiguredApp()).verifyIdToken(token);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Firebase is not configured')) {
      sendFirebaseError(res, error);
      return;
    }
    console.warn('[quote-auth] Token Firebase refusé.', error);
    res.status(401).json({ error: 'Impossible de vérifier le dépôt. Réessayez.' });
    return;
  }

  if (typeof filePath === 'string') {
    const extension = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
    const uploadedName = filePath.split('/').pop();
    if (
      !allowedExtensions.has(extension) ||
      !uploadedName ||
      filePath !== `quotes/${decoded.uid}/${uploadedName}`
    ) {
      res.status(400).json({ error: 'Le fichier doit être un STL ou OBJ déposé dans votre espace.' });
      return;
    }

    let storedFileSize: number;
    let storedContentType: string | undefined;
    try {
      const file = getStorage(getConfiguredApp()).bucket().file(filePath);
      const [exists] = await file.exists();
      if (!exists) {
        res.status(400).json({ error: 'Le fichier envoyé est introuvable. Veuillez réessayer.' });
        return;
      }

      const [metadata] = await file.getMetadata();
      storedFileSize = Number(metadata.size);
      storedContentType = metadata.contentType;
    } catch (error) {
      sendFirebaseError(res, error);
      return;
    }
    if (
      storedFileSize > MAX_UPLOAD_BYTES ||
      storedFileSize !== fileSize ||
      storedContentType !== 'application/octet-stream'
    ) {
      res.status(400).json({ error: 'Le fichier ne respecte pas le format ou la taille autorisée.' });
      return;
    }
  }

  const quoteId = randomUUID();
  try {
    const quote = {
      quoteId,
      ownerUid: decoded.uid,
      name: name.trim().slice(0, 120),
      email: email.trim().slice(0, 254),
      message: message.trim().slice(0, 4000),
      ...(typeof filePath === 'string' ? { filePath } : {}),
      fileName: typeof fileName === 'string' ? fileName.slice(0, 180) : '',
      fileSize: typeof fileSize === 'number' ? fileSize : 0,
      status: 'new',
    };
    await getDb().collection('quotes').doc(quoteId).set({ ...quote, createdAt: FieldValue.serverTimestamp() });
    quotesCache.upsert({ ...quote, id: quoteId, createdAt: new Date().toISOString() });
    res.status(201).json({
      ok: true,
      quoteId,
      message: 'Votre demande de devis a bien été envoyée.',
    });
  } catch (error) {
    sendFirebaseError(res, error);
  }
});

app.use('/api/admin', async (req: Request, res: Response, next: NextFunction) => {
  if (!(await requireAdmin(req, res))) return;
  if (req.method !== 'GET') {
    // A successful admin change makes the CDN copies of the public catalogue stale.
    const json = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode < 400) {
        safely(() => invalidateByTag(CATALOGUE_CDN_TAG), 'purge du catalogue');
      }
      return json(body);
    };
  }
  next();
});

app.post('/api/admin/products/:id/images', imageUploadParser, async (req, res) => {
    if (!/^[a-z0-9-]{1,120}$/.test(req.params.id)) {
      res.status(400).json({ error: 'Identifiant de produit invalide.' });
      return;
    }
    await uploadAdminImage(req, res, `products/${req.params.id}`);
});

app.get('/api/admin/users', async (_req, res) => {
  try {
    const auth = getAuth(getConfiguredApp());
    const users = [];
    let pageToken: string | undefined;
    do {
      const page = await auth.listUsers(1000, pageToken);
      users.push(...page.users);
      pageToken = page.pageToken;
    } while (pageToken);

    // Load profiles from cache to get firstName/lastName
    let profiles: StoredProfile[] = [];
    try {
      profiles = await profilesCache.list();
    } catch {
      // profiles cache might not be primed yet
    }
    const profileMap = new Map(profiles.map((p) => [p.id, p]));

    // Check Firestore directly for any user not present in profileMap
    const missingUids = users.filter((u) => !profileMap.has(u.uid)).map((u) => u.uid);
    if (missingUids.length > 0) {
      try {
        const db = getDb();
        await Promise.all(missingUids.map(async (uid) => {
          try {
            let docSnap = await db.collection('Users').doc(uid).get();
            if (!docSnap.exists) {
              docSnap = await db.collection('users').doc(uid).get();
            }
            if (docSnap.exists) {
              const data = docSnap.data();
              if (data) {
                const loadedProfile = toStoredProfile(uid, data, '');
                profileMap.set(uid, loadedProfile);
                profilesCache.remember(loadedProfile);
              }
            }
          } catch {
            // ignore
          }
        }));
      } catch (err) {
        console.warn('[admin-users] Fallback profile load failed:', err);
      }
    }

    const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();

    res.json(users.map((user) => {
      const profile = profileMap.get(user.uid);
      const firstName = profile?.firstName?.trim() ?? '';
      const lastName = profile?.lastName?.trim() ?? '';
      const fullName = (firstName || lastName) ? `${firstName} ${lastName}`.trim() : user.displayName ?? user.email ?? '';
      const isAdmin = adminEmail && user.email?.toLowerCase() === adminEmail;

      return {
        uid: user.uid,
        email: user.email ?? '',
        displayName: user.displayName ?? '',
        firstName,
        lastName,
        fullName,
        phone: profile?.phone ?? '',
        address: profile?.address ?? '',
        city: profile?.city ?? '',
        country: profile?.country ?? '',
        role: isAdmin ? 'Administrateur' : 'Utilisateur',
        emailVerified: user.emailVerified,
        disabled: user.disabled,
        createdAt: user.metadata.creationTime ?? null,
        lastSignInAt: user.metadata.lastSignInTime ?? null,
      };
    }));
  } catch (error) {
    sendFirebaseError(res, error);
  }
});

app.patch('/api/admin/users/:uid', async (req, res) => {
  if (typeof req.body?.disabled !== 'boolean') {
    res.status(400).json({ error: 'Le statut du compte est invalide.' });
    return;
  }
  try {
    const auth = getAuth(getConfiguredApp());
    const user = await auth.getUser(req.params.uid);
    const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    if (user.email?.toLowerCase() === adminEmail) {
      res.status(400).json({ error: 'Le compte administrateur principal ne peut pas être désactivé.' });
      return;
    }
    await auth.updateUser(user.uid, { disabled: req.body.disabled });
    res.json({ ok: true });
  } catch (error) {
    sendFirebaseError(res, error);
  }
});

/** The administrator edits a customer's details (same fields as "Mon profil", all but the name optional). */
app.put('/api/admin/users/:uid', async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const limits = { firstName: 100, lastName: 100, phone: 40, address: 300, city: 100, country: 100 } as const;
  const fields = {} as Record<keyof typeof limits, string>;
  for (const [key, max] of Object.entries(limits) as Array<[keyof typeof limits, number]>) {
    const value = body[key] ?? '';
    if (typeof value !== 'string' || value.length > max) {
      res.status(400).json({ error: 'Vérifiez les informations du compte.' });
      return;
    }
    fields[key] = value.trim();
  }
  if (!fields.firstName || !fields.lastName) {
    res.status(400).json({ error: 'Le prénom et le nom sont obligatoires.' });
    return;
  }
  try {
    const user = await getAuth(getConfiguredApp()).getUser(req.params.uid);
    const profile: StoredProfile = { id: user.uid, ...fields, email: user.email ?? '' };
    const { id: _id, ...stored } = profile;
    await getDb().collection('Users').doc(user.uid).set(
      { ...stored, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    profilesCache.upsert(profile);
    const updatedOrders = await syncOpenOrdersWithProfile(user.uid, profile);
    res.json({ ok: true, updatedOrders });
  } catch (error) {
    sendFirebaseError(res, error);
  }
});

/**
 * Deletes an account: sign-in, profile, cart, wishlist and notifications. Its orders are kept
 * (sales history and invoices).
 */
app.delete('/api/admin/users/:uid', async (req, res) => {
  try {
    const auth = getAuth(getConfiguredApp());
    const user = await auth.getUser(req.params.uid);
    const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    if (user.email?.toLowerCase() === adminEmail) {
      res.status(400).json({ error: 'Le compte administrateur principal ne peut pas être supprimé.' });
      return;
    }
    const db = getDb();
    const batch = db.batch();
    const [cartItems, notifications] = await Promise.all([
      db.collection('Carts').doc(user.uid).collection('items').get(),
      db.collection('Notifications').where('uid', '==', user.uid).get(),
    ]);
    cartItems.docs.forEach((doc) => batch.delete(doc.ref));
    notifications.docs.forEach((doc) => batch.delete(doc.ref));
    batch.delete(db.collection('Carts').doc(user.uid));
    batch.delete(db.collection('Wishlists').doc(user.uid));
    batch.delete(db.collection('Users').doc(user.uid));
    await batch.commit();
    profilesCache.remove(user.uid);
    await auth.deleteUser(user.uid);
    res.json({ ok: true });
  } catch (error) {
    sendFirebaseError(res, error);
  }
});

app.get('/api/admin/products', async (_req, res) => {
  try {
    const all = await listProducts();
    res.json(all.map((p) => ({ ...p, active: p.active !== false })));
  } catch (error) {
    sendFirebaseError(res, error);
  }
});

app.put('/api/admin/products/:id', async (req, res) => {
  if (!isValidProduct(req.body) || req.body.id !== req.params.id) {
    res.status(400).json({ error: 'Les informations du produit sont invalides.' });
    return;
  }
  try {
    const existing = (await listProducts()).find((p) => p.id === req.params.id);
    const active = typeof req.body.active === 'boolean'
      ? req.body.active
      : (existing?.active !== false);
    const { createdAt: _clientDate, ...body } = req.body as Product;
    const productData: Product = {
      ...(await withStoredProductImages(body as Product)),
      active,
      createdAt: existing?.createdAt,
    };
    const { createdAt, ...stored } = productData;
    await getDb().collection('products').doc(req.params.id).set({
      ...stored,
      // set() replaces the whole document: write the creation date back, or it is lost.
      ...(createdAt ? { createdAt: Timestamp.fromDate(new Date(createdAt)) } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
    productsCache.upsert(productData);
    res.json({ ok: true });
  } catch (error) {
    sendFirebaseError(res, error);
  }
});

app.patch('/api/admin/products/:id/status', async (req, res) => {
  if (typeof req.body?.active !== 'boolean') {
    res.status(400).json({ error: 'Le statut du produit est invalide.' });
    return;
  }
  try {
    const all = await listProducts();
    const product = all.find((p) => p.id === req.params.id);
    if (!product) {
      res.status(404).json({ error: 'Produit introuvable.' });
      return;
    }
    const active = req.body.active;
    await getDb().collection('products').doc(req.params.id).set({
      active,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    const updated: Product = { ...product, active };
    productsCache.upsert(updated);
    res.json({ ok: true });
  } catch (error) {
    sendFirebaseError(res, error);
  }
});

app.post('/api/admin/products', async (req, res) => {
  if (!isValidProduct(req.body)) {
    res.status(400).json({ error: 'Produit invalide (vérifiez les champs et les images).' });
    return;
  }
  try {
    // Duplicate check uses the cached list, which avoids a Firestore read.
    const existing = (await listProducts()).some((product) => product.id === req.body.id);
    if (existing) {
      res.status(409).json({ error: 'Cet identifiant de produit existe déjà.' });
      return;
    }
    const active = typeof req.body.active === 'boolean' ? req.body.active : true;
    const { createdAt: _clientDate, ...body } = req.body as Product;
    const productData: Product = {
      ...(await withStoredProductImages(body as Product)),
      active,
    };
    await getDb().collection('products').doc(req.body.id).set({
      ...productData,
      createdAt: FieldValue.serverTimestamp(),
    });
    productsCache.upsert({ ...productData, createdAt: new Date().toISOString() });
    res.status(201).json({ ok: true });
  } catch (error) {
    sendFirebaseError(res, error);
  }
});

app.delete('/api/admin/products/:id', async (req, res) => {
  try {
    await getDb().collection('products').doc(req.params.id).set({
      active: false,
      deleted: true,
      deletedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    productsCache.remove(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    sendFirebaseError(res, error);
  }
});

app.get('/api/admin/options', async (_req, res) => {
  res.json(await listOptionCategories());
});

// Explicit resync from Firestore (e.g. after editing documents in the console). This is the only
// path, besides the very first start, that performs collection reads.
app.post('/api/admin/cache/refresh', async (_req, res) => {
  try {
    const caches = { products: productsCache, services: servicesCache, options: optionsCache, carriers: carriersCache, orders: ordersCache, quotes: quotesCache, expenses: expensesCache, profiles: profilesCache, testimonials: testimonialsCache };
    Object.values(caches).forEach((cache) => cache.reset());
    const counts = Object.fromEntries(
      await Promise.all(Object.entries(caches).map(async ([name, cache]) => [name, (await cache.list()).length])),
    );
    res.json({ ok: true, ...counts });
  } catch (error) {
    sendFirebaseError(res, error);
  }
});

app.post('/api/admin/options/:id/images', imageUploadParser, async (req, res) => {
  if (!/^[a-z0-9-]{1,120}$/.test(req.params.id)) {
    res.status(400).json({ error: 'Identifiant de catégorie invalide.' });
    return;
  }
  await uploadAdminImage(req, res, `options/${req.params.id}`);
});

app.post('/api/admin/options', async (req, res) => {
  if (!isValidOptionCategory(req.body)) {
    res.status(400).json({ error: 'Les informations de la catégorie sont invalides.' });
    return;
  }
  try {
    const existing = (await listOptionCategories()).some((category) => category.id === req.body.id);
    if (existing) {
      res.status(409).json({ error: 'Cette catégorie existe déjà.' });
      return;
    }
    const category = await withStoredOptionImages(req.body);
    await getDb().collection('Options').doc(category.id).set(category);
    optionsCache.upsert(category);
    res.status(201).json({ ok: true });
  } catch (error) {
    sendFirebaseError(res, error);
  }
});

app.put('/api/admin/options/:id', async (req, res) => {
  if (!isValidOptionCategory(req.body) || req.body.id !== req.params.id) {
    res.status(400).json({ error: 'Les informations de la catégorie sont invalides.' });
    return;
  }
  try {
    const category = await withStoredOptionImages(req.body);
    await getDb().collection('Options').doc(req.params.id).set(category);
    optionsCache.upsert(category);
    res.json({ ok: true });
  } catch (error) {
    sendFirebaseError(res, error);
  }
});

app.delete('/api/admin/options/:id', async (req, res) => {
  try {
    await getDb().collection('Options').doc(req.params.id).delete();
    optionsCache.remove(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    sendFirebaseError(res, error);
  }
});

app.get('/api/admin/services', async (_req, res) => {
  try {
    res.json(await listServices());
  } catch (error) {
    sendFirebaseError(res, error);
  }
});

app.post('/api/admin/services', async (req, res) => {
  if (!isValidService(req.body) || defaultServices.some((service) => service.id === req.body.id)) {
    res.status(400).json({ error: 'Service invalide ou identifiant déjà utilisé.' });
    return;
  }
  try {
    const existing = (await listServices()).some((service) => service.id === req.body.id);
    if (existing) {
      res.status(409).json({ error: 'Cet identifiant de service existe déjà.' });
      return;
    }
    await getDb().collection('services').doc(req.body.id)
      .set({ ...req.body, active: true, createdAt: FieldValue.serverTimestamp() });
    servicesCache.upsert({ ...req.body, active: true });
    res.status(201).json({ ok: true });
  } catch (error) {
    sendFirebaseError(res, error);
  }
});

app.put('/api/admin/services/:id', async (req, res) => {
  if (!isValidService(req.body) || req.body.id !== req.params.id) {
    res.status(400).json({ error: 'Les informations du service sont invalides.' });
    return;
  }
  try {
    await getDb().collection('services').doc(req.params.id).set({
      ...req.body,
      active: true,
      updatedAt: FieldValue.serverTimestamp(),
    });
    servicesCache.upsert({ ...req.body, active: true });
    res.json({ ok: true });
  } catch (error) {
    sendFirebaseError(res, error);
  }
});

app.delete('/api/admin/services/:id', async (req, res) => {
  try {
    await getDb().collection('services').doc(req.params.id).set({
      active: false,
      deletedAt: FieldValue.serverTimestamp(),
    });
    // Default services are hidden (not removed) so they stay out of the public list.
    const isDefault = defaultServices.some((service) => service.id === req.params.id);
    if (isDefault) {
      const base = defaultServices.find((service) => service.id === req.params.id)!;
      servicesCache.upsert({ ...base, active: false });
    } else {
      servicesCache.remove(req.params.id);
    }
    res.json({ ok: true });
  } catch (error) {
    sendFirebaseError(res, error);
  }
});

app.get('/api/admin/carriers', async (_req, res) => {
  try {
    res.json(await listCarriers());
  } catch (error) {
    sendFirebaseError(res, error);
  }
});

app.post('/api/admin/carriers', async (req, res) => {
  if (!isValidCarrier(req.body)) {
    res.status(400).json({ error: 'Les informations du transporteur sont invalides (chaque zone doit avoir au moins une ville et un prix, et une ville ne peut figurer que dans une seule zone).' });
    return;
  }
  try {
    if ((await listCarriers()).some((carrier) => carrier.id === req.body.id)) {
      res.status(409).json({ error: 'Un transporteur avec cet identifiant existe déjà.' });
      return;
    }
    const carrier = toCarrier(req.body);
    await getDb().collection('Carriers').doc(carrier.id).set({
      ...carrier,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    carriersCache.upsert(carrier);
    res.status(201).json({ ok: true });
  } catch (error) {
    sendFirebaseError(res, error);
  }
});

app.put('/api/admin/carriers/:id', async (req, res) => {
  if (!isValidCarrier(req.body) || req.body.id !== req.params.id) {
    res.status(400).json({ error: 'Les informations du transporteur sont invalides (chaque zone doit avoir au moins une ville et un prix, et une ville ne peut figurer que dans une seule zone).' });
    return;
  }
  try {
    const carrier = toCarrier(req.body);
    // Merge keeps createdAt; arrays (zones) are replaced as a whole. The first-format
    // single `price` field is removed.
    await getDb().collection('Carriers').doc(carrier.id).set({
      ...carrier,
      price: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    carriersCache.upsert(carrier);
    res.json({ ok: true });
  } catch (error) {
    sendFirebaseError(res, error);
  }
});

app.delete('/api/admin/carriers/:id', async (req, res) => {
  try {
    await getDb().collection('Carriers').doc(req.params.id).delete();
    carriersCache.remove(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    sendFirebaseError(res, error);
  }
});

app.get('/api/admin/orders', async (_req, res) => {
  try {
    const profiles = await profilesById();
    res.json(newestFirst(await ordersCache.list()).map(({ id: _id, ...order }) => withCurrentCustomer(order, profiles)));
  } catch (error) {
    sendFirebaseError(res, error);
  }
});

const ORDER_STATUSES = new Set(['pending', 'processing', 'completed', 'cancelled']);

// Status and/or delivery of an order. A sale counts in the revenue only once it is
// "completed" AND delivered; deliveredAt dates it.
// ---------- Notifications for the customer of an order ----------
const ORDER_NOTICES: Record<string, { title: string; message: (id: string) => string }> = {
  processing: { title: 'Commande en préparation', message: (id) => `Votre commande ${id} est en cours de préparation dans notre atelier.` },
  completed: { title: 'Commande terminée', message: (id) => `Votre commande ${id} est terminée et prête à être expédiée.` },
  cancelled: { title: 'Commande annulée', message: (id) => `Votre commande ${id} a été annulée. Contactez-nous pour toute question.` },
  in_transit: { title: 'Commande en cours de livraison', message: (id) => `Votre commande ${id} a été confiée au transporteur et arrive bientôt.` },
  delivered: { title: 'Commande livrée', message: (id) => `Votre commande ${id} a été livrée. Merci pour votre confiance !` },
  returned: { title: 'Commande retournée', message: (id) => `Votre commande ${id} nous a été retournée. Contactez-nous pour organiser une nouvelle livraison.` },
};

/** Delivery follow-up of an order: one state at a time, or none. */
const DELIVERY_STATES = new Set(['in_transit', 'delivered', 'returned']);

/** Current delivery state, including orders saved before it existed (delivered: true). */
function deliveryStateOf(order: Record<string, unknown>): string | null {
  if (typeof order.deliveryState === 'string' && DELIVERY_STATES.has(order.deliveryState)) return order.deliveryState;
  return order.delivered === true ? 'delivered' : null;
}

/** Tells the owner of an order (if it was placed with an account) about a change. Never blocks the update. */
async function notifyOrderOwner(order: Record<string, unknown>, orderId: string, kind: keyof typeof ORDER_NOTICES | string) {
  const notice = ORDER_NOTICES[kind];
  const uid = typeof order.uid === 'string' ? order.uid : '';
  if (!notice || !uid) return;
  try {
    await getDb().collection('Notifications').add({
      uid,
      kind,
      orderId,
      title: notice.title,
      message: notice.message(orderId),
      read: false,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.warn('[notifications] Création impossible.', error);
  }
}

// Status and/or delivery state of an order. A sale counts in the revenue only once it is
// "completed" AND delivered; deliveredAt dates it. `delivered` (boolean) is still accepted.
app.patch('/api/admin/orders/:id', async (req, res) => {
  const { status, delivered } = req.body ?? {};
  let { deliveryState } = req.body ?? {};
  if (deliveryState === undefined && typeof delivered === 'boolean') deliveryState = delivered ? 'delivered' : null;
  if (status === undefined && deliveryState === undefined) {
    res.status(400).json({ error: 'Rien à modifier.' });
    return;
  }
  if (status !== undefined && !ORDER_STATUSES.has(status)) {
    res.status(400).json({ error: 'Statut de commande invalide.' });
    return;
  }
  if (deliveryState !== undefined && deliveryState !== null && !DELIVERY_STATES.has(deliveryState)) {
    res.status(400).json({ error: 'État de livraison invalide.' });
    return;
  }
  try {
    const ref = getDb().collection('orders').doc(req.params.id);
    const snapshot = await ref.get();
    if (!snapshot.exists) {
      res.status(404).json({ error: 'Commande introuvable.' });
      return;
    }
    const before = snapshot.data() ?? {};
    const previousState = deliveryStateOf(before);
    const changes: Record<string, unknown> = {};
    if (status !== undefined) changes.status = status;
    if (deliveryState !== undefined) {
      changes.deliveryState = deliveryState;
      changes.delivered = deliveryState === 'delivered';
      changes.deliveredAt = deliveryState === 'delivered'
        ? (previousState === 'delivered' && typeof before.deliveredAt === 'string' ? before.deliveredAt : new Date().toISOString())
        : null;
    }
    await ref.update({ ...changes, updatedAt: FieldValue.serverTimestamp() });
    ordersCache.upsert({ ...toStoredRecord(ref.id, before), ...changes });
    if (status !== undefined && status !== before.status) await notifyOrderOwner(before, ref.id, status);
    if (deliveryState && deliveryState !== previousState) await notifyOrderOwner(before, ref.id, deliveryState);
    res.json({ ok: true, ...changes });
  } catch (error) {
    sendFirebaseError(res, error);
  }
});

app.delete('/api/admin/orders/:id', async (req, res) => {
  try {
    const ref = getDb().collection('orders').doc(req.params.id);
    if (!(await ref.get()).exists) {
      res.status(404).json({ error: 'Commande introuvable.' });
      return;
    }
    await ref.delete();
    ordersCache.remove(ref.id);
    res.json({ ok: true });
  } catch (error) {
    sendFirebaseError(res, error);
  }
});

const isText = (value: unknown, max: number, required = false): value is string =>
  typeof value === 'string' && value.length <= max && (!required || value.trim().length > 0);

/** Order corrected by the administrator: customer, lines, delivery, payment and status. */
function parseAdminOrderUpdate(body: unknown) {
  if (!body || typeof body !== 'object') return null;
  const { customer, items, shipping, paymentMethod, status } = body as Record<string, unknown>;
  if (!customer || typeof customer !== 'object') return null;
  const c = customer as Record<string, unknown>;
  if (
    !isText(c.name, 120, true) ||
    !isText(c.email, 254, true) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email.trim()) ||
    !isText(c.phone ?? '', 40) || !isText(c.address ?? '', 500) ||
    !isText(c.city ?? '', 120) || !isText(c.note ?? '', 2000)
  ) return null;
  if (!Array.isArray(items) || items.length === 0 || items.length > 100) return null;
  const lines = [];
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') return null;
    const line = raw as Record<string, unknown>;
    if (
      !isText(line.productId, 120, true) || !isText(line.slug ?? '', 200) || !isText(line.name, 200, true) ||
      !isValidPrice(line.price) ||
      typeof line.quantity !== 'number' || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 999 ||
      (line.customization !== undefined && (typeof line.customization !== 'object' || line.customization === null))
    ) return null;
    lines.push({
      productId: line.productId,
      slug: (line.slug as string | undefined) ?? '',
      name: line.name.trim(),
      price: line.price,
      quantity: line.quantity,
      customization: (line.customization as object | undefined) ?? {},
    });
  }
  if (JSON.stringify(lines).length > MAX_OPTION_IMAGE_LENGTH + 200_000) return null;
  let delivery: { carrierId: string; carrierName: string; price: number; delay: string } | null = null;
  if (shipping !== null && shipping !== undefined) {
    if (typeof shipping !== 'object') return null;
    const s = shipping as Record<string, unknown>;
    if (!isText(s.carrierId ?? '', 80) || !isText(s.carrierName, 120, true) || !isValidPrice(s.price) || !isText(s.delay ?? '', 120)) {
      return null;
    }
    delivery = {
      carrierId: (s.carrierId as string | undefined) ?? '',
      carrierName: s.carrierName.trim(),
      price: s.price,
      delay: ((s.delay as string | undefined) ?? '').trim(),
    };
  }
  if (paymentMethod !== 'cash_on_delivery' && paymentMethod !== 'bank_transfer') return null;
  if (typeof status !== 'string' || !ORDER_STATUSES.has(status)) return null;
  const subtotal = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
  return {
    customer: {
      name: c.name.trim(),
      email: c.email.trim(),
      phone: ((c.phone as string | undefined) ?? '').trim(),
      address: ((c.address as string | undefined) ?? '').trim(),
      city: ((c.city as string | undefined) ?? '').trim(),
      note: ((c.note as string | undefined) ?? '').trim(),
    },
    items: lines,
    subtotal,
    shipping: delivery,
    paymentMethod,
    total: subtotal + (delivery?.price ?? 0),
    status,
  };
}

app.put('/api/admin/orders/:id', async (req, res) => {
  const update = parseAdminOrderUpdate(req.body);
  if (!update) {
    res.status(400).json({ error: 'Commande invalide : vérifiez les champs (client, articles, livraison, paiement).' });
    return;
  }
  try {
    const ref = getDb().collection('orders').doc(req.params.id);
    const snapshot = await ref.get();
    if (!snapshot.exists) {
      res.status(404).json({ error: 'Commande introuvable.' });
      return;
    }
    await ref.update({ ...update, updatedAt: FieldValue.serverTimestamp() });
    const before = snapshot.data() ?? {};
    const stored = { ...toStoredRecord(ref.id, before), ...update };
    ordersCache.upsert(stored);
    if (update.status !== before.status) await notifyOrderOwner(before, ref.id, update.status);
    const { id: _id, ...order } = stored;
    res.json(order);
  } catch (error) {
    sendFirebaseError(res, error);
  }
});

app.get('/api/admin/expenses', async (_req, res) => {
  try {
    const list = (await expensesCache.list())
      .map(({ createdAt: _createdAt, updatedAt: _updatedAt, ...expense }) => expense)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    res.json(list);
  } catch (error) {
    sendFirebaseError(res, error);
  }
});

app.post('/api/admin/expenses', async (req, res) => {
  const expense = parseExpense(req.body, randomUUID());
  if (!expense) {
    res.status(400).json({ error: 'Charge invalide : vérifiez la date, la catégorie, le libellé et le montant.' });
    return;
  }
  try {
    const { id, ...data } = expense;
    await getDb().collection('Expenses').doc(id).set({ ...data, createdAt: FieldValue.serverTimestamp() });
    expensesCache.upsert({ ...expense, createdAt: new Date().toISOString() });
    res.status(201).json(expense);
  } catch (error) {
    sendFirebaseError(res, error);
  }
});

app.put('/api/admin/expenses/:id', async (req, res) => {
  const expense = parseExpense(req.body, req.params.id);
  if (!expense) {
    res.status(400).json({ error: 'Charge invalide : vérifiez la date, la catégorie, le libellé et le montant.' });
    return;
  }
  try {
    const ref = getDb().collection('Expenses').doc(req.params.id);
    if (!(await ref.get()).exists) {
      res.status(404).json({ error: 'Charge introuvable.' });
      return;
    }
    const { id: _id, ...data } = expense;
    await ref.update({ ...data, updatedAt: FieldValue.serverTimestamp() });
    expensesCache.upsert({ ...expense, createdAt: null });
    res.json(expense);
  } catch (error) {
    sendFirebaseError(res, error);
  }
});

app.delete('/api/admin/expenses/:id', async (req, res) => {
  try {
    const ref = getDb().collection('Expenses').doc(req.params.id);
    if (!(await ref.get()).exists) {
      res.status(404).json({ error: 'Charge introuvable.' });
      return;
    }
    await ref.delete();
    expensesCache.remove(ref.id);
    res.json({ ok: true });
  } catch (error) {
    sendFirebaseError(res, error);
  }
});

app.get('/api/admin/testimonials', async (_req, res) => {
  try {
    res.json([...(await testimonialsCache.list())].sort(byDisplayOrder));
  } catch (error) {
    sendFirebaseError(res, error);
  }
});

const TESTIMONIAL_ERROR = 'Avis invalide : nom (80 caractères max), texte (600 max) et note de 1 à 5 sont requis.';

app.post('/api/admin/testimonials', async (req, res) => {
  const testimonial = parseTestimonial(req.body, randomUUID());
  if (!testimonial) {
    res.status(400).json({ error: TESTIMONIAL_ERROR });
    return;
  }
  try {
    const { id, ...data } = testimonial;
    await getDb().collection('Testimonials').doc(id).set({ ...data, createdAt: FieldValue.serverTimestamp() });
    testimonialsCache.upsert(testimonial);
    res.status(201).json(testimonial);
  } catch (error) {
    sendFirebaseError(res, error);
  }
});

app.put('/api/admin/testimonials/:id', async (req, res) => {
  const testimonial = parseTestimonial(req.body, req.params.id);
  if (!testimonial) {
    res.status(400).json({ error: TESTIMONIAL_ERROR });
    return;
  }
  try {
    const ref = getDb().collection('Testimonials').doc(req.params.id);
    if (!(await ref.get()).exists) {
      res.status(404).json({ error: 'Avis introuvable.' });
      return;
    }
    const { id: _id, ...data } = testimonial;
    await ref.update({ ...data, updatedAt: FieldValue.serverTimestamp() });
    testimonialsCache.upsert(testimonial);
    res.json(testimonial);
  } catch (error) {
    sendFirebaseError(res, error);
  }
});

app.delete('/api/admin/testimonials/:id', async (req, res) => {
  try {
    const ref = getDb().collection('Testimonials').doc(req.params.id);
    if (!(await ref.get()).exists) {
      res.status(404).json({ error: 'Avis introuvable.' });
      return;
    }
    await ref.delete();
    testimonialsCache.remove(ref.id);
    res.json({ ok: true });
  } catch (error) {
    sendFirebaseError(res, error);
  }
});

app.get('/api/admin/quotes', async (_req, res) => {
  try {
    res.json(newestFirst(await quotesCache.list()).map(({ id: _id, ...quote }) => quote));
  } catch (error) {
    sendFirebaseError(res, error);
  }
});

app.patch('/api/admin/quotes/:id', async (req, res) => {
  const allowedStatuses = new Set(['new', 'reviewing', 'quoted', 'closed']);
  if (!allowedStatuses.has(req.body?.status)) {
    res.status(400).json({ error: 'Statut de devis invalide.' });
    return;
  }
  try {
    const quote = (await quotesCache.list()).find((entry) => entry.id === req.params.id);
    if (!quote) {
      res.status(404).json({ error: 'Demande de devis introuvable.' });
      return;
    }
    await getDb().collection('quotes').doc(req.params.id)
      .update({ status: req.body.status, updatedAt: FieldValue.serverTimestamp() });
    quotesCache.upsert({ ...quote, status: req.body.status });
    res.json({ ok: true });
  } catch (error) {
    sendFirebaseError(res, error);
  }
});

app.get('/api/admin/quotes/:id/file', async (req, res) => {
  try {
    const quote = (await quotesCache.list()).find((entry) => entry.id === req.params.id);
    if (!quote) {
      res.status(404).json({ error: 'Demande de devis introuvable.' });
      return;
    }
    const { filePath } = quote;
    if (typeof filePath !== 'string') {
      res.status(404).json({ error: 'Fichier du devis introuvable.' });
      return;
    }
    const [url] = await getStorage(getConfiguredApp())
      .bucket()
      .file(filePath)
      .getSignedUrl({ action: 'read', expires: Date.now() + 15 * 60 * 1000 });
    res.json({ url });
  } catch (error) {
    sendFirebaseError(res, error);
  }
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[api]', error);
  res.set('Vercel-CDN-Cache-Control', 'no-store');
  res.status(500).json({ error: 'Une erreur inattendue est survenue.' });
});

export const api = onRequest({ region: 'us-central1', maxInstances: 10 }, app);

export default app;

if (
  process.env.FUNCTIONS_EMULATOR !== 'true' &&
  process.env.FUNCTION_TARGET === undefined &&
  !process.env.VERCEL
) {
  app.listen(PORT, () => {
    console.log(`3alam3D API → http://localhost:${PORT}`);
    // Prime every cache (one Firestore read per collection).
    // Each collection is primed independently so one failure (e.g. quota) does not block the others.
    [productsCache, servicesCache, optionsCache, ordersCache, quotesCache, profilesCache].forEach((cache) => {
      void cache.list().catch(() => undefined);
    });
  });
}
