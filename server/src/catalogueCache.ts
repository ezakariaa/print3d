import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** Key/value store shared by every server instance (Vercel Runtime Cache in production). */
export interface SharedStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  /** Keeps a write alive after the response has been sent (serverless). */
  background(task: Promise<unknown>): void;
}

export interface CatalogueCacheOptions {
  /** Local file copy, so a restart of a long-running server costs no Firestore read. */
  filePath?: string | null;
  /** Copy shared between serverless instances; a cold start reads it instead of Firestore. */
  shared?: SharedStore | null;
  /**
   * How long the in-memory copy is trusted before checking the shared copy again (ms).
   * Lets an instance see writes made by another instance. Infinity for a single server.
   */
  memoryTtlMs?: number;
}

/**
 * Write-through catalogue cache.
 *
 * Firestore is read at most once per collection: the list is then held in memory,
 * on disk (single server) or in the shared store (serverless), and every admin write
 * updates those copies directly, so no re-read is needed.
 */
// After a failed Firestore load (quota, network), wait before retrying so that
// a burst of visitors does not turn into a burst of failing reads.
const RETRY_DELAY_MS = 60_000;

export class CatalogueCache<T extends { id: string }> {
  private items: Map<string, T> | null = null;
  private loadedAt = 0;
  private pending: Promise<T[]> | null = null;
  private lastFailure: { at: number; error: unknown } | null = null;
  private forceReload = false;
  private readonly filePath: string | null;
  private readonly shared: SharedStore | null;
  private readonly memoryTtlMs: number;

  constructor(
    private readonly name: string,
    options: CatalogueCacheOptions,
    private readonly load: () => Promise<T[]>,
  ) {
    this.filePath = options.filePath ?? null;
    this.shared = options.shared ?? null;
    this.memoryTtlMs = options.memoryTtlMs ?? Infinity;
  }

  private get sharedKey() {
    return `catalogue:${this.name}`;
  }

  /** Returns the cached list, loading it from disk, the shared store or Firestore when needed. */
  async list(): Promise<T[]> {
    if (this.items && Date.now() - this.loadedAt < this.memoryTtlMs) {
      return [...this.items.values()];
    }
    if (this.lastFailure && Date.now() - this.lastFailure.at < RETRY_DELAY_MS) {
      if (this.items) return [...this.items.values()];
      throw this.lastFailure.error;
    }
    if (!this.pending) {
      this.pending = this.initialise()
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

  upsert(item: T) {
    if (!this.items) {
      // No full copy here: never store a partial list, make the next read reload instead.
      this.dropShared();
      return;
    }
    this.items.set(item.id, item);
    this.persist();
  }

  remove(id: string) {
    if (!this.items) {
      this.dropShared();
      return;
    }
    this.items.delete(id);
    this.persist();
  }

  /** Forces the next list() to go back to Firestore (used by the explicit admin refresh). */
  reset() {
    this.items = null;
    this.lastFailure = null;
    this.forceReload = true;
    this.dropShared();
  }

  private async initialise(): Promise<T[]> {
    if (!this.forceReload) {
      const fromDisk = this.readDisk();
      if (fromDisk) return this.keep(fromDisk, 'le disque');

      const fromShared = await this.readShared();
      if (fromShared) return this.keep(fromShared, 'le cache partagé', { quiet: true });
    }
    this.forceReload = false;
    const loaded = await this.load();
    this.keep(loaded, 'Firestore');
    this.persist();
    return loaded;
  }

  private keep(list: T[], source: string, { quiet = false } = {}): T[] {
    this.items = new Map(list.map((item) => [item.id, item]));
    this.loadedAt = Date.now();
    if (!quiet) console.log(`[cache] ${this.name}: ${list.length} élément(s) chargé(s) depuis ${source}.`);
    return list;
  }

  private readDisk(): T[] | null {
    if (!this.filePath || !existsSync(this.filePath)) return null;
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as unknown;
      return Array.isArray(parsed) ? (parsed as T[]) : null;
    } catch (error) {
      console.warn(`[cache] ${this.name}: fichier de cache illisible, rechargement.`, error);
      return null;
    }
  }

  private async readShared(): Promise<T[] | null> {
    if (!this.shared) return null;
    try {
      const value = await Promise.resolve().then(() => this.shared!.get(this.sharedKey));
      return Array.isArray(value) ? (value as T[]) : null;
    } catch (error) {
      console.warn(`[cache] ${this.name}: cache partagé indisponible.`, error);
      return null;
    }
  }

  private dropShared() {
    if (!this.shared) return;
    this.shared.background(
      Promise.resolve().then(() => this.shared!.delete(this.sharedKey)).catch((error: unknown) => {
        console.warn(`[cache] ${this.name}: invalidation du cache partagé impossible.`, error);
      }),
    );
  }

  private persist() {
    if (!this.items) return;
    this.loadedAt = Date.now();
    const list = [...this.items.values()];

    if (this.shared) {
      this.shared.background(
        Promise.resolve().then(() => this.shared!.set(this.sharedKey, list)).catch((error: unknown) => {
          console.warn(`[cache] ${this.name}: écriture du cache partagé impossible.`, error);
        }),
      );
    }

    if (!this.filePath) return;
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      writeFileSync(tmp, JSON.stringify(list));
      renameSync(tmp, this.filePath);
    } catch (error) {
      console.warn(`[cache] ${this.name}: écriture du cache impossible.`, error);
    }
  }
}
