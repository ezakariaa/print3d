import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Write-through catalogue cache.
 *
 * Firestore is read at most once per collection (on first access); every admin
 * write updates the in-memory copy directly, so no re-read is ever needed.
 * The copy is also persisted to disk so a server restart does not cost a new read.
 */
// After a failed Firestore load (quota, network), wait before retrying so that
// a burst of visitors does not turn into a burst of failing reads.
const RETRY_DELAY_MS = 60_000;

export class CatalogueCache<T extends { id: string }> {
  private items: Map<string, T> | null = null;
  private pending: Promise<T[]> | null = null;
  private lastFailure: { at: number; error: unknown } | null = null;
  private forceReload = false;

  constructor(
    private readonly name: string,
    private readonly filePath: string | null,
    private readonly load: () => Promise<T[]>,
  ) {}

  /** Returns the cached list, loading it from disk or Firestore the first time only. */
  async list(): Promise<T[]> {
    if (this.items) return [...this.items.values()];
    if (this.lastFailure && Date.now() - this.lastFailure.at < RETRY_DELAY_MS) {
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
          throw error;
        })
        .finally(() => {
          this.pending = null;
        });
    }
    return this.pending;
  }

  /** True once a copy is held (disk or Firestore); false before the first load. */
  get primed(): boolean {
    return this.items !== null;
  }

  upsert(item: T) {
    this.items ??= new Map();
    this.items.set(item.id, item);
    this.persist();
  }

  remove(id: string) {
    if (!this.items) return;
    this.items.delete(id);
    this.persist();
  }

  /** Forces the next list() to go back to Firestore (used by the explicit admin refresh). */
  reset() {
    this.items = null;
    this.lastFailure = null;
    this.forceReload = true;
  }

  private async initialise(): Promise<T[]> {
    if (!this.forceReload) {
      const fromDisk = this.readDisk();
      if (fromDisk) {
        this.items = new Map(fromDisk.map((item) => [item.id, item]));
        console.log(`[cache] ${this.name}: ${fromDisk.length} élément(s) chargé(s) depuis le disque.`);
        return fromDisk;
      }
    }
    this.forceReload = false;
    const loaded = await this.load();
    this.items = new Map(loaded.map((item) => [item.id, item]));
    this.persist();
    console.log(`[cache] ${this.name}: ${loaded.length} élément(s) chargé(s) depuis Firestore.`);
    return loaded;
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

  private persist() {
    if (!this.filePath || !this.items) return;
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      writeFileSync(tmp, JSON.stringify([...this.items.values()]));
      renameSync(tmp, this.filePath);
    } catch (error) {
      console.warn(`[cache] ${this.name}: écriture du cache impossible.`, error);
    }
  }
}
