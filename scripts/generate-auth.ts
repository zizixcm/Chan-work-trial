import './env';
import { writeFile } from 'node:fs/promises';
import { getMigrations } from 'better-auth/db/migration';
import { createAuth } from '../lib/auth';
import { pool } from '../lib/db';
async function main() {
  const plan = await getMigrations(createAuth().options);
  await writeFile('migrations/postgres/001_auth.sql',await plan.compileMigrations(),{flag:'wx'});
  console.log('Generated auth migration; review before applying.');
  await pool().end();
}
main().catch(()=>{console.error('Auth migration generation failed. Check database availability or whether the migration already exists.');process.exitCode=1;});
