import './env';
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pool } from '../lib/db';
async function main() {
  const db=await pool().connect();
  try {
    await db.query("SELECT pg_advisory_lock(7463821)");
    await db.query('CREATE TABLE IF NOT EXISTS platform_migrations(name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    const names = (await readdir('migrations/postgres')).filter(n=>n.endsWith('.sql')).sort();
    if (!names.includes('001_auth.sql')) {
      console.error('Auth schema is not generated yet. Run npx tsx scripts/generate-auth.ts against the empty local database first.');
      throw new Error('Auth migration missing');
    }
    for (const name of names) {
      const sql=await readFile('migrations/postgres/'+name,'utf8');
      const hash=createHash('sha256').update(sql).digest('hex');
      const prior=(await db.query('SELECT checksum FROM platform_migrations WHERE name=$1',[name])).rows[0];
      if(prior) { if(prior.checksum!==hash) throw new Error('Applied migration changed: '+name); continue; }
      await db.query('BEGIN');
      try { await db.query(sql); await db.query('INSERT INTO platform_migrations(name,checksum) VALUES($1,$2)',[name,hash]); await db.query('COMMIT'); }
      catch(e) { await db.query('ROLLBACK'); throw e; }
      console.log('Applied '+name);
    }
  } finally { await db.query('SELECT pg_advisory_unlock(7463821)'); db.release(); await pool().end(); }
}
main().catch(()=>{console.error('Migration failed. Check database availability and the reviewed migrations. No credentials were logged.');process.exitCode=1;});
