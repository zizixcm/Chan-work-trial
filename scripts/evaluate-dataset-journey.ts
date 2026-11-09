import './env';
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {mkdtemp,readFile,readdir,rm,mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {createEvaluationAgentTransport} from './mastra-evaluation-transport';
import {evaluationSummary} from './evaluation-ledger.mjs';
import {AGENT_CONFIGURATION_DIGEST,borrowerInstructions,investigationInstructions} from '../lib/agents/definitions';
import type {AgentTransport} from '../lib/agents/runtime';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createLocalMastraObservability} from '../lib/evaluation-observability';
import {runDatasetJourney} from '../lib/evaluation-observability/dataset-driver';
import {DATASET_CASES,sha256,type DatasetCaseId} from '../lib/evaluation-observability/dataset';
import {createMastraBorrowerPlanner,createMastraInvestigationPlanner,withAgentObservability} from '../lib/agents/runtime';
import type {BorrowerPlanner} from '../lib/agents/borrower-service';
import type {PreparationPlanner} from '../lib/preparation/actions';
import {scriptedAgentTransport} from '../tests/fixtures/native-agent-model';

/** Explicit exploratory journey runner. Defaults offline; deployment owner dispatches live. */
async function main(){
 const mode=process.env.DATASET_EXECUTION??'offline-scripted';
 if(!['offline-scripted','live-exploratory'].includes(mode))throw Error('Unknown execution mode');
 const live=mode==='live-exploratory',caseId=process.env.DATASET_CASE??'D01';
 if(!['D01','D03'].includes(caseId))throw Error('Only D01 and D03 exploratory journeys are enabled');
 const ledger=process.env.PREPARATION_EVALUATION_LEDGER,apiKey=process.env.OPENROUTER_API_KEY;
 if(live&&(!ledger||!apiKey||process.env.PREPARATION_EVALUATION_BATCH_ID!=='first-pilot-20261108'||process.env.PREPARATION_EVALUATION_BATCH_LIMIT_MICROS!=='5000000'))throw Error('Existing shared ledger and approved batch configuration required');
 const url=new URL(process.env.DATABASE_URL!);
 if(live&&(url.hostname!=='127.0.0.1'||url.port!=='5434'||url.pathname!=='/preview'))throw Error('Live execution requires isolated preview database');
 if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('Local disposable database only');
 const schema=`dataset_eval_${randomUUID().replaceAll('-','')}`;
 const admin=new Pool({connectionString:url.toString()});url.searchParams.set('options',`-c search_path=${schema},public`);
 const db=new Pool({connectionString:url.toString()});
 const directory=resolve(process.env.DATASET_OUTPUT_DIR??`artifacts/testing/dataset-${caseId}-${mode}-${Date.now()}`);
 // A new directory prevents mixing attempts or overwriting historical results.
 await mkdir(directory,{recursive:false,mode:0o700});
 const save=async(name:string,value:unknown)=>writeFile(join(directory,name),JSON.stringify(value,null,2)+'\n',{mode:0o600});
 const sourceFiles=['lib/evaluation-observability/index.ts','lib/evaluation-observability/evals.ts','lib/evaluation-observability/dataset.ts','lib/evaluation-observability/dataset-driver.ts','lib/evaluation-observability/dataset-scorers.ts','lib/agents/runtime.ts','lib/agents/definitions.ts','lib/agents/borrower-service.ts','lib/preparation/worker.ts','lib/preparation/service.ts','scripts/evaluate-dataset-journey.ts','scripts/mastra-evaluation-transport.ts','scripts/live-evaluation-fetch.mjs','scripts/evaluation-ledger.mjs'];
 const sourceHashes=Object.fromEntries(await Promise.all(sourceFiles.map(async file=>[file,sha256(await readFile(file))])));
 const sdkVersion=JSON.parse(await readFile(createRequire(import.meta.url).resolve('@mastra/core/package.json'),'utf8')).version;
 const before=live?evaluationSummary(ledger!):null,started=Date.now();let dispatches=0,investigatorDispatches=0;
 const observer=await createLocalMastraObservability({directory:join(directory,'observability')});
 const configuration={mode,caseId,sdkVersion,agentConfigurationDigest:AGENT_CONFIGURATION_DIGEST,sourceHashes,model:live?'openrouter/google/gemini-2.5-flash':'scripted',applicationLimitMicros:2000000,worker:{runLimitMicros:2000000,maxCalls:24,timeoutMs:180000},batchId:'first-pilot-20261108',batchLimitMicros:5000000,cumulativeLimitMicros:20000000};
 const configurationDigest=sha256(JSON.stringify(configuration));
 await save('configuration.json',{...configuration,configurationDigest,budgetBefore:before});
 const capture=(base:AgentTransport):AgentTransport=>({...base,async run(agent,messages,signal,execution){
  const index=++dispatches,name=String(index).padStart(3,'0');
  if(agent.id!=='borrower-preparation')investigatorDispatches++;
  const input={agentId:agent.id,messages,instructions:agent.id==='borrower-preparation'?borrowerInstructions:investigationInstructions,configurationDigest};
  await save(`call-${name}-input.json`,{...input,sha256:sha256(JSON.stringify(input))});
  const original=agent.generate;
  agent.generate=(async(...args:any[])=>{
   const result=await (original as any).apply(agent,args);
   await save(`call-${name}-output.json`,{text:result.text,toolCalls:result.toolCalls,toolResults:result.toolResults,steps:result.steps,finishReason:result.finishReason,usage:result.totalUsage,error:result.error?String(result.error):null});
   return result;
  }) as typeof agent.generate;
  try{return await base.run(agent,messages,signal,execution);}
  catch(error){await save(`call-${name}-error.json`,{error:String(error)});throw error;}
  finally{agent.generate=original;}
 }});
 const liveTransport=()=>withAgentObservability(capture(createEvaluationAgentTransport({ledger:ledger!,apiKey:apiKey!,scenario:`dataset-${caseId}`,batchId:'first-pilot-20261108',batchLimitMicros:5000000,configurationDigest})),observer);
 const traced=(tool:string,args:Record<string,unknown>)=>withAgentObservability(capture(scriptedAgentTransport(tool,args)),observer);
 const borrower=():BorrowerPlanner=>({maximumCallMicros:600000,async decide(value,signal,execute,execution){
  const input=value as any;
  assert.equal(input.oracle,undefined);assert.equal(input.expected,undefined);
  const question=input.processing.pendingQuestions[0],message=input.messages.find((m:any)=>m.id===input.trigger.sourceMessageId);
  if(question&&message)return createMastraBorrowerPlanner(traced('answer_investigation_question',{questionId:question.questionId,sourceMessageId:message.id,answerText:message.text,message:'I will forward your answer for investigation.'})).decide(value,signal,execute,execution);
  if(input.processing.currentResult||input.processing.activeRuns.length||input.inventory.pendingUploads)return createMastraBorrowerPlanner(traced('reply_to_borrower',{message:'The saved documents remain available. Unresolved evidence requires further investigation; this is not approval.'})).decide(value,signal,execute,execution);
  return createMastraBorrowerPlanner(traced('investigate_documents',{goal:'Assess the requested documentary criteria using saved evidence.',documentIds:input.inventory.documents.filter((d:any)=>d.active).map((d:any)=>d.documentId),requirementIds:input.inventory.requirements.map((r:any)=>r.requirementId),message:'I will investigate the saved documents.'})).decide(value,signal,execute,execution);
 }});
 const investigator=():PreparationPlanner=>({maximumCallMicros:600000,async decide(input,signal,execute,execution){
  assert.equal((input as any).oracle,undefined);assert.equal((input as any).expected,undefined);
  let tool='publish_assessment',args:Record<string,unknown>|undefined;
  for(const doc of input.inventory.documents.filter(d=>d.active)){
   const seen=input.observations.filter(o=>o.documentId===doc.documentId),inventory=seen.find(o=>o.pageCount>0);
   if(!inventory){tool='inspect_document';args={documentId:doc.documentId};break;}
   const pages=Array.from({length:inventory.pageCount},(_,i)=>i+1).filter(page=>!seen.some(o=>['text','image','ocr'].includes(o.kind)&&o.pages.some(p=>p.page===page)));
   if(pages.length){tool='read_evidence';args={documentId:doc.documentId,pages:pages.slice(0,8),mode:'text'};break;}
  }
  if(!args)args={findings:input.inventory.requirements.flatMap(r=>r.criteria.map(c=>({requirementId:r.requirementId,criterionId:c.id,state:'unknown',reasonCode:'offline_plumbing_probe',explanation:'The scripted integration probe does not adjudicate document semantics.',evidence:[],gap:{kind:'clarification',subject:null,period:null,documentRole:null,description:'Independent semantic adjudication is still required.',owner:'operator'}}))),limitations:[]};
  return createMastraInvestigationPlanner(traced(tool,args)).decide(input,signal,execute,execution);
 }});
 try{
  await admin.query(`CREATE SCHEMA ${schema}`);
  for(const file of (await readdir('migrations/postgres')).filter(f=>f.endsWith('.sql')).sort())await db.query(await readFile(join('migrations/postgres',file),'utf8'));
  const result=await runDatasetJourney({datasetRoot:resolve('datasets/borrower-e2e-v1'),caseId:caseId as DatasetCaseId,database:db,observer,mode:mode as 'offline-scripted'|'live-exploratory',planners:live?{borrower:()=>createMastraBorrowerPlanner(liveTransport()),investigator:()=>createMastraInvestigationPlanner(liveTransport(),configurationDigest)}:{borrower,investigator},budgetMicros:2000000,worker:configuration.worker,onBoundary:async(observation,score)=>save(`boundary-${observation.boundaryId}.json`,{observation,score})});
  await save('report.json',{...result,configurationDigest,elapsedMs:Date.now()-started,dispatches,budgetBefore:before,budgetAfter:live?evaluationSummary(ledger!):null,semanticReview:'pending separate adjudication; automated score alone is not model quality'});
  const trace=await observer.readTrace(result.trace);
  await save('trace.json',trace);
  if(!live){assert.equal(result.passed,false);assert.equal(result.boundaries.length,3);assert.ok(trace!.spans.some(s=>s.spanType==='tool_call'));assert.ok(investigatorDispatches>0,'Investigator must actually execute');assert.ok(result.boundaries.every(b=>b.observation.errors.length===0&&b.observation.findings.length===14),'All offline boundaries must publish all criteria without controller errors');}
  console.log(JSON.stringify({directory,caseId,mode,boundaries:result.boundaries.length,dispatches,semanticReview:'pending'}));
 }catch(error){await save('failure.json',{error:String(error),elapsedMs:Date.now()-started,dispatches,budgetBefore:before,budgetAfter:live?evaluationSummary(ledger!):null});throw error;}
 finally{await observer.close();await db.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
