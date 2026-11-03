import { describe, expect, it, vi } from 'vitest';
import { AccountStore, type Account, type AccountPersistence } from '../../server/AccountStore';
import { mysqlOptions } from '../../server/MySqlPersistence';
import { awardAction, newCareer, XP } from '../../src/progression/career';
import { createGameServer } from '../../server/index';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function database() {
  const rows = new Map<string, Account>();
  const adapter = {
    load: vi.fn(async () => clone([...rows.values()])),
    save: vi.fn(async (accounts: Account[]) => { for (const a of accounts) rows.set(a.tokenHash, clone(a)); }),
    close: vi.fn(async () => {}),
  } satisfies AccountPersistence;
  return { rows, adapter };
}

describe('database-backed online careers', () => {
  it('resumes earned XP, rank and the same hashed identity after reopening the store', async () => {
    const { rows, adapter } = database(), store = await AccountStore.fromPersistence(adapter);
    const login = store.authenticate();
    awardAction(login.account.career, 'plant', 0); login.account.career.rank.games = 6;
    store.changed(); await store.close();
    expect(rows.size).toBe(1); expect(JSON.stringify([...rows.values()])).not.toContain(login.token!);
    const reopened = await AccountStore.fromPersistence(adapter), resumed = reopened.authenticate(login.token);
    expect(resumed.account.id).toBe(login.account.id);
    expect(resumed.account.career.xp).toBe(XP.plant);
    expect(resumed.account.career.rank.games).toBe(6); expect(resumed.token).toBeUndefined();
    await reopened.close();
  });
  it('does not write unused guests or unchanged profiles on every persistence timer', async () => {
    const { adapter } = database(), store = await AccountStore.fromPersistence(adapter), login = store.authenticate();
    store.changed(); await store.flush(); expect(adapter.save).not.toHaveBeenCalled();
    awardAction(login.account.career, 'kill', 0); store.changed(); await store.flush();
    store.changed(); await store.flush(); await store.flush();
    expect(adapter.save).toHaveBeenCalledTimes(1); await store.close();
  });
  it('freezes a save snapshot and serializes newer rewards behind an in-flight write', async () => {
    const { adapter, rows } = database(), store = await AccountStore.fromPersistence(adapter), login = store.authenticate();
    let finish!: () => void;
    adapter.save.mockImplementationOnce(async accounts => {
      await new Promise<void>(resolve => { finish = resolve; });
      for (const a of accounts) rows.set(a.tokenHash, clone(a));
    });
    awardAction(login.account.career, 'kill', 0); store.changed(); const first = store.flush();
    awardAction(login.account.career, 'plant', 0); store.changed(); const second = store.flush();
    expect(adapter.save.mock.calls[0][0][0].career.xp).toBe(XP.kill);
    finish(); await Promise.all([first, second]);
    expect(adapter.save).toHaveBeenCalledTimes(2);
    expect(rows.get(login.account.tokenHash)?.career.xp).toBe(XP.kill + XP.plant); await store.close();
  });
  it('retains failed saves, reports unhealthy storage, and retries without duplicating rewards', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { adapter, rows } = database(), store = await AccountStore.fromPersistence(adapter), login = store.authenticate();
      awardAction(login.account.career, 'plant', 0); store.changed();
      adapter.save.mockRejectedValueOnce(new Error('Database offline'));
      await store.flush(); expect(store.healthy).toBe(false); expect(rows.size).toBe(0);
      awardAction(login.account.career, 'defuse', 0); store.changed(); await store.flush();
      expect(store.healthy).toBe(true);
      expect(rows.get(login.account.tokenHash)?.career.xp).toBe(XP.plant + XP.defuse + XP.daily);
      await store.close();
    } finally { log.mockRestore(); }
  });
  it('fails closed on unavailable or incompatible stored data rather than creating a blank career store', async () => {
    const { adapter } = database(); adapter.load.mockRejectedValueOnce(new Error('Database offline'));
    await expect(AccountStore.fromPersistence(adapter)).rejects.toThrow('Database offline');
    expect(adapter.close).toHaveBeenCalledOnce();
    adapter.load.mockResolvedValueOnce([{ id: 'bad', tokenHash: 'invalid', career: newCareer() }]);
    await expect(AccountStore.fromPersistence(adapter)).rejects.toThrow('Invalid stored');
    expect(adapter.save).not.toHaveBeenCalled();
  });
  it('exposes database storage/health and waits for the final save during game-server shutdown', async () => {
    const { adapter, rows } = database(), accounts = await AccountStore.fromPersistence(adapter);
    const app = createGameServer({ accounts });
    await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
    const address = app.server.address(); if (!address || typeof address === 'string') throw new Error('No address');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/health`);
      expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ status: 'ok', storage: 'mysql' });
      const login = accounts.authenticate(); awardAction(login.account.career, 'defuse', 0); accounts.changed();
      adapter.save.mockRejectedValueOnce(new Error('Database offline')); await accounts.flush();
      // Liveness stays 200 so the host never restarts live matches over a database blip; readiness reports it.
      const live = await fetch(`http://127.0.0.1:${address.port}/health`);
      expect(live.status).toBe(200); expect(await live.json()).toMatchObject({ status: 'storage_unavailable', storage: 'mysql' });
      const ready = await fetch(`http://127.0.0.1:${address.port}/ready`);
      expect(ready.status).toBe(503);
    } finally { await app.close(); log.mockRestore(); }
    expect([...rows.values()][0].career.xp).toBe(XP.defuse); expect(adapter.close).toHaveBeenCalledOnce();
  });
});

describe('Aiven connection configuration', () => {
  const env = { MYSQL_HOST: 'db.aivencloud.com', MYSQL_PORT: '12345', MYSQL_USER: 'avnadmin', MYSQL_PASSWORD: 'example password',
    MYSQL_DATABASE: 'defaultdb', MYSQL_SSL_CA: '-----BEGIN CERTIFICATE-----\\nexample\\n-----END CERTIFICATE-----' };
  it('keeps certificate and hostname checks enabled with a small backend-only connection pool', () => {
    expect(mysqlOptions(env)).toMatchObject({ host: env.MYSQL_HOST, port: 12345, password: env.MYSQL_PASSWORD,
      connectionLimit: 2, ssl: { rejectUnauthorized: true, verifyIdentity: true, ca: env.MYSQL_SSL_CA.replace(/\\n/g, '\n') } });
  });
  it('rejects missing credentials, invalid ports and a certificate filename used instead of its contents', () => {
    expect(() => mysqlOptions({ ...env, MYSQL_PASSWORD: '' })).toThrow('MYSQL_PASSWORD');
    expect(() => mysqlOptions({ ...env, MYSQL_PORT: '0' })).toThrow('MYSQL_PORT');
    expect(() => mysqlOptions({ ...env, MYSQL_SSL_CA: 'ca.pem' })).toThrow('certificate');
  });
});
