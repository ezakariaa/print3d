/**
 * Write-through catalogue cache, kept consistent between several servers.
 *
 * Several servers write to the same Firestore (the Vercel API and a local dev API), so each
 * collection has a version, stored in one small Firestore document. Every write records a new
 * version; readers compare versions (one shared read per minute at most, see VersionSource)
 * and reload a collection only when it changed somewhere else.
 */

/** Versions of every collection, shared by all servers. */
export interface VersionSource {
  /** Current versions, by collection name (memoised: at most one read per interval). */
  current(): Promise<Record<string, string>>;
  /** Records that a collection changed; returns the new version (written in the background). */
  bump(name: string): string;
}

/** Key/value store shared by every serverless instance (Vercel Runtime Cache in production). */
export interface SharedStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  /** Keeps a write alive after the response has been sent (serverless). */
  background(task: Promise<unknown>): void;
}

export interface CatalogueCacheOptions {
  versions: VersionSource;
  /** Copy shared between serverless instances, so a cold start does not read Firestore. */
  shared?: SharedStore | null;
}

interface SharedEntry<T> {
  version: string;
  items: T[];
}

// After a failed Firestore load (quota, network), wait before retrying so that
// a burst of visitors does not turn into a burst of failing reads.
const RETRY_DELAY_MS = 60_000;
const NO_VERSION = '0';

export class CatalogueCache<T extends { id: string }> {
  private items: Map<string, T> | null = null;
  /** Version of the collection that `items` reflects. */
  private version: string | null = null;
  private pending: Promise<T[]> | null = null;
  private lastFailure: { at: number; error: unknown } | null = null;
  private forceReload = false;
  private readonly versions: VersionSource;
  private readonly shared: SharedStore | null;

  constructor(
    private readonly name: string,
    options: CatalogueCacheOptions,
    private readonly load: () => Promise<T[]>,
  ) {
    this.versions = options.versions;
    this.shared = options.shared ?? null;
  }

  private get sharedKey() {
    return `catalogue:${this.name}`;
  }

  /** Returns the list, reloading it only when another server changed the collection. */
  async list(): Promise<T[]> {
    let remote: string | null = null;
    try {
      remote = (await this.versions.current())[this.name] ?? NO_VERSION;
    } catch (error) {
      // Without the version, a copy we already hold is the best answer.
      if (this.items) return [...this.items.values()];
      console.warn(`[cache] ${this.name}: version indisponible.`, error);
    }
    if (this.items && !this.forceReload && (remote === null || remote === this.version)) {
      return [...this.items.values()];
    }

    if (this.lastFailure && Date.now() - this.lastFailure.at < RETRY_DELAY_MS) {
      if (this.items) return [...this.items.values()];
      throw this.lastFailure.error;
    }
    if (!this.pending) {
      this.pending = this.initialise(remote ?? NO_VERSION)
        .then((loaded) => {
          this.lastFailure = null;
          return loaded;
        })
        .catch((error: unknown) => {
          this.lastFailure = { at: Date.now(), error };
          // A stale copy is better than an error page.
          if (this.items) return [...this.items.values()];
          throw error;
        })
        .finally(() => {
          this.pending = null;
        });
    }
    return this.pending;
  }

  /** True once a copy is held in memory; false before the first load. */
  get primed(): boolean {
    return this.items !== null;
  }

  /**
   * Records a change written to Firestore and tells the other servers. The copy here is
   * updated at once, then reloaded on the next read: another server may have written too.
   */
  upsert(item: T) {
    this.versions.bump(this.name);
    if (!this.items) return;
    this.items.set(item.id, item);
    this.version = null;
  }

  remove(id: string) {
    this.versions.bump(this.name);
    if (!this.items) return;
    this.items.delete(id);
    this.version = null;
  }

  /** Adds an item just read from Firestore (not a change): no new version. */
  remember(item: T) {
    if (!this.items) return;
    this.items.set(item.id, item);
  }

  /** Forces the next list() to go back to Firestore (used by the explicit admin refresh). */
  reset() {
    this.lastFailure = null;
    this.forceReload = true;
  }

  private async initialise(remote: string): Promise<T[]> {
    if (!this.forceReload) {
      const fromShared = await this.readShared();
      if (fromShared && fromShared.version === remote) {
        return this.keep(fromShared.items, remote);
      }
    }
    this.forceReload = false;
    const loaded = await this.load();
    console.log(`[cache] ${this.name}: ${loaded.length} élément(s) chargé(s) depuis Firestore.`);
    this.keep(loaded, remote);
    this.share();
    return loaded;
  }

  private keep(list: T[], version: string): T[] {
    this.items = new Map(list.map((item) => [item.id, item]));
    this.version = version;
    return list;
  }

  private async readShared(): Promise<SharedEntry<T> | null> {
    if (!this.shared) return null;
    try {
      const value = await Promise.resolve().then(() => this.shared!.get(this.sharedKey));
      const entry = value as Partial<SharedEntry<T>> | null;
      return entry && typeof entry.version === 'string' && Array.isArray(entry.items)
        ? (entry as SharedEntry<T>)
        : null;
    } catch (error) {
      console.warn(`[cache] ${this.name}: cache partagé indisponible.`, error);
      return null;
    }
  }

  private share() {
    if (!this.shared || !this.items || this.version === null) return;
    const entry: SharedEntry<T> = { version: this.version, items: [...this.items.values()] };
    this.shared.background(
      Promise.resolve()
        .then(() => this.shared!.set(this.sharedKey, entry))
        .catch((error: unknown) => {
          console.warn(`[cache] ${this.name}: écriture du cache partagé impossible.`, error);
        }),
    );
  }
}
