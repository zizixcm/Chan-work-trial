import type {Access} from '../authorization';
import {BorrowerAgentService,type BorrowerPlanner} from './borrower-service';
import type {PreparationWorker} from '../preparation/worker';
import {digest} from '../preparation-pilot/contracts';
import {processorMode} from '../preparation/ownership';

/** One scoped tick. GET never invokes this. Repeated ticks recover queued work;
 * main-agent events and processing observations are durable across process restarts. */
export async function runBorrowerAgentsTick(access:Access,main:BorrowerAgentService,planner:BorrowerPlanner,investigator:PreparationWorker){
 // Retire obsolete work before it can repeatedly block the queue. No provider
 // call is needed to compare the immutable run envelope with current inventory.
 const retireObsolete=()=>main.preparation.transaction(access,async db=>{
  const inventory=await main.preparation.inventory(db,access.applicationId),mode=await processorMode(db,access.applicationId);
  const preference=(await db.query('SELECT enabled,epoch::text FROM user_ai_preferences WHERE user_id=$1',[access.userId])).rows[0];
  const rows=(await db.query("SELECT * FROM preparation_runs WHERE application_id=$1 AND user_id=$2 AND state IN ('queued','running','waiting_input') FOR UPDATE",[access.applicationId,access.userId])).rows;
  for(const run of rows){
   const grant=run.request.authority.policyRevision;
   const revoked=grant.startsWith('automatic:')&&(!preference?.enabled||grant!==`automatic:${mode.epoch}:${preference.epoch}`);
   if(mode.mode==='adaptive'&&String(run.execution_epoch)===mode.epoch&&!revoked&&digest({inventory,actor:access.userId,epoch:mode.epoch,grant})===run.request.snapshot.inputFingerprint)continue;
   const revision=(await db.query("UPDATE preparation_runs SET state='superseded',token=NULL,lease_until=NULL,revision=revision+1 WHERE id=$1 RETURNING revision::text",[run.id])).rows[0].revision;
   await main.preparation.appendEvent(db,access,{schemaVersion:'processing-event.v1',type:'run.superseded',runId:run.id,runRevision:revision,artifactId:run.request.origin.artifactId,state:'superseded',inputFingerprint:run.request.snapshot.inputFingerprint,data:{successorRunId:null,reasonCode:revoked?'automatic_grant_revoked':'dependencies_changed'}});
  }
 });
 await retireObsolete();
 await main.enqueueEvents(access);
 const conversation=await main.runOne(access,planner);
 const next=await main.preparation.transaction(access,async db=>(await db.query(`SELECT id FROM preparation_runs WHERE application_id=$1 AND user_id=$2 AND (state='queued' OR (state='running' AND lease_until<=now())) ORDER BY created_at LIMIT 1`,[access.applicationId,access.userId])).rows[0]);
 if(next)try{await investigator.run(access,next.id);}catch(error){
  if(!(error instanceof Error)||!['Evidence changed','Execution superseded','Automatic grant revoked'].includes(error.message))throw error;
  await retireObsolete();
 }
 await main.enqueueEvents(access);
 return {conversation,investigationId:next?.id??null};
}
