import type {Pool} from 'pg';
import {pool} from '../db';
export interface MetricRow {
 id:string; applicationId:string; task:string; state:string; model:string; version:string;
 attempts:number; providerAttempts:number; createdAt:string; updatedAt:string; safeCode:string|null;
 events:Array<{event:string;token:string;at:string}>;
 reservations:number; knownCostUsd:number; unknownReservedUsd:number; unknownUsageAttempts:number;
 inputTokens:number; outputTokens:number;
}
const live=new Set(['queued','running','retry_wait','blocked']);
export function summarize(rows:MetricRow[],now=Date.now()){
 const durations=(values:number[])=>{const sorted=values.sort((a,b)=>a-b);const p=(n:number)=>sorted.length?sorted[Math.max(0,Math.ceil(sorted.length*n)-1)]:null;return {count:sorted.length,p50Ms:p(.5),p95Ms:p(.95),p99Ms:p(.99)};};
 const queue:number[]=[],total:number[]=[],preparation:number[]=[],modelAndValidation:number[]=[];
 const outcomes:Record<string,number>={},days:Record<string,{jobs:number;succeeded:number;failed:number}>={};
 let pending=0,oldestPendingMs=0,knownCostUsd=0,unknownReservedUsd=0,unknownUsageAttempts=0,inputTokens=0,outputTokens=0,retriedJobs=0;
 for(const row of rows){
  outcomes[row.state]=(outcomes[row.state]||0)+1;
  const day=row.createdAt.slice(0,10);days[day]??={jobs:0,succeeded:0,failed:0};days[day].jobs++;if(row.state==='succeeded')days[day].succeeded++;if(['failed','dead_letter','expired'].includes(row.state))days[day].failed++;
  const started=row.events.find(e=>e.event==='running');if(started)queue.push(Math.max(0,Date.parse(started.at)-Date.parse(row.createdAt)));
  if(live.has(row.state)){pending++;oldestPendingMs=Math.max(oldestPendingMs,now-Date.parse(row.createdAt));}
  else total.push(Math.max(0,Date.parse(row.updatedAt)-Date.parse(row.createdAt)));
  const attempts=new Map<string,Map<string,string>>();
  for(const event of row.events){if(!attempts.has(event.token))attempts.set(event.token,new Map());const values=attempts.get(event.token)!;if(!values.has(event.event))values.set(event.event,event.at);}
  for(const values of attempts.values()){
   for(const [a,b,destination] of [['preparing','prepared',preparation],['dispatch','responded',modelAndValidation]] as const){
    const start=values.get(a),end=values.get(b);if(start&&end)destination.push(Math.max(0,Date.parse(end)-Date.parse(start)));
   }
  }
  if(row.providerAttempts>1)retriedJobs++;
  knownCostUsd+=row.knownCostUsd;unknownReservedUsd+=row.unknownReservedUsd;unknownUsageAttempts+=row.unknownUsageAttempts;inputTokens+=row.inputTokens;outputTokens+=row.outputTokens;
 }
 return {jobs:rows.length,pending,oldestPendingMs,retriedJobs,outcomes,days,knownCostUsd,unknownReservedUsd,unknownUsageAttempts,inputTokens,outputTokens,
  queueWait:durations(queue),terminalLatency:durations(total),preparation:durations(preparation),modelAndValidation:durations(modelAndValidation)};
}
export async function workflowMetrics(userId:string,filter:{days:number;applicationId?:string;task?:string},database:Pool=pool()){
 const rows=(await database.query(`WITH selected AS (
  SELECT j.*,count(*) OVER()::int AS total_count FROM analysis_jobs j
  JOIN application_memberships m ON m.application_id=j.application_id AND m.user_id=$1 AND m.active
  WHERE j.created_at>=now()-($2::int * interval '1 day') AND ($3::text IS NULL OR j.application_id=$3)
    AND ($4::text IS NULL OR j.task=$4)
    AND (m.role='borrower' OR (m.role='lender' AND j.consent_scope='lender'
      AND j.input->'observed'->>'submissionId'=(SELECT s.id FROM submissions s WHERE s.application_id=j.application_id ORDER BY revision_number DESC LIMIT 1)))
  ORDER BY j.created_at DESC,j.id DESC LIMIT 2000
 ), events AS (
  SELECT e.job_id,jsonb_agg(jsonb_build_object('event',e.event,'token',e.token::text,'at',e.created_at) ORDER BY e.created_at,e.id) AS events
  FROM analysis_events e JOIN selected s ON s.id=e.job_id GROUP BY e.job_id
 ), costs AS (
  SELECT r.job_id,count(*)::int reservations,coalesce(sum(r.accounted_usd),0)::float8 known,
    coalesce(sum(r.reserved_usd) FILTER(WHERE r.accounted_usd IS NULL),0)::float8 unknown,
    count(*) FILTER(WHERE r.input_tokens IS NULL OR r.output_tokens IS NULL)::int unknown_usage,
    coalesce(sum(r.input_tokens),0)::float8 input_tokens,coalesce(sum(r.output_tokens),0)::float8 output_tokens
  FROM analysis_reservations r JOIN selected s ON s.id=r.job_id GROUP BY r.job_id
 ) SELECT s.id,s.application_id AS "applicationId",s.task,s.state,s.input->>'model' model,s.input->>'version' version,
    s.attempt attempts,s.provider_attempts AS "providerAttempts",s.created_at AS "createdAt",s.updated_at AS "updatedAt",s.safe_code AS "safeCode",
    coalesce(e.events,'[]'::jsonb) events,coalesce(c.reservations,0) reservations,coalesce(c.known,0) AS "knownCostUsd",
    coalesce(c.unknown,0) AS "unknownReservedUsd",coalesce(c.unknown_usage,0) AS "unknownUsageAttempts",
    coalesce(c.input_tokens,0) AS "inputTokens",coalesce(c.output_tokens,0) AS "outputTokens",s.total_count
  FROM selected s LEFT JOIN events e ON e.job_id=s.id LEFT JOIN costs c ON c.job_id=s.id ORDER BY s.created_at DESC,s.id DESC`,[userId,filter.days,filter.applicationId||null,filter.task||null])).rows;
 const total=rows[0]?.total_count||0;
 const data:MetricRow[]=rows.map(({total_count:_,...r})=>({...r,createdAt:r.createdAt.toISOString(),updatedAt:r.updatedAt.toISOString()} as MetricRow));
 return {schemaVersion:'workflow-metrics.v1',generatedAt:new Date().toISOString(),filter,totalMatchingJobs:total,exportedJobs:data.length,truncated:total>data.length,limit:2000,summary:summarize(data),jobs:data};
}
export function metricsCsv(rows:MetricRow[]){
 const keys=['id','applicationId','task','state','model','version','attempts','providerAttempts','createdAt','updatedAt','safeCode','reservations','knownCostUsd','unknownReservedUsd','unknownUsageAttempts','inputTokens','outputTokens'] as const;
 const cell=(value:unknown)=>{let s=value==null?'':String(value);if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
 const timingKeys=['initialQueueWaitMs','terminalLatencyMs','preparationSamples','preparationP50Ms','modelValidationSamples','modelValidationP50Ms'];
 return [[...keys,...timingKeys].join(','),...rows.map(row=>{
  const timings=summarize([row]);
  return [...keys.map(key=>cell(row[key])),...[timings.queueWait.p50Ms,timings.terminalLatency.p50Ms,timings.preparation.count,timings.preparation.p50Ms,timings.modelAndValidation.count,timings.modelAndValidation.p50Ms].map(cell)].join(',');
 })].join('\r\n');
}
