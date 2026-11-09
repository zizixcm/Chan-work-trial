import {createHash,randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import type {Access} from '../authorization';
import {pool} from '../db';
import {UploadError} from '../validation';
import {borrowerTransaction} from './transaction';
import {BorrowerContextService} from './context';
import {parseMessagePage,parseMessageInput} from './contracts';
import {buildGroundedAnswer,parseRetrievalInput,retrievalQuestions,type GroundedAnswer,type RetrievalIntent} from './retrieval';

type AnswerRow={id:string;message_id:string;intent:RetrievalIntent;context_revision:string;answer:GroundedAnswer;created_at:Date|string;sequence:string};
function project(row:AnswerRow,revision:string) {
  const freshness=row.context_revision===revision?'current' as const:'outdated' as const;
  return {id:row.id,messageId:row.message_id,sequence:String(row.sequence),intent:row.intent,question:retrievalQuestions[row.intent],
    createdAt:new Date(row.created_at).toISOString(),freshness,answer:freshness==='current'?row.answer:null};
}
export class ConversationAnswers {
  constructor(private readonly access:Access,private readonly database:Pool=pool()){}
  private context(db:PoolClient){return new BorrowerContextService(this.access,this.database).readInTransaction(db);}
  async ask(value:unknown,questionText?:string) {
    const input=parseRetrievalInput(value),text=questionText===undefined?retrievalQuestions[input.intent]:parseMessageInput({clientMessageId:input.clientMessageId,text:questionText}).text;
    return borrowerTransaction(this.database,this.access,async db=>{
      // Same application-first lock as uploads/messages; question and answer commit together.
      await db.query(`INSERT INTO borrower_conversations(id,application_id,borrower_user_id) VALUES($1,$2,$3)
        ON CONFLICT(application_id,borrower_user_id) DO NOTHING`,[randomUUID(),this.access.applicationId,this.access.userId]);
      const conversation=(await db.query('SELECT id FROM borrower_conversations WHERE application_id=$1 AND borrower_user_id=$2',[this.access.applicationId,this.access.userId])).rows[0];
      const prior=(await db.query(`SELECT m.id AS message_id,m.body,m.sequence,a.id,a.intent,a.context_revision,a.answer,a.created_at
        FROM borrower_conversation_messages m LEFT JOIN borrower_conversation_answers a ON a.message_id=m.id
        WHERE m.conversation_id=$1 AND m.client_message_id=$2`,[conversation.id,input.clientMessageId])).rows[0] as (AnswerRow&{body:string})|undefined;
      if(prior&&(!prior.id||prior.intent!==input.intent||prior.body!==text))throw new UploadError('This message ID was already used for a different request.',409);
      const context=await this.context(db);
      if(prior)return {entry:project(prior,context.revision),replayed:true};
      const answer=buildGroundedAnswer(context,input.intent);
      const sequence=(await db.query(`UPDATE borrower_conversations SET last_sequence=last_sequence+1,updated_at=clock_timestamp()
        WHERE id=$1 RETURNING last_sequence::text`,[conversation.id])).rows[0].last_sequence;
      const messageId=randomUUID();
      await db.query(`INSERT INTO borrower_conversation_messages(id,application_id,conversation_id,borrower_user_id,sequence,client_message_id,body,body_digest)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[messageId,this.access.applicationId,conversation.id,this.access.userId,sequence,input.clientMessageId,text,createHash('sha256').update(text).digest('hex')]);
      const row=(await db.query(`INSERT INTO borrower_conversation_answers(id,application_id,borrower_user_id,message_id,intent,context_revision,answer)
        VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[randomUUID(),this.access.applicationId,this.access.userId,messageId,input.intent,context.revision,answer])).rows[0];
      return {entry:project({...row,sequence},context.revision),replayed:false};
    });
  }
  async read(before?:string) {
    if(before!==undefined)parseMessagePage(new URLSearchParams({after:before}));
    return borrowerTransaction(this.database,this.access,async db=>{
      const rows=(await db.query(`SELECT a.*,m.sequence::text FROM borrower_conversation_answers a
        JOIN borrower_conversation_messages m ON m.id=a.message_id WHERE a.application_id=$1 AND a.borrower_user_id=$2
        AND ($3::bigint IS NULL OR m.sequence<$3::bigint) ORDER BY m.sequence DESC LIMIT 11`,[this.access.applicationId,this.access.userId,before??null])).rows as AnswerRow[];
      const context=await this.context(db);
      return {entries:rows.slice(0,10).map(row=>project(row,context.revision)),nextBefore:rows.length>10?rows[9].sequence:null,pollAfterMs:5000};
    });
  }
  async source(answerId:string,sourceId:string) {
    if(!/^[a-zA-Z0-9-]{1,80}$/.test(answerId)||!/^s[1-9][0-9]{0,7}$/.test(sourceId))throw new UploadError('Invalid source reference.');
    return borrowerTransaction(this.database,this.access,async db=>{
      const row=(await db.query(`SELECT * FROM borrower_conversation_answers WHERE id=$1 AND application_id=$2 AND borrower_user_id=$3`,[answerId,this.access.applicationId,this.access.userId])).rows[0] as AnswerRow|undefined;
      if(!row)throw new UploadError('Answer not found.',404);
      const context=await this.context(db);
      if(context.revision!==row.context_revision)throw new UploadError('This answer is out of date. Ask again for current sources.',409);
      const source=row.answer.sources.find(s=>s.id===sourceId);
      if(!source)throw new UploadError('Source not found.',404);
      let documentUrl:string|undefined;
      if(source.reference.kind==='document') {
        const ref=source.reference;
        if(!context.documents.some(d=>d.id===ref.documentVersionId&&d.sha256===ref.sha256))throw new UploadError('Source is no longer available.',404);
        documentUrl=`/api/documents/${encodeURIComponent(ref.documentVersionId)}?applicationId=${encodeURIComponent(this.access.applicationId)}`;
      }
      return {source,documentUrl};
    });
  }
}
export type AnswerHistory = Awaited<ReturnType<ConversationAnswers['read']>>;
export type ResolvedAnswerSource = Awaited<ReturnType<ConversationAnswers['source']>>;
