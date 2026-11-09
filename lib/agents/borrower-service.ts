import {admitInventoryEvents} from './upload-admission';
import type {ConversationStreamState} from '../borrower-chat/conversation-ui';
import {withToolActivity,readAgentActivity} from './activity';
import {AgentExecutionError} from './execution-error';
import type {AgentExecutionContext} from './execution';
import {parseMessageInput} from '../borrower-chat/contracts';
import {randomUUID,createHash} from 'node:crypto';
import type {Pool} from 'pg';
import type {Access} from '../authorization';
import {UploadError} from '../validation';
import {PreparationService} from '../preparation/service';
import {processorMode} from '../preparation/ownership';
import {digest} from '../preparation-pilot/contracts';
import {packageCompleteness} from '../preparation/completeness';
import {borrowerActionSchema,AGENT_CONFIGURATION_DIGEST,type BorrowerAction} from './definitions';

export interface BorrowerPlanner {maximumCallMicros:number;decide(input:unknown,signal:AbortSignal,execute:(action:BorrowerAction)=>Promise<unknown>,execution?:AgentExecutionContext):Promise<{action:BorrowerAction;actualMicros:number|null;executed?:boolean}>}
/** Application-owned durability; models cannot choose actors, grants or revisions. */
export class BorrowerAgentService {
 readonly preparation:PreparationService;
 constructor(readonly database:Pool){this.preparation=new PreparationService(database);}
 async enqueueMessage(access:Access,value:unknown){
  if(access.role!=='borrower')throw new UploadError('Borrower access required.',403);
  const input=parseMessageInput(value);
  return this.preparation.transaction(access,async db=>{
   await db.query('INSERT INTO borrower_conversations(id,application_id,borrower_user_id) VALUES($1,$2,$3) ON CONFLICT(application_id,borrower_user_id) DO NOTHING',[randomUUID(),access.applicationId,access.userId]);
   const conversation=(await db.query('SELECT id FROM borrower_conversations WHERE application_id=$1 AND borrower_user_id=$2',[access.applicationId,access.userId])).rows[0];
   let message=(await db.query('SELECT id,body FROM borrower_conversation_messages WHERE conversation_id=$1 AND client_message_id=$2',[conversation.id,input.clientMessageId])).rows[0];
   const replayed=!!message;
   if(message&&message.body!==input.text)throw new UploadError('This message ID already belongs to different text.',409);
   if(!message){
    const sequence=(await db.query('UPDATE borrower_conversations SET last_sequence=last_sequence+1,updated_at=now() WHERE id=$1 RETURNING last_sequence',[conversation.id])).rows[0].last_sequence;
    message=(await db.query('INSERT INTO borrower_conversation_messages(id,application_id,conversation_id,borrower_user_id,sequence,client_message_id,body,body_digest) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,body',[randomUUID(),access.applicationId,conversation.id,access.userId,sequence,input.clientMessageId,input.text,createHash('sha256').update(input.text).digest('hex')])).rows[0];
   }
   const turn=(await db.query(`INSERT INTO borrower_agent_turns(id,application_id,user_id,conversation_id,source_key,source_message_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(application_id,user_id,source_key) DO UPDATE SET source_key=EXCLUDED.source_key RETURNING id,state`,[randomUUID(),access.applicationId,access.userId,conversation.id,`message:${message.id}`,message.id])).rows[0];
   return {...turn,message,replayed};
  });
 }
 /** Event admission is worker-only, never a side effect of polling. Coalesce progress
  * by run/revision; terminal results/questions always have their own durable key. */
 async enqueueEvents(access:Access){return this.preparation.transaction(access,async db=>{
  const conversation=(await db.query('SELECT id FROM borrower_conversations WHERE application_id=$1 AND borrower_user_id=$2',[access.applicationId,access.userId])).rows[0];
  if(!conversation)return;
  const mode=await processorMode(db,access.applicationId);if(mode.mode!=='adaptive')return;
  const inventory=await this.preparation.inventory(db,access.applicationId);
  const preference=(await db.query('SELECT enabled,epoch::text FROM user_ai_preferences WHERE user_id=$1',[access.userId])).rows[0];
  await admitInventoryEvents(db,access,conversation.id,inventory,{modeEpoch:String(mode.epoch),preferenceEpoch:preference?.epoch??'0',automaticEnabled:!!preference?.enabled});
  await db.query(`INSERT INTO borrower_agent_turns(id,application_id,user_id,conversation_id,source_key)
   SELECT 'event:'||s.id,s.application_id,s.user_id,$3,'event:'||s.id FROM preparation_stream s
   WHERE s.application_id=$1 AND s.user_id=$2 AND s.payload->>'type' IN ('run.needs_input','run.result_committed','run.failed')
   ON CONFLICT(application_id,user_id,source_key) DO NOTHING`,[access.applicationId,access.userId,conversation.id]);
 });}
 private async context(access:Access){
  const base=await this.preparation.transaction(access,async db=>{
   const inventory=await this.preparation.inventory(db,access.applicationId),mode=await processorMode(db,access.applicationId);
   const conversation=(await db.query('SELECT id,last_sequence::text,agent_trace_ref FROM borrower_conversations WHERE application_id=$1 AND borrower_user_id=$2',[access.applicationId,access.userId])).rows[0];
   if(!conversation||mode.mode!=='adaptive')throw Error('Agent unavailable');
   const messages=(await db.query('SELECT id,body AS text,sequence::text FROM borrower_conversation_messages WHERE conversation_id=$1 ORDER BY sequence DESC LIMIT 40',[conversation.id])).rows.reverse();
   const replies=(await db.query("SELECT id,response_text AS text,completed_at,context_fingerprint,result_cursor FROM borrower_agent_turns WHERE application_id=$1 AND user_id=$2 AND state='completed' ORDER BY completed_at DESC LIMIT 20",[access.applicationId,access.userId])).rows.reverse();
   return {inventory,conversation,messages,replies,epoch:mode.epoch};
  });
  const processing=await this.preparation.snapshot(access);
  return {...base,replies:base.replies.map(r=>({...r,freshness:r.context_fingerprint===digest({inventory:base.inventory,sequence:base.conversation.last_sequence,epoch:base.epoch})&&r.result_cursor===processing.cursor?'current':'historical'})),processing,completeness:packageCompleteness(base.inventory,processing.currentResult),fingerprint:digest({inventory:base.inventory,sequence:base.conversation.last_sequence,epoch:base.epoch}),resultCursor:processing.cursor};
 }
 async read(access:Access){const context=await this.context(access);return this.preparation.transaction(access,async db=>{
  const rows=(await db.query('SELECT id,source_message_id,state,response_text,reason_code,created_at,completed_at,context_fingerprint,result_cursor FROM borrower_agent_turns WHERE application_id=$1 AND user_id=$2 ORDER BY created_at,id',[access.applicationId,access.userId])).rows;
  return rows.map(r=>({id:r.id,sourceMessageId:r.source_message_id,state:r.state,text:r.response_text,reasonCode:r.reason_code,createdAt:new Date(r.completed_at??r.created_at).toISOString(),freshness:r.context_fingerprint===context.fingerprint&&r.result_cursor===context.resultCursor?'current' as const:'outdated' as const}));
 });}
 /** Read-only stream projection: drafts never become evidence or committed replies. */
 async streamState(access:Access):Promise<ConversationStreamState>{
  const state=await this.preparation.transaction(access,async db=>{
   const mode=await processorMode(db,access.applicationId);
   if(mode.mode!=='adaptive')throw new UploadError('Agent streaming unavailable.',404);
   const inventory=await this.preparation.inventory(db,access.applicationId);
   const conversation=(await db.query('SELECT last_sequence::text FROM borrower_conversations WHERE application_id=$1 AND borrower_user_id=$2',[access.applicationId,access.userId])).rows[0];
   const fingerprint=conversation?digest({inventory,sequence:conversation.last_sequence,epoch:mode.epoch}):'';
   const cursor=(await db.query('SELECT payload FROM preparation_stream WHERE application_id=$1 AND user_id=$2 ORDER BY sequence DESC LIMIT 1',[access.applicationId,access.userId])).rows[0]?.payload.cursor??'start';
   const rows=(await db.query(`SELECT t.*,m.client_message_id, t.lease_until>now() AS live FROM borrower_agent_turns t
    LEFT JOIN borrower_conversation_messages m ON m.id=t.source_message_id AND m.application_id=t.application_id AND m.borrower_user_id=t.user_id
    WHERE t.application_id=$1 AND t.user_id=$2 ORDER BY t.created_at DESC,t.id DESC LIMIT 20`,[access.applicationId,access.userId])).rows;
   const work=(await db.query("SELECT 1 FROM preparation_runs WHERE application_id=$1 AND user_id=$2 AND (state='queued' OR (state='running' AND lease_until>now())) LIMIT 1",[access.applicationId,access.userId])).rowCount;
   const pref=(await db.query('SELECT enabled,epoch::text FROM user_ai_preferences WHERE user_id=$1',[access.userId])).rows[0];
   const authorizedDraft=(row:any)=>!row.trigger_context?.grant||(String(mode.epoch)===row.trigger_context.grant.modeEpoch&&(row.trigger_context.grant.kind==='explicit_upload'||(pref?.enabled&&pref.epoch===row.trigger_context.grant.preferenceEpoch)));
   const pending=!!work||rows.some(r=>r.state==='queued'||(r.state==='running'&&r.live));
   const drafts=rows.reverse().filter(r=>r.draft_text!==null||r.response_text!==null||['running','queued'].includes(r.state)).map(r=>{
    const completed=r.state==='completed'&&!!r.response_text;
    const valid=authorizedDraft(r)&&r.state==='running'&&r.live&&r.draft_context_fingerprint===fingerprint&&r.draft_result_cursor===cursor;
    return {turnId:r.id,sourceMessageId:r.source_message_id??null,clientMessageId:r.client_message_id??null,
     text:completed?r.response_text:valid?r.draft_text??'':'',status:completed?'completed' as const:r.state==='queued'||(r.state==='running'&&r.live)?'streaming' as const:'interrupted' as const,
     createdAt:new Date(r.created_at).toISOString()};
   });
   const uploadWork=(await db.query("SELECT 1 FROM preparation_runs WHERE application_id=$1 AND user_id=$2 AND request->>'uploadBatchId' IS NOT NULL AND (state='queued' OR (state='running' AND lease_until>now())) LIMIT 1",[access.applicationId,access.userId])).rowCount;
   const uploadPending=!!uploadWork||rows.some(r=>r.trigger_context?.kind==='files_uploaded'&&(r.state==='queued'||(r.state==='running'&&r.live)));
   return {drafts,pending,uploadPending};
  });
  return {...state,activity:await readAgentActivity(this.preparation,access)};
 }
 private async reserve(access:Access,id:string,amount:number){
  if(!Number.isSafeInteger(amount)||amount<1)throw Error('Invalid reservation');
  return this.preparation.transaction(access,async db=>{
   const prep=(await db.query('SELECT id,state FROM borrower_preparations WHERE application_id=$1 AND user_id=$2 FOR UPDATE',[access.applicationId,access.userId])).rows[0];
   if(!prep)throw Error('Budget not configured');
   const budget=prep.state.budget;
   if(budget.knownMicros+budget.reservedMicros+amount>budget.limitMicros)throw Error('Budget exhausted');
   budget.reservedMicros+=amount;
   await db.query('UPDATE borrower_preparations SET state=$2 WHERE id=$1',[prep.id,prep.state]);
   await db.query('UPDATE borrower_agent_turns SET reserved_micros=$2 WHERE id=$1',[id,amount]);
  });
 }
 private async settle(access:Access,id:string,actual:number|null){return this.preparation.transaction(access,async db=>{
  const turn=(await db.query('SELECT reserved_micros,cost_settled FROM borrower_agent_turns WHERE id=$1 FOR UPDATE',[id])).rows[0];if(turn.cost_settled)return;
  const prep=(await db.query('SELECT id,state FROM borrower_preparations WHERE application_id=$1 AND user_id=$2 FOR UPDATE',[access.applicationId,access.userId])).rows[0];
  const b=prep.state.budget;
  if(actual===null)b.unknownCost=true;
  else{if(!Number.isSafeInteger(actual)||actual<0||actual>Number(turn.reserved_micros))throw Error('Cost exceeds reservation');b.reservedMicros-=Number(turn.reserved_micros);b.knownMicros+=actual;}
  await db.query('UPDATE borrower_preparations SET state=$2 WHERE id=$1',[prep.id,prep.state]);
  await db.query('UPDATE borrower_agent_turns SET cost_settled=true,actual_micros=$2 WHERE id=$1',[id,actual]);
 });}
 async runOne(access:Access,planner:BorrowerPlanner){
  const token=randomUUID();
  const turn=await this.preparation.transaction(access,async db=>{
   if((await db.query("SELECT 1 FROM borrower_agent_turns WHERE application_id=$1 AND user_id=$2 AND state='running' AND lease_until>now()",[access.applicationId,access.userId])).rowCount)return null;
   const row=(await db.query("SELECT * FROM borrower_agent_turns WHERE application_id=$1 AND user_id=$2 AND attempts<3 AND (state='queued' OR (state='running' AND lease_until<=now())) ORDER BY created_at,id LIMIT 1 FOR UPDATE",[access.applicationId,access.userId])).rows[0];if(!row)return null;
   await db.query("UPDATE borrower_agent_turns SET state='running',token=$2,lease_until=now()+interval '120 seconds',attempts=attempts+1,draft_text=NULL,draft_context_fingerprint=NULL,draft_result_cursor=NULL WHERE id=$1",[row.id,token]);return row;
  });
  if(!turn)return {ran:false};
  try{
   const context=await this.context(access);
   const sourceEvent=turn.source_key.startsWith('event:')?await this.preparation.transaction(access,async db=>(await db.query('SELECT payload FROM preparation_stream WHERE id=$1 AND application_id=$2 AND user_id=$3',[turn.source_key.slice(6),access.applicationId,access.userId])).rows[0]?.payload):null;
   const checkAutomatic=async()=>{
    if(turn.source_message_id||(!turn.source_key.includes('inventory:')&&turn.trigger_context?.kind!=='files_uploaded'))return;
    if(turn.trigger_context?.grant?.kind==='explicit_upload'){if(String(context.epoch)!==turn.trigger_context.grant.modeEpoch)throw Error('Explicit upload processing revoked');return;}
    const pref=await this.preparation.transaction(access,async db=>(await db.query('SELECT enabled,epoch::text FROM user_ai_preferences WHERE user_id=$1',[access.userId])).rows[0]);
    if(!pref?.enabled||(turn.trigger_context?.grant&&(pref.epoch!==turn.trigger_context.grant.preferenceEpoch||String(context.epoch)!==turn.trigger_context.grant.modeEpoch)))throw Error('Automatic processing revoked');
   };
   await checkAutomatic();
   const uploadContext=turn.trigger_context??(sourceEvent?.runId?await this.preparation.transaction(access,async db=>(await db.query("SELECT t.trigger_context FROM preparation_runs r JOIN borrower_agent_turns t ON t.id=r.request->'origin'->>'artifactId' WHERE r.id=$1 AND r.application_id=$2 AND r.user_id=$3",[sourceEvent.runId,access.applicationId,access.userId])).rows[0]?.trigger_context):null);
   if(turn.reserved_micros>0&&!turn.decision)throw Error('Prior provider outcome unknown');
   if(turn.decision&&turn.reserved_micros>0&&!turn.cost_settled)await this.settle(access,turn.id,null);
   if(turn.context_fingerprint&&turn.context_fingerprint!==context.fingerprint)throw Error('Context changed');
   await this.preparation.transaction(access,db=>db.query('UPDATE borrower_agent_turns SET draft_context_fingerprint=$3,draft_result_cursor=$4 WHERE id=$1 AND token=$2',[turn.id,token,context.fingerprint,context.resultCursor]));
   let lastDraftAt=0,lastDraft='';
   const onReplyText=async(text:string)=>{
    if(text.length>6000)throw Error('Reply draft exceeds limit');
    await checkAutomatic();
    if(text===lastDraft||(text&&text.startsWith(lastDraft)&&Date.now()-lastDraftAt<50))return;
    const current=await this.context(access);
    if(current.fingerprint!==context.fingerprint||current.resultCursor!==context.resultCursor)throw Error('Context changed');
    await this.preparation.transaction(access,async db=>{
     const updated=await db.query("UPDATE borrower_agent_turns SET draft_text=$3 WHERE id=$1 AND token=$2 AND state='running' AND lease_until>now()",[turn.id,token,text]);
     if(!updated.rowCount)throw Error('Lease lost');
    });lastDraftAt=Date.now();lastDraft=text;
   };
   let outcome:unknown={kind:'reply'};
   const execute=async(value:BorrowerAction)=>withToolActivity(this.preparation,access,{actor:'borrower',runId:turn.id,token,kind:value.kind},async()=>{
    await checkAutomatic();
    const action=borrowerActionSchema.parse(value),current=await this.context(access);
    if(current.fingerprint!==context.fingerprint||current.resultCursor!==context.resultCursor)throw Error('Context changed');
    await this.preparation.transaction(access,async db=>{
     const updated=await db.query("UPDATE borrower_agent_turns SET decision=$3,context_fingerprint=$4 WHERE id=$1 AND token=$2 AND state='running' AND lease_until>now()",[turn.id,token,action,context.fingerprint]);if(!updated.rowCount)throw Error('Lease lost');
    });
    if(action.kind==='investigate'){
     outcome=await this.preparation.accept(access,{commandId:turn.id,idempotencyKey:turn.id,objective:'understand_and_assess',assessmentScope:action.requirementIds.length?'affected_requirements':'application',documentIds:action.documentIds,requirementIds:action.requirementIds,goal:action.goal,origin:{kind:turn.source_message_id||turn.trigger_context?.grant?.kind==='explicit_upload'?'borrower_request':'portal_upload',conversationId:context.conversation.id,artifactId:turn.id,domainEventId:turn.source_message_id??turn.id},uploadBatchId:turn.trigger_context?.uploadBatchId??null,expectedContentRevision:context.inventory.contentRevision,retryOf:null});
    await this.preparation.transaction(access,db=>db.query('UPDATE preparation_runs SET parent_trace_ref=(SELECT trace_ref FROM borrower_agent_turns WHERE id=$1) WHERE id=$2 AND application_id=$3 AND user_id=$4',[turn.id,(outcome as {runId:string}).runId,access.applicationId,access.userId]));
    }else if(action.kind==='answer_question'){
     const source=context.messages.find(m=>m.id===action.sourceMessageId);
     let question=context.processing.pendingQuestions.find(q=>q.questionId===action.questionId);
     if(!question&&turn.decision)question=await this.preparation.transaction(access,async db=>(await db.query('SELECT payload FROM preparation_questions WHERE id=$1 AND application_id=$2 AND user_id=$3 AND answer_key=$4',[action.questionId,access.applicationId,access.userId,turn.id])).rows[0]?.payload);
     if(!source||!question||action.sourceMessageId!==turn.source_message_id||action.answerText!==source.text)throw Error('Answer must preserve the current borrower message');
     outcome=await this.preparation.answer(access,{questionId:question.questionId,expectedQuestionRevision:question.questionRevision,idempotencyKey:turn.id,text:source.text});
    }
    await this.preparation.transaction(access,db=>db.query('UPDATE borrower_agent_turns SET outcome=$3 WHERE id=$1 AND token=$2',[turn.id,token,outcome]));
    return outcome;
   });
   let action:BorrowerAction;
   if(turn.decision){action=borrowerActionSchema.parse(turn.decision);if(turn.outcome)outcome=turn.outcome;else await execute(action);}
   else{
    await this.reserve(access,turn.id,planner.maximumCallMicros);
    let response:Awaited<ReturnType<BorrowerPlanner['decide']>>;
    try{response=await planner.decide({trigger:{sourceKey:turn.source_key,sourceMessageId:turn.source_message_id,event:sourceEvent,upload:uploadContext??null},...context,conversation:{id:context.conversation.id,lastSequence:context.conversation.last_sequence},inventory:{...context.inventory,documents:context.inventory.documents.map(({storageKey,...d})=>d)}},AbortSignal.timeout(60000),execute,{onReplyText,correlation:{applicationId:access.applicationId,userId:access.userId,borrowerTurnId:turn.id,...(uploadContext?.uploadBatchId?{uploadBatchId:uploadContext.uploadBatchId}:{}),configurationDigest:AGENT_CONFIGURATION_DIGEST,evidenceRevision:context.inventory.contentRevision},parent:context.conversation.agent_trace_ref??undefined,recordTrace:trace=>this.preparation.transaction(access,async db=>{await db.query('UPDATE borrower_agent_turns SET trace_ref=$3 WHERE id=$1 AND token=$2',[turn.id,token,trace]);await db.query('UPDATE borrower_conversations SET agent_trace_ref=COALESCE(agent_trace_ref,$2::jsonb) WHERE id=$1',[context.conversation.id,trace]);})});}
    catch(error){await this.settle(access,turn.id,error instanceof AgentExecutionError?error.actualMicros:null);throw error;}
    await this.settle(access,turn.id,response.actualMicros);action=borrowerActionSchema.parse(response.action);
    if(!response.executed)await execute(action);
   }
   const after=await this.context(access);
   if(after.fingerprint!==context.fingerprint||(action.kind==='reply'&&after.resultCursor!==context.resultCursor))throw Error('Context changed');
   await this.preparation.transaction(access,async db=>{
    const inventory=await this.preparation.inventory(db,access.applicationId),mode=await processorMode(db,access.applicationId);
    if(turn.trigger_context?.grant){
     const pref=(await db.query('SELECT enabled,epoch::text FROM user_ai_preferences WHERE user_id=$1',[access.userId])).rows[0];
     if(String(mode.epoch)!==turn.trigger_context.grant.modeEpoch||(turn.trigger_context.grant.kind!=='explicit_upload'&&(!pref?.enabled||pref.epoch!==turn.trigger_context.grant.preferenceEpoch)))throw Error('Upload processing revoked');
    }
    const seq=(await db.query('SELECT last_sequence::text FROM borrower_conversations WHERE id=$1',[context.conversation.id])).rows[0].last_sequence;
    if(digest({inventory,sequence:seq,epoch:mode.epoch})!==context.fingerprint)throw Error('Context changed');
    const changed=await db.query("UPDATE borrower_agent_turns SET state='completed',outcome=$3,response_text=$4,result_cursor=$5,completed_at=now(),token=NULL,lease_until=NULL WHERE id=$1 AND token=$2 AND state='running' AND lease_until>now()",[turn.id,token,outcome,action.message,after.resultCursor]);if(!changed.rowCount)throw Error('Lease lost');
   });
   return {ran:true,turnId:turn.id,action:action.kind};
  }catch(error){
   const changed=error instanceof Error&&error.message==='Context changed';
   await this.preparation.transaction(access,db=>db.query("UPDATE borrower_agent_turns SET state=$3,reason_code=$4,token=NULL,lease_until=NULL WHERE id=$1 AND token=$2",[turn.id,token,changed&&turn.attempts<2?'superseded':'blocked',changed?'context_changed':error instanceof AgentExecutionError?error.reasonCode:'agent_execution_failed']));
   if(changed&&turn.attempts<2)await this.preparation.transaction(access,async db=>{
    if(!turn.source_message_id&&turn.source_key.includes('inventory:')&&(await db.query("SELECT 1 FROM borrower_agent_turns WHERE application_id=$1 AND user_id=$2 AND trigger_context->>'kind'='files_uploaded' AND state IN ('queued','running') LIMIT 1",[access.applicationId,access.userId])).rowCount)return;
    return db.query(`INSERT INTO borrower_agent_turns(id,application_id,user_id,conversation_id,source_key,source_message_id,attempts,trigger_context) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,[randomUUID(),access.applicationId,access.userId,turn.conversation_id,`retry:${turn.source_message_id??turn.source_key}:${Date.now()}`,turn.source_message_id,turn.attempts+1,turn.trigger_context??null]);});
   return {ran:true,turnId:turn.id,blocked:true};
  }
 }
}
