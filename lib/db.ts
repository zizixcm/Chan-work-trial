import { Pool } from 'pg';
const globalDb = globalThis as unknown as { portalPool?: Pool };
export function pool() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing; run npm run setup:local.');
  return globalDb.portalPool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
}
