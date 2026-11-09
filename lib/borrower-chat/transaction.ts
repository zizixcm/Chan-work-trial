import type { Pool, PoolClient } from 'pg';
import type { Access } from '../authorization';
import { authorize } from '../jobs/core';
import { UploadError } from '../validation';

/** One MVCC snapshot for context + freshness reads. Locks also fence membership
 * revocation and serialize writes in the existing application-first lock order.
 * Retry only serialization failures; callbacks must contain DB work only. */
export async function borrowerTransaction<T>(database: Pool, access: Access, work: (db: PoolClient) => Promise<T>, isolation: 'REPEATABLE READ' | 'READ COMMITTED' = 'REPEATABLE READ'): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const db = await database.connect();
    try {
      await db.query(`BEGIN ISOLATION LEVEL ${isolation}`);
      await authorize(db, access, ['borrower']);
      const result = await work(db);
      await db.query('COMMIT');
      return result;
    } catch (error) {
      await db.query('ROLLBACK');
      if ((error as {code?: string}).code !== '40001') throw error;
      if (attempt >= 2) throw new UploadError('The application changed. Refresh and retry.', 409);
    } finally { db.release(); }
  }
}
