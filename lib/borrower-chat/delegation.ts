import {createHash,randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import type {Access} from '../authorization';
import {pool} from '../db';
import {UploadError} from '../validation';
import {borrowerTransaction} from './transaction';
import {parseCompletenessRequest,processingEventSchema} from '../preparation/protocol';
import {BorrowerContextService} from './context';

/** Browser intent, NOT a processing-request.v1 envelope. Trusted processing
 * admission owns inventory, authority/epoch, policy and dependency fingerprint. */
export type DelegationInput={clientMessageId:string;intent:'investigate_gap'|'review_documents';requirementId?:string;text?:string;expectedContextRevision:string};
export function parseDelegationInput(value:unknown):DelegationInput {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new UploadError('Invalid preparation request.');
  const v=value as Record<string,unknown>;
  if(Object.keys(v).some(k=>!['clientMessageId','intent','requirementId','text','expectedContextRevision'].includes(k))||
    typeof v.clientMessageId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(v.clientMessageId)||
    !['investigate_gap','review_documents'].includes(String(v.intent))||
    typeof v.expectedContextRevision!=='string'||!/^[a-f0-9]{64}$/.test(v.expectedContextRevision)||
    (v.intent==='investigate_gap'&&(typeof v.requirementId!=='string'||!v.requirementId.trim()||v.requirementId.length>200))||
    (v.intent==='review_documents'&&v.requirementId!==undefined)||
    (v.text!==undefined&&(typeof v.text!=='string'||!v.text.trim()||v.text.includes('\0')||Buffer.byteLength(v.text,'utf8')>16000)))throw new UploadError('Choose a document completeness review or a specific request to investigate.');
  return v as DelegationInput;
}
function canonicalDigest(value:unknown):string {
  const ordered=(v:unknown):unknown=>Array.isArray(v)?v.map(ordered):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,ordered(x)])):v;
  return createHash('sha256').update(JSON.stringify(ordered(value))).digest('hex');
}
export type DelegationCard={contentRevision:string;text:string;id:string;messageId:string;conversationId:string;sequence:string;
  intent:DelegationInput['intent'];requirementId:string|null;createdAt:string;
  state:'pending_admission'|'admitted';processingRunId:string|null;executionMode:'not_dispatched'|'processor_owned';};
function card(row:Record<string,any>):DelegationCard {
  return {contentRevision:row.content_revision,text:row.request_text,id:row.id,messageId:row.message_id,conversationId:row.conversation_id,sequence:String(row.sequence),
    intent:row.intent,requirementId:row.requirement_id,createdAt:new Date(row.created_at).toISOString(),
    state:row.accepted_event?'admitted':'pending_admission',processingRunId:row.accepted_event?.runId??null,executionMode:row.accepted_event?'processor_owned':'not_dispatched'};
}
/** Durable intent outbox, deliberately unexposed until processing admission is
 * connected. Reads and replay never call a processor. No fake run/preparation ID. */
export class ChatDelegationRepository {
  constructor(private readonly access:Access,private readonly database:Pool=pool()){}
  async request(value:unknown) {
    const input=parseDelegationInput(value);
    const bodyDigest=createHash('sha256').update(JSON.stringify({intent:input.intent,requirementId:input.requirementId??null,expectedContextRevision:input.expectedContextRevision,text:input.text??null})).digest('hex');
    return borrowerTransaction(this.database,this.access,async db=>{
      const prior=(await db.query(`SELECT d.*,m.conversation_id,m.sequence::text,m.body AS request_text FROM borrower_chat_delegations d
        JOIN borrower_conversation_messages m ON m.id=d.message_id
        WHERE d.application_id=$1 AND d.borrower_user_id=$2 AND m.client_message_id=$3`,[this.access.applicationId,this.access.userId,input.clientMessageId])).rows[0];
      if(prior) {
        if(prior.body_digest!==bodyDigest)throw new UploadError('This request key was used for different input.',409);
        return {card:card(prior),replayed:true};
      }
      const context=await new BorrowerContextService(this.access,this.database).readInTransaction(db);
      if(context.revision!==input.expectedContextRevision)throw new UploadError('The application changed. Refresh before requesting an investigation.',409);
      const requirement=input.requirementId?context.requirements.find(r=>r.id===input.requirementId&&r.collection==='borrower'):null;
      if(input.requirementId&&!requirement)throw new UploadError('Request not found.',404);
      await db.query(`INSERT INTO borrower_conversations(id,application_id,borrower_user_id) VALUES($1,$2,$3)
        ON CONFLICT(application_id,borrower_user_id) DO NOTHING`,[randomUUID(),this.access.applicationId,this.access.userId]);
      const conversation=(await db.query('SELECT id FROM borrower_conversations WHERE application_id=$1 AND borrower_user_id=$2',[this.access.applicationId,this.access.userId])).rows[0];
      if((await db.query('SELECT 1 FROM borrower_conversation_messages WHERE conversation_id=$1 AND client_message_id=$2',[conversation.id,input.clientMessageId])).rowCount)throw new UploadError('This message key already belongs to another action.',409);
      const sequence=(await db.query('UPDATE borrower_conversations SET last_sequence=last_sequence+1,updated_at=clock_timestamp() WHERE id=$1 RETURNING last_sequence::text',[conversation.id])).rows[0].last_sequence;
      const text=input.text??(requirement?`Investigate the evidence gap for ${requirement.title}.`:'Review document and requirement completeness.');
      const messageId=randomUUID();
      await db.query(`INSERT INTO borrower_conversation_messages(id,application_id,conversation_id,borrower_user_id,sequence,client_message_id,body,body_digest)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[messageId,this.access.applicationId,conversation.id,this.access.userId,sequence,input.clientMessageId,text,createHash('sha256').update(text).digest('hex')]);
      const row=(await db.query(`INSERT INTO borrower_chat_delegations(id,application_id,borrower_user_id,message_id,intent,requirement_id,expected_context_revision,body_digest,content_revision)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[randomUUID(),this.access.applicationId,this.access.userId,messageId,input.intent,input.requirementId??null,input.expectedContextRevision,bodyDigest,context.application.contentRevision])).rows[0];
      return {card:card({...row,conversation_id:conversation.id,sequence,request_text:text}),replayed:false};
    });
  }
  /** Bind an already admitted trusted processor command. A lost acknowledgment
   * retries admission with the same card/command key, then binds the same receipt.
   * This method never constructs authority or calls either scheduler. */
  async bindAdmission(cardId:string,requestValue:unknown,eventValue:unknown) {
    const request=parseCompletenessRequest(requestValue),event=processingEventSchema.parse(eventValue);
    if(event.type!=='run.accepted'||request.applicationId!==this.access.applicationId||event.applicationId!==this.access.applicationId||
      request.authority.actorUserId!==this.access.userId||request.origin.artifactId!==cardId||event.artifactId!==cardId||
      request.preparationId!==event.data.preparationId||request.snapshot.preparationRevision!==event.data.preparationRevision||
      request.snapshot.inputFingerprint!==event.inputFingerprint)throw new UploadError('Processing receipt does not match the conversation request.',409);
    return borrowerTransaction(this.database,this.access,async db=>{
      const row=(await db.query(`SELECT d.*,m.conversation_id FROM borrower_chat_delegations d
        JOIN borrower_conversation_messages m ON m.id=d.message_id WHERE d.id=$1 AND d.application_id=$2 AND d.borrower_user_id=$3`,
        [cardId,this.access.applicationId,this.access.userId])).rows[0];
      if(!row)throw new UploadError('Conversation request not found.',404);
      if(request.origin.conversationId!==row.conversation_id||request.idempotencyKey!==cardId||request.origin.kind!=='borrower_request'||
        request.uploadBatchId!==null||request.commandId!==cardId||request.origin.domainEventId!==row.message_id||
        request.objective!==(row.intent==='investigate_gap'?'resolve_gap':'understand_and_assess')||
        (row.requirement_id&&!request.requirements.some(r=>r.requirementId===row.requirement_id)))throw new UploadError('Processing command does not match saved intent.',409);
      if(row.accepted_event) {
        if(row.accepted_event.runId!==event.runId||canonicalDigest(row.processing_request)!==canonicalDigest(request))
          throw new UploadError('Conversation request already has a different processing receipt.',409);
        return {runId:event.runId,replayed:true};
      }
      await db.query('UPDATE borrower_chat_delegations SET processing_request=$2,accepted_event=$3 WHERE id=$1',[cardId,request,event]);
      return {runId:event.runId,replayed:false};
    });
  }
  async read() {
    return borrowerTransaction(this.database,this.access,async db=>{
      const rows=(await db.query(`SELECT d.*,m.conversation_id,m.sequence::text,m.body AS request_text FROM borrower_chat_delegations d
        JOIN borrower_conversation_messages m ON m.id=d.message_id
        WHERE d.application_id=$1 AND d.borrower_user_id=$2 ORDER BY m.sequence`,[this.access.applicationId,this.access.userId])).rows;
      return rows.map(card);
    });
  }
}
