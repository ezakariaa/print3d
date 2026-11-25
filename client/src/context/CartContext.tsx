import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { fetchProducts, fetchUserCart, saveUserCart } from '../api/client';
import { getFirebaseAuth, isFirebaseConfigured, onAuthStateChanged } from '../firebase';
import type { CartCustomization, CartItem } from '../types';
import { getProductImage } from '../utils/productImages';

interface CartContextValue {
  items: CartItem[];
  count: number;
  total: number;
  addItem: (item: Omit<CartItem, 'quantity'> & { quantity?: number }) => void;
  updateQty: (key: string, quantity: number) => void;
  removeItem: (key: string) => void;
  clear: () => void;
  itemKey: (item: Pick<CartItem, 'productId' | 'customization'>) => string;
}

const CartContext = createContext<CartContextValue | null>(null);

// Guest cart (not signed in) and per-account local copies, used to display the
// cart instantly on reload while the account cart is refreshed from the server.
const GUEST_KEY = 'printma3d_cart';
const OWNER_KEY = 'printma3d_cart_owner';
const userKey = (uid: string) => `printma3d_cart:${uid}`;
const SYNC_DELAY_MS = 500;

function buildKey(productId: string, customization?: CartCustomization) {
  return `${productId}::${JSON.stringify(customization ?? {})}`;
}

function readItems(key: string): CartItem[] {
  try {
    const saved = localStorage.getItem(key);
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeItems(key: string, items: CartItem[]) {
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch {
    // Ignore storage errors
  }
}

function removeStorage(...keys: string[]) {
  try {
    keys.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Ignore storage errors
  }
}

function readOwner(): string | null {
  try {
    return localStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
}

/** Adds the guest lines to the account lines (quantities summed for identical lines). */
function mergeItems(base: CartItem[], extra: CartItem[]): CartItem[] {
  const merged = [...base];
  for (const item of extra) {
    const key = buildKey(item.productId, item.customization);
    const index = merged.findIndex((p) => buildKey(p.productId, p.customization) === key);
    if (index >= 0) merged[index] = { ...merged[index], quantity: merged[index].quantity + item.quantity };
    else merged.push(item);
  }
  return merged;
}

/** Product photos are not stored server side: restore them from the cached catalogue. */
async function withProductImages(items: CartItem[]): Promise<CartItem[]> {
  if (items.every((item) => item.imageUrl)) return items;
  try {
    const products = await fetchProducts();
    return items.map((item) => {
      if (item.imageUrl) return item;
      const product = products.find((p) => p.id === item.productId || p.slug === item.slug);
      return { ...item, imageUrl: getProductImage(item.slug, product?.images) };
    });
  } catch {
    return items;
  }
}

// Pending server save, shared so that logout can flush it while the session is still valid.
let pendingSync: (() => Promise<void>) | null = null;

/** Sends any not-yet-saved cart change to the account. Call before signing out. */
export async function flushCartSync() {
  const run = pendingSync;
  pendingSync = null;
  if (run) await run().catch(() => undefined);
}

export function CartProvider({ children }: { children: ReactNode }) {
  // uid of the account owning the displayed cart, or null for a guest cart.
  const ownerRef = useRef<string | null>(readOwner());
  // True once the account cart has been loaded: before that, never overwrite it on the server.
  const syncReadyRef = useRef(false);
  const timerRef = useRef<number | undefined>(undefined);

  const [items, setItems] = useState<CartItem[]>(() =>
    readItems(ownerRef.current ? userKey(ownerRef.current) : GUEST_KEY));

  const scheduleSync = (uid: string, nextItems: CartItem[]) => {
    window.clearTimeout(timerRef.current);
    const run = async () => {
      if (ownerRef.current !== uid) return;
      await saveUserCart(nextItems);
    };
    pendingSync = run;
    timerRef.current = window.setTimeout(() => {
      if (pendingSync === run) pendingSync = null;
      void run().catch((err) => console.warn('Sauvegarde du panier impossible :', err));
    }, SYNC_DELAY_MS);
  };

  const saveCart = (nextItems: CartItem[] | ((prev: CartItem[]) => CartItem[])) => {
    setItems((prev) => {
      const updated = typeof nextItems === 'function' ? nextItems(prev) : nextItems;
      const owner = ownerRef.current;
      writeItems(owner ? userKey(owner) : GUEST_KEY, updated);
      if (owner && syncReadyRef.current) scheduleSync(owner, updated);
      return updated;
    });
  };

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    let generation = 0;

    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), async (user) => {
      const current = ++generation;
      const uid = user && !user.isAnonymous ? user.uid : null;

      if (!uid) {
        // Signed out (or anonymous session): the account cart disappears from this browser.
        const previousOwner = ownerRef.current;
        if (previousOwner) {
          window.clearTimeout(timerRef.current);
          pendingSync = null;
          ownerRef.current = null;
          syncReadyRef.current = false;
          removeStorage(userKey(previousOwner), OWNER_KEY, GUEST_KEY);
          setItems([]);
        }
        return;
      }

      if (ownerRef.current === uid && syncReadyRef.current) return;

      // Signing in: items added as a guest are carried over into the account cart.
      const guestItems = ownerRef.current === null ? readItems(GUEST_KEY) : [];
      // Another account's leftover copy (session expired without logout) must not leak.
      if (ownerRef.current && ownerRef.current !== uid) removeStorage(userKey(ownerRef.current));
      ownerRef.current = uid;
      syncReadyRef.current = false;
      try {
        localStorage.setItem(OWNER_KEY, uid);
      } catch {
        // Ignore storage errors
      }
      // Show the locally cached copy right away while the server copy loads.
      const cachedItems = readItems(userKey(uid));
      setItems(mergeItems(cachedItems, guestItems));

      try {
        const serverItems = await withProductImages(await fetchUserCart());
        if (current !== generation || ownerRef.current !== uid) return;
        const merged = mergeItems(serverItems, guestItems);
        syncReadyRef.current = true;
        removeStorage(GUEST_KEY);
        writeItems(userKey(uid), merged);
        setItems(merged);
        if (guestItems.length > 0) scheduleSync(uid, merged);
      } catch (err) {
        if (current !== generation || ownerRef.current !== uid) return;
        console.warn('Chargement du panier impossible :', err);
        // Keep the cached copy and allow later changes to be saved.
        syncReadyRef.current = true;
        removeStorage(GUEST_KEY);
        const fallback = mergeItems(cachedItems, guestItems);
        writeItems(userKey(uid), fallback);
        if (guestItems.length > 0) scheduleSync(uid, fallback);
      }
    });

    return () => {
      generation += 1;
      unsubscribe();
    };
  }, []);

  const value = useMemo<CartContextValue>(() => {
    const count = items.reduce((sum, i) => sum + i.quantity, 0);
    const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

    return {
      items,
      count,
      total,
      itemKey: (item) => buildKey(item.productId, item.customization),
      addItem: (item) => {
        const key = buildKey(item.productId, item.customization);
        saveCart((prev) => {
          const existing = prev.find(
            (p) => buildKey(p.productId, p.customization) === key,
          );
          if (existing) {
            return prev.map((p) =>
              buildKey(p.productId, p.customization) === key
                ? { ...p, quantity: p.quantity + (item.quantity ?? 1) }
                : p,
            );
          }
          return [...prev, { ...item, quantity: item.quantity ?? 1 }];
        });
      },
      updateQty: (key, quantity) => {
        saveCart((prev) =>
          prev
            .map((p) =>
              buildKey(p.productId, p.customization) === key
                ? { ...p, quantity }
                : p,
            )
            .filter((p) => p.quantity > 0),
        );
      },
      removeItem: (key) => {
        saveCart((prev) =>
          prev.filter((p) => buildKey(p.productId, p.customization) !== key),
        );
      },
      clear: () => saveCart([]),
    };
  }, [items]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart doit être utilisé dans CartProvider');
  return ctx;
}
