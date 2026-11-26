import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { fetchUserWishlist, saveUserWishlist } from '../api/client';
import { getFirebaseAuth, isFirebaseConfigured, onAuthStateChanged } from '../firebase';

interface WishlistContextValue {
  /** Product ids, most recently added first. */
  ids: string[];
  count: number;
  has: (productId: string) => boolean;
  toggle: (productId: string) => void;
  remove: (productId: string) => void;
}

const WishlistContext = createContext<WishlistContextValue | null>(null);

// Same model as the cart: a guest list in this browser, a local copy per account for an
// instant display, and the account list on the server (synced shortly after each change).
const GUEST_KEY = 'printma3d_wishlist';
const OWNER_KEY = 'printma3d_wishlist_owner';
const userKey = (uid: string) => `printma3d_wishlist:${uid}`;
const SYNC_DELAY_MS = 800;

function readIds(key: string): string[] {
  try {
    const saved = localStorage.getItem(key);
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function writeIds(key: string, ids: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(ids));
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

/** Union of both lists, keeping the order of the first one. */
function mergeIds(base: string[], extra: string[]) {
  return [...new Set([...base, ...extra])];
}

export function WishlistProvider({ children }: { children: ReactNode }) {
  const ownerRef = useRef<string | null>(readOwner());
  // True once the account list has been loaded: before that, never overwrite it on the server.
  const syncReadyRef = useRef(false);
  const timerRef = useRef<number | undefined>(undefined);
  const [ids, setIds] = useState<string[]>(() =>
    readIds(ownerRef.current ? userKey(ownerRef.current) : GUEST_KEY));

  const scheduleSync = (uid: string, next: string[]) => {
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      if (ownerRef.current !== uid) return;
      void saveUserWishlist(next).catch((err) => console.warn('Sauvegarde des favoris impossible :', err));
    }, SYNC_DELAY_MS);
  };

  const save = (update: (prev: string[]) => string[]) => {
    setIds((prev) => {
      const next = update(prev);
      const owner = ownerRef.current;
      writeIds(owner ? userKey(owner) : GUEST_KEY, next);
      if (owner && syncReadyRef.current) scheduleSync(owner, next);
      return next;
    });
  };

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    let generation = 0;

    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), async (user) => {
      const current = ++generation;
      const uid = user && !user.isAnonymous ? user.uid : null;

      if (!uid) {
        // Signed out: the account list leaves this browser.
        const previousOwner = ownerRef.current;
        if (previousOwner) {
          window.clearTimeout(timerRef.current);
          ownerRef.current = null;
          syncReadyRef.current = false;
          removeStorage(userKey(previousOwner), OWNER_KEY, GUEST_KEY);
          setIds([]);
        }
        return;
      }

      if (ownerRef.current === uid && syncReadyRef.current) return;

      // Signing in: favourites added as a guest are carried over into the account.
      const guestIds = ownerRef.current === null ? readIds(GUEST_KEY) : [];
      if (ownerRef.current && ownerRef.current !== uid) removeStorage(userKey(ownerRef.current));
      ownerRef.current = uid;
      syncReadyRef.current = false;
      try {
        localStorage.setItem(OWNER_KEY, uid);
      } catch {
        // Ignore storage errors
      }
      const cachedIds = readIds(userKey(uid));
      setIds(mergeIds(guestIds, cachedIds));

      let merged: string[];
      try {
        const serverIds = await fetchUserWishlist();
        if (current !== generation || ownerRef.current !== uid) return;
        merged = mergeIds(guestIds, serverIds);
      } catch (err) {
        if (current !== generation || ownerRef.current !== uid) return;
        console.warn('Chargement des favoris impossible :', err);
        merged = mergeIds(guestIds, cachedIds);
      }
      syncReadyRef.current = true;
      removeStorage(GUEST_KEY);
      writeIds(userKey(uid), merged);
      setIds(merged);
      if (guestIds.length > 0) scheduleSync(uid, merged);
    });

    return () => {
      generation += 1;
      unsubscribe();
    };
  }, []);

  const value = useMemo<WishlistContextValue>(() => {
    const set = new Set(ids);
    return {
      ids,
      count: ids.length,
      has: (productId) => set.has(productId),
      toggle: (productId) => save((prev) => (
        prev.includes(productId) ? prev.filter((id) => id !== productId) : [productId, ...prev]
      )),
      remove: (productId) => save((prev) => prev.filter((id) => id !== productId)),
    };
  }, [ids]);

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error('useWishlist doit être utilisé dans WishlistProvider');
  return ctx;
}
