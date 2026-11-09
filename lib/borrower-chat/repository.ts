import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { Access } from '../authorization';
import { pool } from '../db';
import { UploadError } from '../validation';
import { borrowerTransaction } from './transaction';
import { parseMessageInput, parseMessagePage, type Conversation, type ConversationMessage, type MessagePage } from './contracts';

const iso = (value: Date | string) => new Date(value).toISOString();
function conversation(row: Record<string, any>): Conversation {
  return {id: row.id, applicationId: row.application_id, lastSequence: String(row.last_sequence),
    createdAt: iso(row.created_at), updatedAt: iso(row.updated_at)};
}
function message(row: Record<string, any>): ConversationMessage {
  return {id: row.id, conversationId: row.conversation_id, sequence: String(row.sequence),
    clientMessageId: row.client_message_id, role: 'borrower', text: row.body,
    createdAt: iso(row.created_at), responseState: row.answer_id ? 'available' : 'not_requested',
    ...(row.answer_id ? {answerId: row.answer_id as string} : {})};
}
export class ConversationRepository {
  constructor(private readonly access: Access, private readonly database: Pool = pool()) {}
  private async find(db: PoolClient) {
    return (await db.query(`SELECT id,application_id,last_sequence,created_at,updated_at FROM borrower_conversations
      WHERE application_id=$1 AND borrower_user_id=$2`, [this.access.applicationId, this.access.userId])).rows[0];
  }
  async create() {
    return borrowerTransaction(this.database, this.access, async db => {
      const existing = await this.find(db);
      if (existing) return {conversation: conversation(existing), created: false};
      const row = (await db.query(`INSERT INTO borrower_conversations(id,application_id,borrower_user_id)
        VALUES($1,$2,$3) RETURNING id,application_id,last_sequence,created_at,updated_at`,
        [randomUUID(), this.access.applicationId, this.access.userId])).rows[0];
      return {conversation: conversation(row), created: true};
    }, 'READ COMMITTED');
  }
  async read(page: MessagePage = {after: '0', limit: 50}) {
    const checked = parseMessagePage(new URLSearchParams({after: page.after, limit: String(page.limit)}));
    return borrowerTransaction(this.database, this.access, async db => {
      const row = await this.find(db);
      if (!row) return {conversation: null, messages: [], nextAfter: null, hasMore: false};
      const rows = (await db.query(`SELECT id,conversation_id,sequence,client_message_id,body,created_at,
        (SELECT id FROM borrower_conversation_answers WHERE message_id=borrower_conversation_messages.id) AS answer_id
        FROM borrower_conversation_messages WHERE application_id=$1 AND conversation_id=$2 AND borrower_user_id=$3
        AND sequence>$4 ORDER BY sequence LIMIT $5`,
        [this.access.applicationId, row.id, this.access.userId, checked.after, checked.limit + 1])).rows;
      const messages = rows.slice(0, checked.limit).map(message);
      return {conversation: conversation(row), messages, hasMore: rows.length > checked.limit,
        nextAfter: messages.at(-1)?.sequence ?? null};
    });
  }
  async append(value: unknown) {
    const input = parseMessageInput(value);
    const bodyDigest = createHash('sha256').update(input.text).digest('hex');
    return borrowerTransaction(this.database, this.access, async db => {
      const current = await this.find(db);
      if (!current) throw new UploadError('Create the application conversation before sending a message.', 409);
      const prior = (await db.query(`SELECT id,conversation_id,sequence,client_message_id,body,body_digest,created_at,
        (SELECT id FROM borrower_conversation_answers WHERE message_id=borrower_conversation_messages.id) AS answer_id
        FROM borrower_conversation_messages WHERE application_id=$1 AND conversation_id=$2 AND borrower_user_id=$3
        AND client_message_id=$4`, [this.access.applicationId, current.id, this.access.userId, input.clientMessageId])).rows[0];
      if (prior) {
        if (prior.body_digest !== bodyDigest) throw new UploadError('This message ID was already used for different text.', 409);
        return {message: message(prior), replayed: true};
      }
      const sequence = (await db.query(`UPDATE borrower_conversations SET last_sequence=last_sequence+1,updated_at=clock_timestamp()
        WHERE id=$1 AND application_id=$2 AND borrower_user_id=$3 RETURNING last_sequence`,
        [current.id, this.access.applicationId, this.access.userId])).rows[0].last_sequence;
      const row = (await db.query(`INSERT INTO borrower_conversation_messages
        (id,application_id,conversation_id,borrower_user_id,sequence,client_message_id,body,body_digest)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,conversation_id,sequence,client_message_id,body,created_at`,
        [randomUUID(), this.access.applicationId, current.id, this.access.userId, sequence, input.clientMessageId, input.text, bodyDigest])).rows[0];
      // Foundation only: durable text receipt, no pending AI turn or hidden job.
      return {message: message(row), replayed: false};
    }, 'READ COMMITTED');
  }
}
