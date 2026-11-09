/** Second-pass resume after correcting the pilot's assessment tool validation.
 * No accounting changes, no provider calls; default dry-run, scoped to the original runs.
 * Requires the worker's result revision fix (result uses current fenced preparation revision).
 */
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {Pool} from 'pg';
import {RECOVERY} from './recover-stalled-investigations';
import {PreparationService} from '../lib/preparation/service';
import {processorMode} from '../lib/preparation/ownership';
import {digest} from '../lib/preparation-pilot/contracts';
const resumeId='pilot-assessment-recovery-20261108-v2';
const obligationIds=['7e3e7181-1362-4a75-abb9-29b36d7c73d6','801c9c17-0d4b-4301-b747-fdab51478215','c66dcd2a-0290-485a-b30d-359f4aabdc0f'];
export function assertResumeLimits(budget:{limitMicros:number;reservedMicros:number;unknownCost:boolean},calls:number,spent:number){
 if(budget.limitMicros!==RECOVERY.cap||budget.reservedMicros!==0||budget.unknownCost)throw Error('Expected unchanged $5 cap and fully settled costs');
 if(!Number.isSafeInteger(calls)||calls<0||calls>=24||!Number.isSafeInteger(spent)||spent<0||spent+600000>2000000)throw Error('Existing investigation call or run budget exhausted');
}
export async function resumeRecovered(database:Pool,apply=false){
 const service=new PreparationService(database),rows=(await database.query('SELECT user_id FROM borrower_preparations WHERE application_id=$1',[RECOVERY.applicationId])).rows;
 if(rows.length!==1)throw Error('Expected one scoped preparation');
 const access={applicationId:RECOVERY.applicationId,userId:rows[0].user_id};
 return service.transaction(access,async db=>{
  if((await db.query('SELECT current_schema() AS schema')).rows[0].schema!=='preview_v6')throw Error('Only preview_v6 may be repaired');
  const prep=(await db.query('SELECT * FROM borrower_preparations WHERE application_id=$1 AND user_id=$2 FOR UPDATE',[access.applicationId,access.userId])).rows[0];
  const budget=prep.state.budget;
  if(budget.limitMicros!==RECOVERY.cap||budget.reservedMicros!==0||budget.unknownCost)throw Error('Expected unchanged $5 cap and fully settled costs');
  const marked=async(id:string)=>(await db.query("SELECT DISTINCT payload->>'runId' AS id FROM preparation_stream WHERE application_id=$1 AND user_id=$2 AND payload->'data'->>'activityCode'=$3",[access.applicationId,access.userId,id])).rows;
  const completed=await marked(resumeId);
  if(completed.length){if(completed.length!==3||RECOVERY.steps.some(s=>!completed.some(r=>r.id===s.runId)))throw Error('Partial resume marker');return {applied:false,alreadyApplied:true,budget};}
  const first=await marked(RECOVERY.id);
  if(first.length!==3||RECOVERY.steps.some(s=>!first.some(r=>r.id===s.runId)))throw Error('Original accounting repair is incomplete');
  if((await db.query("SELECT 1 FROM preparation_runs WHERE application_id=$1 AND state IN ('queued','running') UNION ALL SELECT 1 FROM borrower_agent_turns WHERE application_id=$1 AND state IN ('queued','running')",[access.applicationId])).rowCount)throw Error('Stop and reconcile pending worker work first');
  const mode=await processorMode(db,access.applicationId),inventory=await service.inventory(db,access.applicationId);
  const runs=[];
  for(const target of RECOVERY.steps){
   const run=(await db.query('SELECT * FROM preparation_runs WHERE id=$1 AND preparation_id=$2 FOR UPDATE',[target.runId,prep.id])).rows[0];
   if(!run||run.state!=='waiting_input'||run.token||run.lease_until)throw Error('Run is not safely stalled');
   const grant=run.request.authority.policyRevision;
   if(grant!==`explicit:${mode.epoch}`||mode.mode!=='adaptive'||String(run.execution_epoch)!==mode.epoch||digest({inventory,actor:access.userId,epoch:mode.epoch,grant})!==run.request.snapshot.inputFingerprint)throw Error('Evidence or authority changed');
   const latest=(await db.query("SELECT payload FROM preparation_stream WHERE application_id=$1 AND user_id=$2 AND payload->>'runId'=$3 ORDER BY sequence DESC LIMIT 1",[access.applicationId,access.userId,run.id])).rows[0]?.payload;
   if(latest?.type!=='run.needs_input'||latest.data.reasonCode!=='tool_or_validation_limit')throw Error('Unexpected stalled reason');
   const accounting=(await db.query('SELECT count(*)::int AS calls,count(*) FILTER(WHERE NOT cost_settled)::int AS unsettled FROM preparation_steps WHERE run_id=$1',[run.id])).rows[0];
   if(accounting.unsettled)throw Error('Unsettled step');
   assertResumeLimits(budget,accounting.calls,Number(run.spent_micros));
   runs.push(run);
  }
  const obligations=prep.state.obligations.filter((o:Record<string,unknown>)=>obligationIds.includes(String(o.id)));
  if(obligations.length!==3||obligations.some((o:Record<string,unknown>)=>o.owner!=='operator'||o.status!=='open'||o.resumeTrigger!=='tool_or_validation_limit'))throw Error('Operator obligations changed');
  const report={applied:apply,alreadyApplied:false,budget,preparationRevision:String(prep.revision),runs:runs.map(r=>({id:r.id,observations:r.observations.length})),resolvedObligationIds:obligationIds};
  if(!apply)return report;
  for(const run of runs){
   const revision=(await db.query("UPDATE preparation_runs SET state='queued',revision=revision+1 WHERE id=$1 RETURNING revision::text",[run.id])).rows[0].revision;
   await service.appendEvent(db,access,{schemaVersion:'processing-event.v1',type:'run.progress',runId:run.id,runRevision:revision,artifactId:run.request.origin.artifactId,state:'queued',inputFingerprint:run.request.snapshot.inputFingerprint,data:{activityCode:resumeId,intakeRef:null,affectedRequirementIds:[],inspectedCount:run.observations.length,limitations:[],nextPollAfterMs:1000}});
  }
  for(const obligation of obligations)obligation.status='resolved';
  // Bookkeeping is not an evidence revision; keep the preparation revision unchanged.
  await db.query('UPDATE borrower_preparations SET state=$2 WHERE id=$1',[prep.id,prep.state]);
  return report;
 });
}
async function main(){
 await import('./env');
 const args=process.argv.slice(2);
 if(args.length>1||(args[0]!==undefined&&args[0]!=='--apply'))throw Error('Usage: tsx scripts/resume-repaired-investigations.ts [--apply]');
 const url=new URL(process.env.DATABASE_URL??'');
 if(url.hostname!=='127.0.0.1'||url.port!=='5434'||url.pathname!=='/preview')throw Error('Only isolated preview database is allowed');
 const database=new Pool({connectionString:url.toString()});
 try{console.log(JSON.stringify(await resumeRecovered(database,args.includes('--apply')),null,2));}finally{await database.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(error=>{console.error(error instanceof Error?error.message:'Resume failed');process.exitCode=1;});
