import type { Pool } from 'pg';
import type { Access } from '../authorization';
import { pool } from '../db';
import { UploadError } from '../validation';
import { batchProcessingStatus } from '../jobs/batch-status';
import { digest } from '../jobs/core';
import { borrowerTransaction } from './transaction';

/** Receipt history, not processing-event.v1. Reads never enqueue work.
 * A card's immutable ID survives retries; its revision is an equality token.
 * Poll pages serially to avoid replacing new snapshots with old responses. */
export class ConversationUploads {
  constructor(private readonly access: Access, private readonly database: Pool = pool()) {}
  async read(before?: string) {
    if (before !== undefined && (!/^[1-9][0-9]{0,18}$/.test(before) || BigInt(before)>9223372036854775807n))
      throw new UploadError('Invalid upload history cursor.');
    return borrowerTransaction(this.database, this.access, async db => {
      const rows=(await db.query(`SELECT u.id::text,u.conversation_id,u.batch_id,u.created_at,b.state
        FROM borrower_conversation_uploads u JOIN upload_batches b ON b.id=u.batch_id
        WHERE u.application_id=$1 AND u.borrower_user_id=$2 AND ($3::bigint IS NULL OR u.id<$3::bigint)
        ORDER BY u.id DESC LIMIT 11`,[this.access.applicationId,this.access.userId,before??null])).rows;
      const cards=[];
      for(const row of rows.slice(0,10)) {
        const status=await batchProcessingStatus(db,this.access,{id:row.batch_id,state:row.state});
        cards.push({artifactId:`upload:${row.id}`,conversationId:row.conversation_id,batchId:row.batch_id,
          createdAt:new Date(row.created_at).toISOString(),state:row.state,...status});
      }
      return {schemaVersion:'conversation-uploads.v1' as const,cards,revision:digest(cards),
        nextBefore:rows.length>10?rows[9].id as string:null,pollAfterMs:3000};
    });
  }
}
export type ConversationUploadPage = Awaited<ReturnType<ConversationUploads['read']>>;
