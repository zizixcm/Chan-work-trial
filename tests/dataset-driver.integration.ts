import '../scripts/env';
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {mkdtemp,readFile,readdir,rm,mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createLocalMastraObservability} from '../lib/evaluation-observability';
import {runDatasetJourney} from '../lib/evaluation-observability/dataset-driver';
import {DATASET_CASES,sha256,type DatasetCaseId} from '../lib/evaluation-observability/dataset';
import {createMastraBorrowerPlanner,createMastraInvestigationPlanner,withAgentObservability} from '../lib/agents/runtime';
import type {BorrowerPlanner} from '../lib/agents/borrower-service';
import type {PreparationPlanner} from '../lib/preparation/actions';
import {scriptedAgentTransport} from './fixtures/native-agent-model';

/** Deliberately conservative scripted agents test plumbing and truthful failure
 * reporting. No gold is passed to these planners; no semantic accuracy claim. */
async function main(){
 const url=new URL(process.env.DATABASE_URL!);
 if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('Local disposable database only');
 const schema=`dataset_eval_${randomUUID().replaceAll('-','')}`;
 const admin=new Pool({connectionString:url.toString()});url.searchParams.set('options',`-c search_path=${schema},public`);
 const db=new Pool({connectionString:url.toString()}),persistent=!!process.env.DATASET_TRACE_DIRECTORY;
 const directory=persistent?resolve(process.env.DATASET_TRACE_DIRECTORY!):await mkdtemp(join(tmpdir(),'dataset-native-'));
 await mkdir(directory,{recursive:true,mode:0o700});
 const sourceFiles=['lib/evaluation-observability/index.ts','lib/evaluation-observability/evals.ts','lib/evaluation-observability/dataset.ts','lib/evaluation-observability/dataset-driver.ts','lib/evaluation-observability/dataset-scorers.ts','lib/agents/runtime.ts','lib/agents/definitions.ts','lib/agents/borrower-service.ts','lib/preparation/worker.ts','lib/preparation/service.ts','tests/dataset-driver.integration.ts'];
 if(persistent)await writeFile(join(directory,'candidate-sha256.json'),JSON.stringify(Object.fromEntries(await Promise.all(sourceFiles.map(async file=>[file,sha256(await readFile(file))]))),null,2)+'\n',{mode:0o600});
 const observer=await createLocalMastraObservability({directory});
 const traced=(tool:string,args:Record<string,unknown>)=>withAgentObservability(scriptedAgentTransport(tool,args),observer);
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
  const selected=process.env.DATASET_DRIVER_ALL==='1'?DATASET_CASES:['D01'] as DatasetCaseId[];
  let count=0;
  for(const caseId of selected){
   const result=await runDatasetJourney({datasetRoot:resolve('datasets/borrower-e2e-v1'),caseId,database:db,observer,mode:'offline-scripted',planners:{borrower,investigator},budgetMicros:100000000,worker:{runLimitMicros:100000000,maxCalls:100,timeoutMs:60000}});
   if(persistent)await writeFile(join(directory,`${caseId}-report.json`),JSON.stringify(result,null,2)+'\n',{mode:0o600});
   assert.equal(result.boundaries.length,caseId==='DEV-BUDGET'?4:caseId==='DEV-UPLOAD-RACE'?5:caseId==='DEV-DIALOGUE'?6:3);
   assert.equal(result.passed,false,'Unknown scripted output and missing semantic review must not pass');
   assert.ok(result.boundaries.every(b=>!b.score.reviewComplete));
   const trace=await observer.readTrace(result.trace);assert.ok(trace!.spans.some(s=>s.spanType==='tool_call'));
   count+=result.boundaries.length;
   console.log(JSON.stringify({caseId,boundaries:result.boundaries.length,nativeTrace:true,qualityPassed:result.passed,controllerErrors:result.boundaries.flatMap(b=>b.observation.errors)}));
  }
  console.log(`PASS offline controller-driver execution: ${selected.length} cases, ${count} boundaries; no model quality pass or live calls.`);
 }finally{await observer.close();await db.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();if(!persistent)await rm(directory,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
