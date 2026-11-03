import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { newCareer, restoreCareer, type Career } from '../src/progression/career';
export interface Account { id: string; tokenHash: string; career: Career }
export interface AccountPersistence {
  load(): Promise<Account[]>;
  save(accounts: Account[]): Promise<void>;
  close(): Promise<void>;
}
const hash = (v: string) => createHash('sha256').update(v).digest('hex');
/** Disconnected profiles that never earned anything, kept only so a quick reconnect resumes them. */
const MAX_IDLE_GUESTS = 5000;
const hasProgress = (a: Account) => a.career.xp > 0 || a.career.matches > 0 || a.career.rank.games > 0 || a.career.recentMatches.length > 0;

/** Browser-held random credentials; server-only career/rank on a persistent volume.
 * An undefined path is an in-memory store for deterministic tests.
 * Only profiles with progress are written, so anonymous connections cannot grow the file. */
export class AccountStore {
  private accounts = new Map<string, Account>();
  private idleGuests = new Set<string>();
  private dirty = false;
  private persistence?: AccountPersistence;
  private saved = new Map<string, string>();
  private pending: Promise<void> | null = null;
  private saveFailed = false;
  get storage() { return this.persistence ? 'mysql' : this.file ? 'file' : 'memory'; }
  get healthy() { return !this.saveFailed; }
  /** Load durable records before accepting connections; database failure never resets careers. */
  static async fromPersistence(persistence: AccountPersistence) {
    const store = new AccountStore();
    store.persistence = persistence;
    try {
      for (const a of await persistence.load()) {
        if (!/^[a-f0-9]{64}$/.test(a.tokenHash) || typeof a.id !== 'string' || !a.id || a.career?.version !== 1) throw new Error('Invalid stored online profile');
        const account = { ...a, career: restoreCareer(a.career) };
        store.accounts.set(account.tokenHash, account);
        store.saved.set(account.tokenHash, JSON.stringify(account.career));
      }
      return store;
    } catch (error) { await persistence.close(); throw error; }
  }
  constructor(private file?: string) {
    if (file && existsSync(file)) {
      const data = JSON.parse(readFileSync(file, 'utf8')) as { version: number; accounts: Account[] };
      if (data.version !== 1 || !Array.isArray(data.accounts)) throw new Error('Unsupported account store. Preserve the file and restore a valid backup.');
      for (const a of data.accounts) if (typeof a.id === 'string' && /^[a-f0-9]{64}$/.test(a.tokenHash)) this.accounts.set(a.tokenHash, { ...a, career: restoreCareer(a.career) });
    }
  }
  authenticate(token?: string) {
    if (token && /^[a-f0-9]{64}$/.test(token)) {
      const account = this.accounts.get(hash(token));
      if (account) { this.idleGuests.delete(account.tokenHash); return { account, token: undefined }; }
    }
    const secret = randomBytes(32).toString('hex');
    const account: Account = { id: randomUUID(), tokenHash: hash(secret), career: newCareer() };
    this.accounts.set(account.tokenHash, account);
    return { account, token: secret };
  }
  /** The account's connection closed. Profiles without progress are bounded in memory. */
  release(account: Account) {
    if (hasProgress(account)) return;
    this.idleGuests.delete(account.tokenHash); this.idleGuests.add(account.tokenHash);
    for (const key of this.idleGuests) {
      if (this.idleGuests.size <= MAX_IDLE_GUESTS) break;
      this.idleGuests.delete(key); this.accounts.delete(key);
    }
  }
  changed() { this.dirty = true; }
  flush(): void | Promise<void> {
    if (this.persistence) return this.flushRemote();
    if (!this.file || !this.dirty) return;
    // Called from the game tick: a full or read-only disk must not take every room down.
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify({ version: 1, accounts: [...this.accounts.values()].filter(hasProgress) }), { mode: 0o600 });
      renameSync(tmp, this.file); this.dirty = false; this.saveFailed = false;
    } catch (error) {
      this.saveFailed = true;
      console.error('Online profile save failed; changes remain in memory and will be retried.', error);
    }
  }
  private flushRemote(): Promise<void> {
    if (this.pending) return this.pending.then(() => this.dirty && !this.saveFailed ? this.flushRemote() : undefined);
    if (!this.dirty) return Promise.resolve();
    this.dirty = false;
    const changed = [...this.accounts.values()].filter(hasProgress).map(account => ({ account, json: JSON.stringify(account.career) }))
      .filter(({ account, json }) => this.saved.get(account.tokenHash) !== json);
    if (!changed.length) return Promise.resolve();
    // Freeze each snapshot before the first await. Gameplay can keep awarding XP during a save.
    const snapshots = changed.map(({ account, json }) => ({ ...account, career: JSON.parse(json) as Career }));
    this.pending = this.persistence!.save(snapshots).then(() => {
      for (const { account, json } of changed) this.saved.set(account.tokenHash, json);
      this.saveFailed = false;
    }).catch(() => {
      this.dirty = true; this.saveFailed = true;
      console.error('Online profile save failed; changes remain in memory and will be retried.');
    }).finally(() => { this.pending = null; });
    return this.pending;
  }
  async close() {
    try {
      await this.flush();
      if (this.saveFailed) throw new Error('Online profiles could not be saved before shutdown');
    } finally { await this.persistence?.close(); }
  }
}
