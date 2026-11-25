// Persistent read cache (localStorage) with stale-while-revalidate semantics.
// Fresh entries are served without any network call; stale entries are served
// immediately while a background refresh updates the cache for the next visit.

const PREFIX = '3alam3d:cache:';
const VERSION = 1;

interface Entry<T> {
  version: number;
  storedAt: number;
  value: T;
}

type Listener = () => void;

const inFlight = new Map<string, Promise<unknown>>();
const listeners = new Set<Listener>();

function read<T>(key: string): Entry<T> | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as Entry<T>;
    if (entry.version !== VERSION) return null;
    return entry;
  } catch {
    return null;
  }
}

function write<T>(key: string, value: T) {
  try {
    const entry: Entry<T> = { version: VERSION, storedAt: Date.now(), value };
    localStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {
    // Quota exceeded or storage unavailable: silently fall back to network-only behaviour.
  }
}

function notify() {
  listeners.forEach((listener) => listener());
}

export interface CachedOptions {
  /** Entries younger than this are served without revalidation (ms). */
  freshMs: number;
  /** Entries older than this are ignored and fetched synchronously (ms). */
  maxAgeMs: number;
}

export async function cached<T>(
  key: string,
  loader: () => Promise<T>,
  { freshMs, maxAgeMs }: CachedOptions,
): Promise<T> {
  const entry = read<T>(key);
  const age = entry ? Date.now() - entry.storedAt : Infinity;

  if (entry && age < freshMs) return entry.value;

  const refresh = () => {
    const pending = inFlight.get(key) as Promise<T> | undefined;
    if (pending) return pending;
    const promise = loader()
      .then((value) => {
        write(key, value);
        notify();
        return value;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, promise);
    return promise;
  };

  if (entry && age < maxAgeMs) {
    void refresh().catch(() => undefined);
    return entry.value;
  }

  return refresh();
}

/** Reads a cached value directly (no network), or null when absent. */
export function readCached<T>(key: string): T | null {
  return read<T>(key)?.value ?? null;
}

/** Stores a value in the cache directly. */
export function writeCached<T>(key: string, value: T) {
  write(key, value);
}

/** Drops cached entries whose key starts with one of the given prefixes (all entries when omitted). */
export function invalidateCache(...prefixes: string[]) {
  try {
    const keys: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !key.startsWith(PREFIX)) continue;
      const bare = key.slice(PREFIX.length);
      if (prefixes.length === 0 || prefixes.some((prefix) => bare.startsWith(prefix))) keys.push(key);
    }
    keys.forEach((key) => localStorage.removeItem(key));
  } catch {
    // ignore
  }
}

/** Subscribe to background refreshes so views can re-render with fresher data. */
export function onCacheUpdate(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
