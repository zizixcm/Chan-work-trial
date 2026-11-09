/** Retire two redundant stalled investigations in favor of their validated current successor.
 * This does not mark failed work successful or change evidence/accounting. Dry-run by default.
 */
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {Pool} from 'pg';
import {RECOVERY} from './recover-stalled-investigations';
import {PreparationService} from '../lib/preparation/service';
import {processorMode} from '../lib/preparation/ownership';
import {digest} from '../lib/preparation-pilot/contracts';
const reason='pilot-duplicate-retirement-20261108-v3';
const successorId=RECOVERY.steps[2].runId;
const reviewedGoals:Record<string,string>={
 [RECOVERY.steps[0].runId]:'Determine which documents have been uploaded and if they satisfy any requirements.',
 [RECOVERY.steps[1].runId]:'Determine which requested documents have been uploaded and what remains outstanding.',
 [successorId]:'Determine which requested documents have been uploaded and what remains outstanding.',
};
type Row=Record<string,any>;
export function sameRecoveryScope(run:Row,successor:Row){
 if(reviewedGoals[run.id]!==run.delegation_goal||reviewedGoals[successor.id]!==successor.delegation_goal)return false;
 const scope=(r:Row)=>({objective:r.request.objective,assessmentScope:r.request.assessmentScope,documents:r.request.documents,requirements:r.request.requirements,fingerprint:r.request.snapshot.inputFingerprint,authority:r.request.authority});
 return digest(scope(run))===digest(scope(successor));
}
export async function finalizeRecovery(database:Pool,apply=false){
 const service=new PreparationService(database),rows=(await database.query('SELECT user_id FROM borrower_preparations WHERE application_id=$1',[RECOVERY.applicationId])).rows;
 if(rows.length!==1)throw Error('Expected one scoped preparation');
 const access={applicationId:RECOVERY.applicationId,userId:rows[0].user_id};
 return service.transaction(access,async db=>{
  if((await db.query('SELECT current_schema() AS schema')).rows[0].schema!=='preview_v6')throw Error('Only preview_v6 may be repaired');
  const prep=(await db.query('SELECT * FROM borrower_preparations WHERE application_id=$1 AND user_id=$2 FOR UPDATE',[access.applicationId,access.userId])).rows[0],budget=prep.state.budget;
  if(budget.limitMicros!==RECOVERY.cap||budget.reservedMicros!==0||budget.unknownCost)throw Error('Expected unchanged $5 cap and fully settled costs');
  const markers=(await db.query("SELECT payload FROM preparation_stream WHERE application_id=$1 AND user_id=$2 AND payload->>'type'='run.superseded' AND payload->'data'->>'reasonCode'=$3",[access.applicationId,access.userId,reason])).rows.map(r=>r.payload);
  if(markers.length){if(markers.length!==2||RECOVERY.steps.slice(0,2).some(s=>!markers.some(m=>m.runId===s.runId&&m.data.successorRunId===successorId)))throw Error('Inconsistent retirement markers');return {applied:false,alreadyApplied:true,budget};}
  if((await db.query("SELECT 1 FROM preparation_runs WHERE application_id=$1 AND state IN ('queued','running') UNION ALL SELECT 1 FROM borrower_agent_turns WHERE application_id=$1 AND state IN ('queued','running')",[access.applicationId])).rowCount)throw Error('Pending worker work must stop first');
  const runs=(await db.query('SELECT * FROM preparation_runs WHERE preparation_id=$1 AND id=ANY($2::text[]) FOR UPDATE',[prep.id,RECOVERY.steps.map(s=>s.runId)])).rows;
  if(runs.length!==3)throw Error('Original run set missing');
  const successor=runs.find(r=>r.id===successorId)!;
  if(!['partial','succeeded'].includes(successor.state))throw Error('Successor has no terminal assessment');
  const mode=await processorMode(db,access.applicationId),inventory=await service.inventory(db,access.applicationId);
  for(const run of runs){
   const grant=run.request.authority.policyRevision;
   if(run.token||run.lease_until||grant!==`explicit:${mode.epoch}`||mode.mode!=='adaptive'||String(run.execution_epoch)!==mode.epoch||digest({inventory,actor:access.userId,epoch:mode.epoch,grant})!==run.request.snapshot.inputFingerprint)throw Error('Run authority or evidence changed');
   if(!sameRecoveryScope(run,successor))throw Error('Different investigation intent or scope');
  }
  const ref=prep.state.currentResultRef;
  if(!ref)throw Error('No current assessment');
  const result=await service.readResult(db,access,ref.id,ref.revision);
  if(result.freshness!=='current'||result.preparationRevision!==String(prep.revision)||result.preparationId!==prep.id||result.coverageRef?.id!==successorId)throw Error('Result is not the current successor assessment');
  const committed=(await db.query("SELECT payload FROM preparation_stream WHERE application_id=$1 AND user_id=$2 AND payload->>'runId'=$3 AND payload->>'type'='run.result_committed' ORDER BY sequence DESC LIMIT 1",[access.applicationId,access.userId,successorId])).rows[0]?.payload;
  if(committed?.data?.resultId!==ref.id||committed.data.resultRevision!==ref.revision||committed.runRevision!==String(successor.revision))throw Error('Successor result event mismatch');
  const sameIds=(a:string[],b:string[])=>digest([...a].sort())===digest([...b].sort());
  const borrowerRequirements=inventory.requirements.filter(r=>r.collection==='borrower');
  if(!sameIds(result.requirements.map(r=>r.requirementId),borrowerRequirements.map(r=>r.requirementId)))throw Error('Result does not cover complete current requirement scope');
  for(const requirement of borrowerRequirements){const assessed=result.requirements.find(r=>r.requirementId===requirement.requirementId)!;if(!sameIds(assessed.checks.map(c=>c.criterionId),requirement.criteria.map(c=>c.id)))throw Error('Result omits a criterion');}
  if(!sameIds(result.documents.map(d=>`${d.documentId}:${d.sha256}`),inventory.documents.filter(d=>d.active).map(d=>`${d.documentId}:${d.sha256}`)))throw Error('Result document versions differ');
  const retired=runs.filter(r=>r.id!==successorId);
  for(const run of retired){
   if(run.state!=='waiting_input')throw Error('Duplicate is not stalled');
   const latest=(await db.query("SELECT payload FROM preparation_stream WHERE application_id=$1 AND user_id=$2 AND payload->>'runId'=$3 ORDER BY sequence DESC LIMIT 1",[access.applicationId,access.userId,run.id])).rows[0]?.payload;
   if(latest?.type!=='run.needs_input'||latest.data.reasonCode!=='tool_or_validation_limit')throw Error('Unexpected stalled reason');
   if((await db.query('SELECT 1 FROM preparation_questions WHERE run_id=$1 AND answer IS NULL',[run.id])).rowCount)throw Error('Duplicate has unanswered borrower intent');
  }
  const report={applied:apply,alreadyApplied:false,budget,preparationRevision:String(prep.revision),resultRef:ref,successorRunId:successorId,successorState:successor.state,supersededRunIds:retired.map(r=>r.id),coveredRequirements:result.requirements.length};
  if(!apply)return report;
  for(const run of retired){
   const revision=(await db.query("UPDATE preparation_runs SET state='superseded',revision=revision+1,token=NULL,lease_until=NULL WHERE id=$1 RETURNING revision::text",[run.id])).rows[0].revision;
   await service.appendEvent(db,access,{schemaVersion:'processing-event.v1',type:'run.superseded',runId:run.id,runRevision:revision,artifactId:run.request.origin.artifactId,state:'superseded',inputFingerprint:run.request.snapshot.inputFingerprint,data:{successorRunId:successorId,reasonCode:reason}});
  }
  return report;
 });
}
async function main(){
 await import('./env');const args=process.argv.slice(2);
 if(args.length>1||(args[0]!==undefined&&args[0]!=='--apply'))throw Error('Usage: tsx scripts/finalize-investigation-recovery.ts [--apply]');
 const url=new URL(process.env.DATABASE_URL??'');
 if(url.hostname!=='127.0.0.1'||url.port!=='5434'||url.pathname!=='/preview')throw Error('Only isolated preview database is allowed');
 const database=new Pool({connectionString:url.toString()});
 try{console.log(JSON.stringify(await finalizeRecovery(database,args.includes('--apply')),null,2));}finally{await database.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(error=>{console.error(error instanceof Error?error.message:'Retirement failed');process.exitCode=1;});
