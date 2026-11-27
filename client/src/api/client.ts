import type {
  CartCustomization,
  CartItem,
  Product,
  ProductOptionCategory,
  Service,
} from '../types';
import { getCurrentUserToken } from '../firebase';
import { cached, invalidateCache } from '../utils/localCache';

// Production builds read VITE_API_URL from .env.production (the API hosted on Vercel).
export const API_BASE = import.meta.env.VITE_API_URL
  ?? (import.meta.env.PROD ? '/api' : 'http://localhost:4000/api');

// Public catalogue data changes rarely: serve it from localStorage, ask the API again after
// 5 minutes (in the background, the page shows the stored copy meanwhile), forget it after a week.
const CATALOGUE_CACHE = { freshMs: 5 * 60 * 1000, maxAgeMs: 7 * 24 * 60 * 60 * 1000 };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    // Content-Type only with a body: on a GET it would force an extra CORS preflight request.
    headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...(init?.headers ?? {}) },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Erreur ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// The full catalogue is cached once; category/search filters are applied locally.
export async function fetchProducts(params?: { category?: string; q?: string }) {
  let list = await cached('products', () => request<Product[]>('/products'), CATALOGUE_CACHE);
  list = list.filter((product) => product.active !== false);
  if (params?.category) list = list.filter((product) => product.category === params.category);
  const term = params?.q?.trim().toLowerCase();
  if (term) {
    list = list.filter((product) =>
      product.name.toLowerCase().includes(term)
      || product.description.toLowerCase().includes(term)
      || product.tags.some((tag) => tag.toLowerCase().includes(term)));
  }
  return list;
}

export function fetchProduct(slug: string) {
  return cached(
    `product:${slug}`,
    () => request<Product>(`/products/${encodeURIComponent(slug)}`),
    CATALOGUE_CACHE,
  );
}

export function fetchServices() {
  return cached('services', () => request<Service[]>('/services'), CATALOGUE_CACHE);
}

export function fetchOptionCategories() {
  return cached('options', () => request<ProductOptionCategory[]>('/options'), CATALOGUE_CACHE);
}

export { invalidateCache, onCacheUpdate } from '../utils/localCache';

export function sendContact(payload: {
  name: string;
  email: string;
  subject?: string;
  message: string;
  serviceId?: string;
}) {
  return request<{ ok: boolean; message: string }>('/contact', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function sendQuote(payload: {
  name: string;
  email: string;
  message: string;
  filePath?: string;
  fileName?: string;
  fileSize?: number;
  token: string;
}) {
  const { token, ...body } = payload;
  return request<{ ok: boolean; quoteId: string; message: string }>('/quotes', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

export async function placeOrder(payload: {
  items: Array<{
    productId: string;
    quantity: number;
    customization?: CartCustomization;
  }>;
  customer: { name: string; email: string; phone?: string; address?: string; city?: string; note?: string };
  /** Chosen carrier; delivery price is computed by the server. */
  carrierId?: string;
  paymentMethod: PaymentMethod;
}) {
  // Signed in: send the account token so the order appears in "Mes commandes".
  const token = await getCurrentUserToken().catch(() => null);
  return request<{ ok: boolean; orderId: string; message: string }>('/orders', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: JSON.stringify(payload),
  });
}

export interface UserNotification {
  id: string;
  kind: string;
  orderId?: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

/** Notifications of the signed-in customer (only the unread ones when unreadOnly). */
export function fetchNotifications(unreadOnly = false) {
  return authenticatedRequest<UserNotification[]>(unreadOnly ? '/notifications?unread=1' : '/notifications');
}

export function markNotificationsRead() {
  return authenticatedRequest<{ ok: boolean }>('/notifications/read', { method: 'POST', body: '{}' });
}

/** Orders of the signed-in customer, newest first. */
export function fetchMyOrders() {
  return authenticatedRequest<AdminOrder[]>('/my-orders');
}

export type PaymentMethod = 'cash_on_delivery' | 'bank_transfer';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash_on_delivery: 'Paiement à la livraison',
  bank_transfer: 'Virement bancaire',
};

export interface AdminOrder {
  orderId: string;
  items: Array<{
    productId?: string;
    slug?: string;
    name: string;
    quantity: number;
    price: number;
    customization?: CartCustomization;
  }>;
  customer: { name: string; email: string; phone?: string; address?: string; city?: string; note?: string };
  subtotal?: number;
  shipping?: { carrierId: string; carrierName: string; price: number; delay: string } | null;
  paymentMethod?: PaymentMethod;
  /** Delivery follow-up set by the administrator (one state at a time). */
  deliveryState?: DeliveryState | null;
  /** True when deliveryState is "delivered" (kept for older orders). */
  delivered?: boolean;
  deliveredAt?: string | null;
  total: number;
  status: string;
  createdAt: string | null;
}

export interface AdminQuote {
  quoteId: string;
  name: string;
  email: string;
  message: string;
  fileName: string;
  fileSize: number;
  status: string;
  createdAt: string | null;
}

export interface AdminUser {
  uid: string;
  email: string;
  displayName: string;
  firstName: string;
  lastName: string;
  fullName: string;
  role: 'Administrateur' | 'Utilisateur';
  emailVerified: boolean;
  disabled: boolean;
  createdAt: string | null;
  lastSignInAt: string | null;
}

export interface UserProfile {
  firstName: string;
  lastName: string;
  address: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  role?: 'Administrateur' | 'Utilisateur';
}

async function authenticatedRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getCurrentUserToken();
  return request<T>(path, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
}

async function adminRequest<T>(path: string, init?: RequestInit): Promise<T> {
  return authenticatedRequest<T>(path, init);
}

// Admin writes change the public catalogue: drop the local copies so visitors see fresh data.
async function adminMutation<T>(path: string, init: RequestInit, ...cacheKeys: string[]): Promise<T> {
  const result = await adminRequest<T>(path, init);
  invalidateCache(...cacheKeys);
  return result;
}

export function fetchUserProfile() {
  return authenticatedRequest<UserProfile>('/profile');
}

export function saveUserProfile(profile: Omit<UserProfile, 'email'>) {
  return authenticatedRequest<{ ok: boolean; updatedOrders?: number }>('/profile', {
    method: 'PUT',
    body: JSON.stringify(profile),
  });
}

export async function fetchUserWishlist() {
  const { productIds } = await authenticatedRequest<{ productIds: string[] }>('/wishlist');
  return productIds;
}

export function saveUserWishlist(productIds: string[]) {
  return authenticatedRequest<{ ok: boolean }>('/wishlist', {
    method: 'PUT',
    body: JSON.stringify({ productIds }),
  });
}

export async function fetchUserCart() {
  const { items } = await authenticatedRequest<{ items: CartItem[] }>('/cart');
  return items;
}

export function saveUserCart(items: CartItem[]) {
  return authenticatedRequest<{ ok: boolean }>('/cart', {
    method: 'PUT',
    body: JSON.stringify({ items }),
  });
}

export function fetchAdminProducts() {
  return adminRequest<Product[]>('/admin/products');
}

export function fetchAdminUsers() {
  return adminRequest<AdminUser[]>('/admin/users');
}

export function updateAdminUserStatus(uid: string, disabled: boolean) {
  return adminRequest<{ ok: boolean }>(`/admin/users/${encodeURIComponent(uid)}`, {
    method: 'PATCH',
    body: JSON.stringify({ disabled }),
  });
}

export function fetchAdminServices() {
  return adminRequest<Service[]>('/admin/services');
}

export function saveAdminService(service: Service, isNew: boolean) {
  return adminMutation<{ ok: boolean }>(
    isNew ? '/admin/services' : `/admin/services/${encodeURIComponent(service.id)}`,
    { method: isNew ? 'POST' : 'PUT', body: JSON.stringify(service) },
    'services',
  );
}

export function deleteAdminService(id: string) {
  return adminMutation<{ ok: boolean }>(
    `/admin/services/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
    'services',
  );
}

export interface CarrierZone {
  id: string;
  /** Villes desservies au même prix, ex. ["Rabat", "Salé", "Témara"]. */
  cities: string[];
  /** Frais de livraison pour toutes les villes de la zone (MAD). */
  price: number;
  /** Délai propre à la zone ; vide = délai par défaut du transporteur. */
  delay: string;
}

export interface Carrier {
  id: string;
  name: string;
  description: string;
  /** Délai par défaut affiché au client, ex. « 24 à 48 h ». */
  delay: string;
  /** Livraison offerte à partir de ce montant (MAD), null = jamais. */
  freeFrom: number | null;
  /** Zones desservies, chacune avec son prix. */
  zones: CarrierZone[];
  /** Lien de suivi ; {tracking} est remplacé par le numéro de colis. */
  trackingUrl: string;
  active: boolean;
}

export function fetchCarriers() {
  return cached('carriers', () => request<Carrier[]>('/carriers'), CATALOGUE_CACHE);
}

export function fetchAdminCarriers() {
  return adminRequest<Carrier[]>('/admin/carriers');
}

export function saveAdminCarrier(carrier: Carrier, isNew: boolean) {
  return adminMutation<{ ok: boolean }>(
    isNew ? '/admin/carriers' : `/admin/carriers/${encodeURIComponent(carrier.id)}`,
    { method: isNew ? 'POST' : 'PUT', body: JSON.stringify(carrier) },
    'carriers',
  );
}

export function deleteAdminCarrier(id: string) {
  return adminMutation<{ ok: boolean }>(
    `/admin/carriers/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
    'carriers',
  );
}

export function saveAdminProduct(product: Product, isNew: boolean) {
  return adminMutation<{ ok: boolean }>(
    isNew ? '/admin/products' : `/admin/products/${encodeURIComponent(product.id)}`,
    { method: isNew ? 'POST' : 'PUT', body: JSON.stringify(product) },
    'products',
    'product:',
  );
}

export function uploadAdminProductImage(productId: string, file: File) {
  return adminRequest<{ url: string }>(
    `/admin/products/${encodeURIComponent(productId)}/images`,
    {
      method: 'POST',
      headers: { 'Content-Type': file.type },
      body: file,
    },
  );
}

export function deleteAdminProduct(id: string) {
  return adminMutation<{ ok: boolean }>(
    `/admin/products/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
    'products',
    'product:',
  );
}

export function updateAdminProductStatus(productId: string, active: boolean) {
  return adminMutation<{ ok: boolean }>(
    `/admin/products/${encodeURIComponent(productId)}/status`,
    {
      method: 'PATCH',
      body: JSON.stringify({ active }),
    },
    'products',
    'product:',
  );
}

export function fetchAdminOptionCategories() {
  return adminRequest<ProductOptionCategory[]>('/admin/options');
}

export function saveAdminOptionCategory(category: ProductOptionCategory, isNew: boolean) {
  return adminMutation<{ ok: boolean }>(
    isNew ? '/admin/options' : `/admin/options/${encodeURIComponent(category.id)}`,
    { method: isNew ? 'POST' : 'PUT', body: JSON.stringify(category) },
    'options',
  );
}

export function deleteAdminOptionCategory(id: string) {
  return adminMutation<{ ok: boolean }>(
    `/admin/options/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
    'options',
  );
}

export function uploadAdminOptionImage(categoryId: string, file: File) {
  return adminRequest<{ url: string }>(
    `/admin/options/${encodeURIComponent(categoryId)}/images`,
    {
      method: 'POST',
      headers: { 'Content-Type': file.type },
      body: file,
    },
  );
}

export function fetchAdminOrders() {
  return adminRequest<AdminOrder[]>('/admin/orders');
}

export function updateAdminOrder(orderId: string, status: string) {
  return adminRequest<{ ok: boolean }>(`/admin/orders/${encodeURIComponent(orderId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

/** Order corrected by the administrator; the server recomputes subtotal and total. */
export function saveAdminOrder(
  orderId: string,
  order: Pick<AdminOrder, 'customer' | 'items' | 'shipping' | 'paymentMethod' | 'status'>,
) {
  return adminRequest<AdminOrder>(`/admin/orders/${encodeURIComponent(orderId)}`, {
    method: 'PUT',
    body: JSON.stringify(order),
  });
}

export function deleteAdminOrder(orderId: string) {
  return adminRequest<{ ok: boolean }>(`/admin/orders/${encodeURIComponent(orderId)}`, { method: 'DELETE' });
}

export interface Expense {
  id: string;
  /** Day of the expense, YYYY-MM-DD. */
  date: string;
  category: string;
  label: string;
  amount: number;
  paymentMethod: string;
  note: string;
}

export function fetchAdminExpenses() {
  return adminRequest<Expense[]>('/admin/expenses');
}

/** Creates (no id yet) or updates an expense; returns it as saved. */
export function saveAdminExpense(expense: Expense) {
  return adminRequest<Expense>(expense.id ? `/admin/expenses/${encodeURIComponent(expense.id)}` : '/admin/expenses', {
    method: expense.id ? 'PUT' : 'POST',
    body: JSON.stringify(expense),
  });
}

export function deleteAdminExpense(id: string) {
  return adminRequest<{ ok: boolean }>(`/admin/expenses/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export type DeliveryState = 'in_transit' | 'delivered' | 'returned';

/** Sets the delivery state of an order (null = none); a completed and delivered order is a validated sale. */
export function updateAdminOrderDelivery(orderId: string, deliveryState: DeliveryState | null) {
  return adminRequest<{ ok: boolean; deliveredAt?: string | null }>(`/admin/orders/${encodeURIComponent(orderId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ deliveryState }),
  });
}

export function fetchAdminQuotes() {
  return adminRequest<AdminQuote[]>('/admin/quotes');
}

export function updateAdminQuote(quoteId: string, status: string) {
  return adminRequest<{ ok: boolean }>(`/admin/quotes/${encodeURIComponent(quoteId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function fetchAdminQuoteFile(quoteId: string) {
  return adminRequest<{ url: string }>(
    `/admin/quotes/${encodeURIComponent(quoteId)}/file`,
  );
}
