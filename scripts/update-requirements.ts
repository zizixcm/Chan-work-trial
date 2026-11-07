import './env';
import { pool } from '../lib/db';
import { applyRequirementCatalog } from '../lib/requirement-catalog';
async function main() {
  const db = await pool().connect();
  try {
    await db.query('BEGIN');
    await applyRequirementCatalog(db);
    await db.query('COMMIT');
    console.log('Updated the refinance checklist. Existing evidence and review history preserved.');
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  finally { db.release(); await pool().end(); }
}
main().catch(() => { console.error('Requirement update failed. Check migrations and database availability.'); process.exitCode=1; });
