/** One-off, trace-backed repair of the three November 8 pilot investigations.
 * Default is read-only planning. Stop the scoped worker before --apply. No model calls.
 * Run from the isolated release: tsx scripts/recover-stalled-investigations.ts --trace <export.json> [--apply]
 */
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {Pool} from 'pg';
import {PreparationService} from '../lib/preparation/service';
import {processorMode} from '../lib/preparation/ownership';
import {digest} from '../lib/preparation-pilot/contracts';

export const RECOVERY={
 id:'pilot-inspection-recovery-20261108-v1',
 applicationId:'b0dcd236-7da1-44e2-a26a-42a2e837afe1',
 traceId:'fe2390b4b24f9d9ae26094cbead1b340',
 cap:5000000,
 steps:[
  {runId:'1481616c-346b-47b8-9ba1-148a8be20ef6',stepId:'3a93ab43-d943-4543-8f32-ac76f47cc2f3'},
  {runId:'40899326-38e2-4e2e-81e5-fe63eb412ecd',stepId:'ecb5bbcb-c944-4dca-8c6d-2a775df11c5f'},
  {runId:'9693e6a8-6810-4b5f-a568-0947f39fa324',stepId:'11739e3d-a1db-4965-9953-662c8ccdc8f1'},
 ],
 turns:['event:f1976143-aaf2-419c-a2d8-2f705a0f5cc7','event:22aa3f1c-fe18-46b2-8761-fe94b556210e','529fd8a9-134b-4bb7-8a98-9f7924d276d5','event:27dcdc22-295a-4ba2-bd4e-314b1e139287'],
} as const;
type Row=Record<string,any>;
type Trace={traceId:string;spans:Row[]};
export function confirmedCost(trace:Trace,ref:Row,correlation:Record<string,string>,kind:'investigation-step'|'borrower-turn',reservation:number):number{
 if(trace.traceId!==RECOVERY.traceId||ref?.traceId!==trace.traceId)throw Error('Trace identity mismatch');
 const matches=trace.spans.filter(s=>s.traceId===ref.traceId&&s.spanId===ref.spanId);
 if(matches.length!==1)throw Error('Expected exactly one correlated cost span');
 const span=matches[0],metadata=span.metadata;
 if(span.name!==kind||span.status!=='success'||span.error||!span.endedAt||metadata?.costKnown!==true)throw Error('Provider cost is not confirmed');
 for(const [key,value] of Object.entries(correlation))if(metadata[key]!==value)throw Error('Trace correlation mismatch');
 const amount=metadata.actualMicros;
 if(!Number.isSafeInteger(amount)||amount<0||!Number.isSafeInteger(reservation)||reservation<=0||amount>reservation)throw Error('Invalid confirmed cost');
 return amount;
}
export function repairedBudget(budget:Row,reservations:number,actual:number){
 if(budget.limitMicros!==RECOVERY.cap)throw Error('Expected unchanged $5 application cap');
 if(![budget.knownMicros,budget.reservedMicros,reservations,actual].every(n=>Number.isSafeInteger(n)&&n>=0)||reservations!==budget.reservedMicros||actual>reservations)throw Error('Unaccounted reservations; refuse repair');
 const next:Row={...budget,knownMicros:budget.knownMicros+actual,reservedMicros:0,unknownCost:false};
 if(next.knownMicros>next.limitMicros)throw Error('Repair would exceed cap');
 return next;
}
/** These are failed automatic reactions to the original stalled runs, not user messages.
 * Scope and the two reviewed recovery goals must match before retiring them. */
export function redundantTurn(turn:Row,sourceEvent:Row,run:Row):boolean{
 if(turn.source_message_id!==null||turn.outcome!==null||sourceEvent?.type!=='run.needs_input'||sourceEvent?.data?.reasonCode!=='provider_outcome_unknown'||sourceEvent.runId!==run.id)return false;
 const eventKey=`event:${sourceEvent.eventId}`;
 if(turn.source_key!==eventKey&&!new RegExp(`^retry:${eventKey}:[0-9]+$`).test(turn.source_key))return false;
 if(turn.decision===null)return turn.state==='superseded'&&turn.reason_code==='context_changed';
 const decision=turn.decision;
 const approvedGoals=['Check the uploaded documents against the requested items and identify what has been satisfied.','Determine which requested documents have been satisfied by the uploaded file.'];
 const sameIds=(left:unknown,right:string[])=>Array.isArray(left)&&left.every(v=>typeof v==='string')&&digest([...left].sort())===digest([...right].sort());
 return decision.kind==='investigate'&&approvedGoals.includes(decision.goal)&&run.request.objective==='understand_and_assess'&&run.request.assessmentScope==='affected_requirements'
  &&sameIds(decision.documentIds,run.request.documents.map((d:Row)=>d.documentId))&&sameIds(decision.requirementIds,run.request.requirements.map((r:Row)=>r.requirementId));
}
export async function recover(database:Pool,trace:Trace,apply=false){
 const service=new PreparationService(database);
 const selected=(await database.query('SELECT user_id FROM borrower_preparations WHERE application_id=$1',[RECOVERY.applicationId])).rows;
 if(selected.length!==1)throw Error('Expected one scoped preparation');
 const access={applicationId:RECOVERY.applicationId,userId:selected[0].user_id as string};
 return service.transaction(access,async db=>{
  if((await db.query('SELECT current_schema() AS schema')).rows[0].schema!=='preview_v6')throw Error('Only preview_v6 may be repaired');
  const prep=(await db.query('SELECT * FROM borrower_preparations WHERE application_id=$1 AND user_id=$2 FOR UPDATE',[access.applicationId,access.userId])).rows[0];
  if(prep.state.budget.limitMicros!==RECOVERY.cap)throw Error('Expected unchanged $5 application cap');
  const completed=(await db.query("SELECT DISTINCT payload->>'runId' AS id FROM preparation_stream WHERE application_id=$1 AND user_id=$2 AND payload->'data'->>'activityCode'=$3",[access.applicationId,access.userId,RECOVERY.id])).rows;
  if(completed.length){
   if(completed.length!==3||RECOVERY.steps.some(s=>!completed.some(r=>r.id===s.runId)))throw Error('Partial or inconsistent repair marker');
   return {applied:false,alreadyApplied:true,budget:prep.state.budget};
  }
  if((await db.query("SELECT 1 FROM preparation_runs WHERE application_id=$1 AND state IN ('queued','running') UNION ALL SELECT 1 FROM borrower_agent_turns WHERE application_id=$1 AND state IN ('queued','running')",[access.applicationId])).rowCount)throw Error('Pending work exists; stop and reconcile worker before repair');
  const mode=await processorMode(db,access.applicationId),inventory=await service.inventory(db,access.applicationId);
  const preference=(await db.query('SELECT enabled,epoch::text FROM user_ai_preferences WHERE user_id=$1',[access.userId])).rows[0];
  const steps:Row[]=[],turns:Row[]=[];
  for(const target of RECOVERY.steps){
   const run=(await db.query('SELECT * FROM preparation_runs WHERE id=$1 AND preparation_id=$2 FOR UPDATE',[target.runId,prep.id])).rows[0];
   if(!run||run.state!=='waiting_input'||run.token||run.lease_until)throw Error('Investigation is not safely stalled');
   const grant=run.request.authority.policyRevision;
   if(mode.mode!=='adaptive'||String(run.execution_epoch)!==mode.epoch||digest({inventory,actor:access.userId,epoch:mode.epoch,grant})!==run.request.snapshot.inputFingerprint)throw Error('Investigation evidence or execution epoch changed');
   if(grant.startsWith('automatic:')&&(!preference?.enabled||grant!==`automatic:${mode.epoch}:${preference.epoch}`))throw Error('Automatic grant revoked');
   const latest=(await db.query("SELECT payload FROM preparation_stream WHERE application_id=$1 AND user_id=$2 AND payload->>'runId'=$3 ORDER BY sequence DESC LIMIT 1",[access.applicationId,access.userId,run.id])).rows[0]?.payload;
   if(latest?.type!=='run.needs_input'||latest.data.reasonCode!=='provider_outcome_unknown')throw Error('Unexpected stalled reason');
   const step=(await db.query('SELECT * FROM preparation_steps WHERE run_id=$1 AND id=$2 FOR UPDATE',[run.id,target.stepId])).rows[0];
   if(!step||!step.cost_settled||step.status!=='responded'||step.output!==null)throw Error('Step is not an original unknown-cost attempt');
   const reserved=Number(step.reserved_micros),actual=confirmedCost(trace,step.trace_ref,{applicationId:access.applicationId,userId:access.userId,investigationRunId:run.id,stepId:step.id},'investigation-step',reserved);
   if(Number(run.spent_micros)<reserved)throw Error('Run accounting is inconsistent');
   steps.push({run,step,reserved,actual});
  }
  for(const id of RECOVERY.turns){
   const turn=(await db.query('SELECT * FROM borrower_agent_turns WHERE id=$1 AND application_id=$2 AND user_id=$3 FOR UPDATE',[id,access.applicationId,access.userId])).rows[0];
   if(!turn||!turn.cost_settled||turn.actual_micros!==null||!['blocked','superseded'].includes(turn.state)||turn.token||turn.lease_until)throw Error('Turn is not an original unknown-cost attempt');
   const sourceId=turn.source_key.match(/^(?:retry:)?event:([^:]+)(?::[0-9]+)?$/)?.[1];
   const sourceEvent=(await db.query('SELECT payload FROM preparation_stream WHERE id=$1 AND application_id=$2 AND user_id=$3',[sourceId,access.applicationId,access.userId])).rows[0]?.payload;
   const covered=steps.find(s=>s.run.id===sourceEvent?.runId)?.run;
   if(!covered||!redundantTurn(turn,sourceEvent,covered))throw Error('Failed turn has an uncovered user intent; refuse retirement');
   const reserved=Number(turn.reserved_micros),actual=confirmedCost(trace,turn.trace_ref,{applicationId:access.applicationId,userId:access.userId,borrowerTurnId:id},'borrower-turn',reserved);
   turns.push({turn,reserved,actual});
  }
  const settlements=[...steps,...turns],reservations=settlements.reduce((n,s)=>n+s.reserved,0),actual=settlements.reduce((n,s)=>n+s.actual,0),before=structuredClone(prep.state.budget),after=repairedBudget(before,reservations,actual);
  const obligations=prep.state.obligations.filter((o:Row)=>o.owner==='operator'&&o.status==='open'&&o.resumeTrigger==='provider_outcome_unknown');
  if(obligations.length!==3)throw Error('Unexpected operator obligations; refuse broad cleanup');
  const report={applied:apply,alreadyApplied:false,before,after,releasedMicros:reservations,confirmedMicros:actual,runs:steps.map(s=>({id:s.run.id,stepId:s.step.id,actualMicros:s.actual})),turns:turns.map(t=>({id:t.turn.id,actualMicros:t.actual,state:'superseded',reasonCode:RECOVERY.id}))};
  if(!apply)return report;
  // All evidence and accounting checks complete before the first write.
  for(const {run,step,reserved,actual} of steps){
   await db.query('UPDATE preparation_steps SET output=$3 WHERE run_id=$1 AND id=$2',[run.id,step.id,{operationalRecovery:{id:RECOVERY.id,actualMicros:actual,traceRef:step.trace_ref}}]);
   const updated=(await db.query("UPDATE preparation_runs SET spent_micros=spent_micros-$2+$3,state='queued',revision=revision+1,token=NULL,lease_until=NULL WHERE id=$1 RETURNING revision::text",[run.id,reserved,actual])).rows[0];
   await service.appendEvent(db,access,{schemaVersion:'processing-event.v1',type:'run.progress',runId:run.id,runRevision:updated.revision,artifactId:run.request.origin.artifactId,state:'queued',inputFingerprint:run.request.snapshot.inputFingerprint,data:{activityCode:RECOVERY.id,intakeRef:null,affectedRequirementIds:[],inspectedCount:run.observations.length,limitations:[],nextPollAfterMs:1000}});
  }
  for(const {turn,actual} of turns)await db.query("UPDATE borrower_agent_turns SET actual_micros=$2,state='superseded',reason_code=$3 WHERE id=$1",[turn.id,actual,RECOVERY.id]);
  prep.state.budget=after;for(const obligation of obligations)obligation.status='resolved';
  await db.query('UPDATE borrower_preparations SET state=$2,revision=revision+1 WHERE id=$1',[prep.id,prep.state]);
  return report;
 });
}
async function main(){
 await import('./env');
 const args=process.argv.slice(2),traceIndex=args.indexOf('--trace');
 if(traceIndex!==0||!args[1]||args.length>3||(args[2]!==undefined&&args[2]!=='--apply'))throw Error('Usage: tsx scripts/recover-stalled-investigations.ts --trace <export.json> [--apply]');
 const url=new URL(process.env.DATABASE_URL??'');
 if(url.hostname!=='127.0.0.1'||url.port!=='5434'||url.pathname!=='/preview')throw Error('Only isolated local preview database is allowed');
 const database=new Pool({connectionString:url.toString()});
 try{console.log(JSON.stringify(await recover(database,JSON.parse(await readFile(args[1],'utf8')),args.includes('--apply')),null,2));}finally{await database.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(error=>{console.error(error instanceof Error?error.message:'Recovery failed');process.exitCode=1;});
