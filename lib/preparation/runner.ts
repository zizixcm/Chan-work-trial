import { randomUUID } from 'node:crypto';
import { PreparationService,type PreparationAccess } from './service';
import { PreparationWorker } from './worker';
import { processorMode } from './ownership';
export interface PreparationRunnerHooks {dispatchPendingChatDelegations:()=>Promise<unknown>}
/** One bounded runner tick; called by an explicitly started isolated worker, never GET.
 * The chat hook repairs intent→admission→receipt binding across process crashes. */
export async function runPreparationTick(service:PreparationService,worker:PreparationWorker,hooks:PreparationRunnerHooks){
 await hooks.dispatchPendingChatDelegations();
 const obligations=(await service.database.query("SELECT id,application_id,user_id FROM preparation_upload_obligations WHERE state='pending' ORDER BY id LIMIT 20")).rows;
 for(const pending of obligations){
  const access:PreparationAccess={applicationId:pending.application_id,userId:pending.user_id};
  try{
   const intent=await service.transaction(access,async db=>{
    const row=(await db.query('SELECT * FROM preparation_upload_obligations WHERE id=$1 FOR UPDATE',[pending.id])).rows[0];if(row.state!=='pending')return null;
    if(row.intent)return row.intent;
    const mode=await processorMode(db,access.applicationId),pref=(await db.query('SELECT enabled FROM user_ai_preferences WHERE user_id=$1',[access.userId])).rows[0];
    if(mode.mode!=='adaptive'||mode.epoch!==String(row.execution_epoch)||!pref?.enabled){await db.query("UPDATE preparation_upload_obligations SET state='superseded' WHERE id=$1",[row.id]);return null;}
    const inventory=await service.inventory(db,access.applicationId),parts=row.source_key.split(':'),task=parts.shift();parts.pop();const target=parts.join(':');
    const anchor=task==='match_document.v1'?(await db.query(`SELECT u.id::text,u.conversation_id,u.batch_id FROM upload_batch_members m JOIN upload_batches b ON b.id=m.batch_id AND b.application_id=m.application_id JOIN borrower_conversation_uploads u ON u.batch_id=b.id AND u.application_id=b.application_id AND u.borrower_user_id=b.user_id WHERE m.application_id=$1 AND m.document_id=$2 AND m.state='saved' AND b.user_id=$3 ORDER BY b.created_at DESC LIMIT 1`,[access.applicationId,target,access.userId])).rows[0]:null;
    const input={commandId:row.id,idempotencyKey:row.id,objective:'understand_and_assess',assessmentScope:'affected_requirements',documentIds:task==='match_document.v1'?[target]:[],requirementIds:task==='verify_requirement.v1'?[target]:[],origin:{kind:anchor?'chat_upload':'portal_upload',conversationId:anchor?.conversation_id??null,artifactId:anchor?`upload:${anchor.id}`:null,domainEventId:row.id},uploadBatchId:anchor?.batch_id??null,expectedContentRevision:inventory.contentRevision,retryOf:null};
    await db.query('UPDATE preparation_upload_obligations SET intent=$2 WHERE id=$1',[row.id,input]);return input;
   });
   if(!intent)continue;
   const receipt=await service.accept(access,intent);
   await service.transaction(access,async db=>{await db.query("UPDATE preparation_upload_obligations SET state='admitted',run_id=$2 WHERE id=$1",[pending.id,receipt.runId]);});
  }catch(error){
   await service.transaction(access,async db=>{
    const row=(await db.query('SELECT * FROM preparation_upload_obligations WHERE id=$1 FOR UPDATE',[pending.id])).rows[0];
    if(error instanceof Error&&error.message==='Evidence changed; refresh before retry'){
     const inventory=await service.inventory(db,access.applicationId),mode=await processorMode(db,access.applicationId);
     await db.query("UPDATE preparation_upload_obligations SET state='superseded',reason_code='evidence_changed' WHERE id=$1",[row.id]);
     const prefix=row.source_key.slice(0,row.source_key.lastIndexOf(':'));
     await db.query('INSERT INTO preparation_upload_obligations(id,application_id,user_id,source_key,execution_epoch) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[randomUUID(),access.applicationId,access.userId,`${prefix}:${inventory.contentRevision}`,mode.epoch]);
    }else await db.query("UPDATE preparation_upload_obligations SET attempts=attempts+1,state=CASE WHEN attempts>=2 THEN 'blocked' ELSE 'pending' END,reason_code='admission_failed' WHERE id=$1",[row.id]);
   }).catch(()=>{});
  }
 }
 const next=(await service.database.query("SELECT r.id,r.application_id,r.user_id FROM preparation_runs r JOIN preparation_processor_modes m ON m.application_id=r.application_id AND m.mode='adaptive' AND m.execution_epoch=r.execution_epoch JOIN application_memberships a ON a.application_id=r.application_id AND a.user_id=r.user_id AND a.active AND a.role='borrower' WHERE r.state='queued' OR (r.state='running' AND r.lease_until<=now()) ORDER BY r.created_at LIMIT 1")).rows[0];
 if(!next)return {ran:false};
 await worker.run({applicationId:next.application_id,userId:next.user_id},next.id);return {ran:true,runId:next.id};
}
