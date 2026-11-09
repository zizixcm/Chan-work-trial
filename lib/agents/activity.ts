import {randomUUID} from 'node:crypto';
import {PreparationService,type PreparationAccess} from '../preparation/service';

export type AgentActivity={id:string;runId:string;label:string;status:'running'|'completed'|'failed';startedAt:string;completedAt?:string};
const labels:Record<string,string>={reply:'Preparing response',investigate:'Starting document review',answer_question:'Recording your answer',inspect_document:'Inspecting document',read_pages:'Reading document',search_evidence:'Searching document',propose_mapping:'Matching document to request',ask:'Preparing a clarification',assess:'Checking requirements'};
export function activityLabel(kind:string,documentName?:string){
 const label=labels[kind];if(!label)throw Error('Unknown activity');
 const name=documentName?.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,120);
 return name&&['inspect_document','read_pages','search_evidence','propose_mapping'].includes(kind)?`${label}: ${name}`:label;
}
/** Runs beside the actual durable tool handler, never inferred from elapsed time.
 * Activity writes do not advance evidence revisions or change answer freshness. */
export async function withToolActivity<T>(service:PreparationService,access:PreparationAccess,source:{actor:'borrower'|'investigation';runId:string;token:string;kind:string;documentName?:string},work:()=>Promise<T>):Promise<T>{
 const id=randomUUID(),label=activityLabel(source.kind,source.documentName);
 const table=source.actor==='borrower'?'borrower_agent_turns':'preparation_runs';
 await service.transaction(access,async db=>{
  const valid=await db.query(`SELECT 1 FROM ${table} WHERE id=$1 AND application_id=$2 AND user_id=$3 AND token=$4 AND state='running' AND lease_until>now()`,[source.runId,access.applicationId,access.userId,source.token]);
  if(!valid.rowCount)throw Error('Execution lease lost');
  await db.query("INSERT INTO borrower_agent_activity(id,application_id,user_id,run_id,actor,lease_token,label,status) VALUES($1,$2,$3,$4,$5,$6,$7,'running')",[id,access.applicationId,access.userId,source.runId,source.actor,source.token,label]);
 });
 const finish=(status:'completed'|'failed')=>service.transaction(access,db=>db.query("UPDATE borrower_agent_activity SET status=$4,completed_at=now() WHERE id=$1 AND application_id=$2 AND user_id=$3 AND status='running'",[id,access.applicationId,access.userId,status]));
 try{
  const result=await work();
  // A reader may return a durable unavailable observation without throwing.
  const unavailable=!!(result&&typeof result==='object'&&'activityFailed' in result&&result.activityFailed);
  await finish(unavailable?'failed':'completed').catch(()=>{});
  return result;
 }catch(error){await finish('failed').catch(()=>{});throw error;}
}
export async function readAgentActivity(service:PreparationService,access:PreparationAccess):Promise<AgentActivity[]>{
 return service.transaction(access,async db=>{
  const rows=(await db.query(`SELECT a.*,CASE WHEN a.actor='borrower' THEN b.state='running' AND b.token=a.lease_token AND b.lease_until>now() ELSE r.state='running' AND r.token=a.lease_token AND r.lease_until>now() END AS live
   FROM borrower_agent_activity a
   LEFT JOIN borrower_agent_turns b ON a.actor='borrower' AND b.id=a.run_id AND b.application_id=a.application_id AND b.user_id=a.user_id
   LEFT JOIN preparation_runs r ON a.actor='investigation' AND r.id=a.run_id AND r.application_id=a.application_id AND r.user_id=a.user_id
   WHERE a.application_id=$1 AND a.user_id=$2 ORDER BY a.started_at DESC,a.id DESC LIMIT 50`,[access.applicationId,access.userId])).rows;
  return rows.reverse().map(row=>({id:row.id,runId:row.run_id,label:row.label,status:row.status==='running'&&!row.live?'failed':row.status,startedAt:new Date(row.started_at).toISOString(),...(row.completed_at?{completedAt:new Date(row.completed_at).toISOString()}:{})}));
 });
}
