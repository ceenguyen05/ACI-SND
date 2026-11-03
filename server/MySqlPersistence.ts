import { createPool, type PoolOptions, type RowDataPacket } from 'mysql2/promise';
import type { Account, AccountPersistence } from './AccountStore';

/** Server-only connection settings. TLS certificate and hostname verification stay enabled. */
export function mysqlOptions(env: NodeJS.ProcessEnv): PoolOptions {
  const required = (key: string) => { const v = env[key]; if (!v?.trim()) throw new Error(`Set ${key} for MySQL profile storage`); return v; };
  const port = Number(required('MYSQL_PORT'));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('MYSQL_PORT must be a valid port');
  const ca = required('MYSQL_SSL_CA').replace(/\\n/g, '\n');
  if (!ca.includes('-----BEGIN CERTIFICATE-----') || !ca.includes('-----END CERTIFICATE-----')) throw new Error('MYSQL_SSL_CA must contain the Aiven CA certificate');
  return { host: required('MYSQL_HOST').trim(), port, user: required('MYSQL_USER').trim(), password: required('MYSQL_PASSWORD'),
    database: required('MYSQL_DATABASE').trim(), ssl: { ca, rejectUnauthorized: true, verifyIdentity: true },
    connectionLimit: 2, maxIdle: 1, idleTimeout: 60_000, queueLimit: 8, connectTimeout: 10_000, charset: 'utf8mb4' };
}

export function mysqlPersistence(env: NodeJS.ProcessEnv = process.env): AccountPersistence {
  const pool = createPool(mysqlOptions(env));
  return {
    async load() {
      await pool.query({ sql: `CREATE TABLE IF NOT EXISTS aci_accounts (
        token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
        id CHAR(36) NOT NULL UNIQUE,
        career JSON NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`, timeout: 10_000 });
      const [rows] = await pool.query<RowDataPacket[]>({ sql: 'SELECT id, token_hash, career FROM aci_accounts', timeout: 10_000 });
      return rows.map(row => ({ id: row.id as string, tokenHash: row.token_hash as string,
        career: typeof row.career === 'string' ? JSON.parse(row.career) : row.career })) as Account[];
    },
    async save(accounts) {
      // Parameterized, bounded batches; absolute career snapshots make retries idempotent.
      for (let i = 0; i < accounts.length; i += 64) {
        const batch = accounts.slice(i, i + 64);
        await pool.execute({ sql: `INSERT INTO aci_accounts (id, token_hash, career) VALUES ${batch.map(() => '(?, ?, ?)').join(', ')}
          ON DUPLICATE KEY UPDATE career = VALUES(career)`, timeout: 10_000 }, batch.flatMap(a => [a.id, a.tokenHash, JSON.stringify(a.career)]));
      }
    },
    async close() { await pool.end(); },
  };
}
