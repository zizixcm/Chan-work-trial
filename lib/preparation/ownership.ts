import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { applicationEventSchema } from './protocol';
/** Safe before migration in older test/deployment schemas. Missing table means baseline. */
export async function processorMode(db:PoolClient,applicationId:string):Promise<{mode:'baseline'|'adaptive';epoch:string}> {
 if(!(await db.query("SELECT to_regclass('preparation_processor_modes') AS table_name")).rows[0].table_name)return {mode:'baseline',epoch:'0'};
 const row=(await db.query('SELECT mode,execution_epoch::text FROM preparation_processor_modes WHERE application_id=$1',[applicationId])).rows[0];
 return row?{mode:row.mode,epoch:row.execution_epoch}:{mode:'baseline',epoch:'0'};
}
/** Called inside an already authorized application-first transaction. Upload save remains atomic with this obligation. */
export async function routeAdaptiveObligation(db:PoolClient,applicationId:string,userId:string,sourceKey:string):Promise<boolean> {
 const mode=await processorMode(db,applicationId);if(mode.mode!=='adaptive')return false;
 const pref=(await db.query('SELECT enabled FROM user_ai_preferences WHERE user_id=$1',[userId])).rows[0];if(!pref?.enabled)return true;
 await db.query("INSERT INTO preparation_upload_obligations(id,application_id,user_id,source_key,execution_epoch) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",[randomUUID(),applicationId,userId,sourceKey,mode.epoch]);return true;
}
/** Operator-only configuration capability, deliberately no web route. Caller owns transaction/application lock. */
export async function transitionProcessorMode(db:PoolClient,applicationId:string,mode:'baseline'|'adaptive') {
 await db.query('SELECT id FROM applications WHERE id=$1 FOR UPDATE',[applicationId]);
 const current=await processorMode(db,applicationId);if(current.mode===mode)return current;
 const changed=(await db.query('INSERT INTO preparation_processor_modes(application_id,mode) VALUES($1,$2) ON CONFLICT(application_id) DO UPDATE SET mode=excluded.mode,execution_epoch=preparation_processor_modes.execution_epoch+1 RETURNING execution_epoch::text',[applicationId,mode])).rows[0];
 // Fence all outstanding workers before the new scheduler may own this application.
 const baseline=(await db.query("UPDATE analysis_jobs SET state='stale',token=token+1,lease_expires_at=NULL,slot=NULL,revision=revision+1 WHERE application_id=$1 AND consent_scope='borrower' AND state IN ('queued','running','retry_wait','blocked') RETURNING id,token",[applicationId])).rows;
 for(const row of baseline)await db.query("INSERT INTO analysis_events(application_id,job_id,event,token) VALUES($1,$2,'stale',$3)",[applicationId,row.id,row.token]);
 const adaptive=(await db.query("UPDATE preparation_runs SET state='superseded',token=NULL,lease_until=NULL,revision=revision+1 WHERE application_id=$1 AND state IN ('queued','running','waiting_input') RETURNING *",[applicationId])).rows;
 for(const row of adaptive){
  const eventId=randomUUID();const payload=applicationEventSchema.parse({schemaVersion:'processing-event.v1',type:'run.superseded',eventId,applicationId,cursor:randomUUID(),occurredAt:new Date().toISOString(),runId:row.id,runRevision:String(row.revision),artifactId:row.request.origin.artifactId,state:'superseded',inputFingerprint:row.request.snapshot.inputFingerprint,data:{successorRunId:null,reasonCode:'processor_mode_changed'}});
  await db.query('INSERT INTO preparation_stream(id,application_id,user_id,payload) VALUES($1,$2,$3,$4)',[eventId,applicationId,row.user_id,payload]);
 }
 const preparations=(await db.query('SELECT * FROM borrower_preparations WHERE application_id=$1 FOR UPDATE',[applicationId])).rows;
 for(const prep of preparations){
  const eventId=randomUUID(),revision=String(BigInt(prep.revision)+1n);
  const payload=applicationEventSchema.parse({schemaVersion:'preparation-invalidation.v1',type:'application.preparation_invalidated',eventId,applicationId,cursor:randomUUID(),occurredAt:new Date().toISOString(),preparationId:prep.id,preparationRevision:revision,affectedResultRefs:prep.state.currentResultRef?[prep.state.currentResultRef]:[],affectedRequirementIds:[],reasonCode:'processor_mode_changed'});
  await db.query("UPDATE borrower_preparations SET revision=$2,fingerprint='',state=jsonb_set(state,'{currentResultRef}','null') WHERE id=$1",[prep.id,revision]);
  await db.query('INSERT INTO preparation_stream(id,application_id,user_id,payload) VALUES($1,$2,$3,$4)',[eventId,applicationId,prep.user_id,payload]);
 }
 return {mode,epoch:changed.execution_epoch as string};
}
