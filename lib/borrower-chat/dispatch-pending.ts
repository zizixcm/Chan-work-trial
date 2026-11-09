import type {Pool} from 'pg';
import {ChatProcessingBridge} from './processing-bridge';
/** Worker/runner hook, never called by GET. Reuses the intent outbox and processor
 * idempotency. Crashes before admission or binding leave the same durable identity
 * eligible; concurrent hooks cannot create a second processor run. */
export async function dispatchPendingChatDelegations(database:Pool,limit=10) {
  if(!Number.isInteger(limit)||limit<1||limit>100)throw new Error('Invalid dispatch batch size');
  const rows=(await database.query(`SELECT d.id,d.application_id,d.borrower_user_id,u.name FROM borrower_chat_delegations d
    JOIN application_memberships m ON m.application_id=d.application_id AND m.user_id=d.borrower_user_id AND m.active AND m.role='borrower'
    JOIN "user" u ON u.id=d.borrower_user_id
    WHERE d.accepted_event IS NULL AND d.admission_attempts<5 AND d.next_admission_at<=now()
    ORDER BY d.created_at,d.id LIMIT $1`,[limit])).rows;
  let admitted=0,deferred=0;
  for(const row of rows) {
    try {
      await new ChatProcessingBridge({applicationId:row.application_id,userId:row.borrower_user_id,displayName:row.name,role:'borrower'},database).dispatch(row.id);
      admitted++;
    }catch {
      // No raw parser/provider/SQL messages in borrower-visible status. A bounded
      // retry window leaves permanent conflicts visible for explicit recovery.
      await database.query(`UPDATE borrower_chat_delegations SET admission_attempts=admission_attempts+1,
        next_admission_at=now()+interval '30 seconds',admission_error='admission_unavailable'
        WHERE id=$1 AND accepted_event IS NULL`,[row.id]);
      deferred++;
    }
  }
  return {admitted,deferred};
}
