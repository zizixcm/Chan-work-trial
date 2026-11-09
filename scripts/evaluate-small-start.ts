/** Four user-selected starting cases. Offline by default; owner dispatches live. */
import './env';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {Pool} from 'pg';
import {BorrowerAgentService} from '../lib/agents/borrower-service';
import {AGENT_CONFIGURATION_DIGEST,borrowerInstructions,investigationInstructions} from '../lib/agents/definitions';
import {createMastraBorrowerPlanner,createMastraInvestigationPlanner,withAgentObservability,type AgentTransport} from '../lib/agents/runtime';
import {PreparationWorker} from '../lib/preparation/worker';
import {DocumentEvidenceTools} from '../lib/preparation/evidence-tools';
import {transitionProcessorMode} from '../lib/preparation/ownership';
import {createLocalMastraObservability} from '../lib/evaluation-observability';
import {runNativeEvaluationCase} from '../lib/evaluation-observability/evals';
import {latencyBudgets,assessLatency,createQualityLatencyScorer} from '../lib/evaluation-observability/latency';
import {createEvaluationAgentTransport} from './mastra-evaluation-transport';
import {scriptedAgentTransport} from '../tests/fixtures/native-agent-model';
import {evaluationSummary} from './evaluation-ledger.mjs';
import {PILOT_MODEL} from '../lib/agents/pilot-model.mjs';
const hash=(v:string|Uint8Array)=>createHash('sha256').update(v).digest('hex');
async function main(){
 const mode=process.env.SMALL_EVAL_EXECUTION??'offline';if(!['offline','live'].includes(mode))throw Error('Unknown mode');
 const live=mode==='live',caseId=process.env.SMALL_EVAL_CASE??'EMPTY-REQUESTED';
 const specBytes=await readFile('artifacts/testing/quality-latency-tuning/small-start-spec.json'),spec=JSON.parse(specBytes.toString()),fixture=spec.cases.find((c:any)=>c.id===caseId);if(!fixture)throw Error('Case not allowlisted');
 const upload=caseId==='ONE-UPLOAD',url=new URL(process.env.DATABASE_URL!);
 if(!['127.0.0.1','localhost'].includes(url.hostname)||(live&&(url.hostname!=='127.0.0.1'||url.port!=='5434'||url.pathname!=='/preview')))throw Error('Isolated local database required');
 const ledger=process.env.PREPARATION_EVALUATION_LEDGER,apiKey=process.env.OPENROUTER_API_KEY;
 if(live&&(!ledger||!apiKey||process.env.PREPARATION_EVALUATION_BATCH_ID!=='first-pilot-20261108'||process.env.PREPARATION_EVALUATION_BATCH_LIMIT_MICROS!=='5000000'))throw Error('Existing shared budget configuration required');
 if(live&&evaluationSummary(ledger!).heldMicros)throw Error('Unknown/pending shared cost blocks dispatch');
 const requestBytes=await readFile('datasets/borrower-e2e-v1/corpus/development/D01/agent/request.json'),request=JSON.parse(requestBytes.toString());
 const directory=path.resolve(process.env.SMALL_EVAL_OUTPUT_DIR??`artifacts/testing/small-${caseId}-${Date.now()}`);await mkdir(directory,{mode:0o700});
 const save=(name:string,value:unknown)=>writeFile(path.join(directory,name),JSON.stringify(value,null,2)+'\n',{mode:0o600});
 const observer=await createLocalMastraObservability({directory:path.join(directory,'observability')});
 const schema=`dataset_eval_small_${randomUUID().replaceAll('-','')}`,admin=new Pool({connectionString:url.toString()});url.searchParams.set('options',`-c search_path=${schema},public`);const db=new Pool({connectionString:url.toString()});
 const before=live?evaluationSummary(ledger!):null;let calls=0,decisions=0,accepted=0,firstVisibleMs:number|null=null,firstDurableReplyMs:number|null=null,analysisPublishedMs:number|null=null,queueMs:number|null=null;
 const callTimings:any[]=[],replyChunks:{call:number;elapsedMs:number;text:string}[]=[];
 const configuration={caseId,mode,model:PILOT_MODEL,agentConfigurationDigest:AGENT_CONFIGURATION_DIGEST,specDigest:hash(specBytes),requestDigest:hash(requestBytes),worker:{runLimitMicros:2000000,maxCalls:24,timeoutMs:180000},sourceHashes:Object.fromEntries(await Promise.all(['scripts/evaluate-small-start.ts','lib/agents/definitions.ts','lib/agents/runtime.ts','lib/preparation/worker.ts','lib/preparation/actions.ts','lib/preparation/incremental-findings.ts','scripts/mastra-evaluation-transport.ts','scripts/live-evaluation-fetch.mjs','lib/evaluation-observability/latency.ts'].map(async f=>[f,hash(await readFile(f))])))};
 await save('configuration.json',configuration);
 const transport=(scripted?:AgentTransport)=>withAgentObservability((()=>{
  const base=live?createEvaluationAgentTransport({ledger:ledger!,apiKey:apiKey!,scenario:`small-${caseId}`,batchId:'first-pilot-20261108',batchLimitMicros:5000000,configurationDigest:AGENT_CONFIGURATION_DIGEST}):scripted!;
  return {...base,async run(agent:any,messages:any,signal:any,execution:any){
   if(!upload&&calls)throw Error('Empty case permits one generation');
   const n=++calls,start=performance.now();queueMs??=start-accepted;
   await save(`call-${n}-input.json`,{messages,instructions:agent.id==='borrower-preparation'?borrowerInstructions:investigationInstructions});
   let native:any;const original=agent.stream;agent.stream=async(...args:any[])=>{native=await original.apply(agent,args);return native;};
   try{return await base.run(agent,messages,signal,{...execution,onReplyText:async(text:string)=>{const elapsedMs=performance.now()-accepted;replyChunks.push({call:n,elapsedMs,text});if(text.trim()&&firstVisibleMs===null)firstVisibleMs=elapsedMs;await execution?.onReplyText?.(text);}});}
   catch(error){await save(`call-${n}-error.json`,{error:String(error)});throw error;}
   finally{agent.stream=original;callTimings.push({index:n,agentId:agent.id,startMs:start-accepted,durationMs:performance.now()-start});if(native)await save(`call-${n}-output.json`,{text:await native.text,toolCalls:await native.toolCalls,toolResults:await native.toolResults,finishReason:await native.finishReason,usage:await native.totalUsage});}
  }};
 })(),observer);
 const capture=(p:any):any=>({...p,async decide(input:any,signal:any,execute:any,execution:any){const n=++decisions;await save(`decision-${n}-input.json`,input);return p.decide(input,signal,async(action:any)=>{await save(`decision-${n}-action.json`,action);try{const r=await execute(action);await save(`decision-${n}-result.json`,r);return r;}catch(error){await save(`decision-${n}-validation.json`,{error:String(error)});throw error;}},execution);}});
 try{
  await admin.query(`CREATE SCHEMA ${schema}`);
  for(const file of (await readdir('migrations/postgres')).filter(f=>f.endsWith('.sql')).sort())await db.query(await readFile(path.join('migrations/postgres',file),'utf8'));
  await db.query(`INSERT INTO "user"(id,name,email,"emailVerified") VALUES('b01-user','Synthetic B01 borrower','b01@example.test',true)`);
  await db.query("INSERT INTO applications(id,borrower_name,property_name,address,transaction_type,requested_amount,loi_reference,created_at) VALUES('b01-app',$1,$2,'Synthetic address',$3,1000,'B01',now())",[request.application.borrower,request.application.property,request.policy.transaction]);
  await db.query("INSERT INTO application_memberships(application_id,user_id,role) VALUES('b01-app','b01-user','borrower')");
  for(let i=0;i<5;i++){
   const id=`b01-r${i+1}`,entries=Object.entries(request.policy.criteria).filter(([key])=>key.startsWith(`R${i+1}.`));
   const policy=Object.fromEntries(entries.flatMap(([key],n)=>key==='R2.chain'?[[`${id}:criterion:${n+1}`,'no_amendments']]:[]));
   await db.query("INSERT INTO requirements(id,application_id,title,category,purpose,period,owner,applicability,sort_order,criteria,criterion_confirmation_policy) VALUES($1,'b01-app',$2,'Pilot',$3,$4,'Borrower','Required',$5,$6,$7)",[id,request.policy.requests[i],i===0?'Application-wide lender policy (applies to every request):\n'+request.policy.rules.join('\n')+'\nDeclared application context: '+JSON.stringify(request.application):'Required documentary evidence: '+request.policy.requests[i],request.policy.reviewDate,i,entries.map(([,description])=>description),policy]);
  }
  const service=new BorrowerAgentService(db),access={applicationId:'b01-app',userId:'b01-user',role:'borrower' as const,displayName:'Synthetic B01 borrower'};
  await service.preparation.transaction(access,tx=>transitionProcessorMode(tx,access.applicationId,'adaptive'));
  await db.query("INSERT INTO borrower_preparations(id,application_id,user_id,fingerprint,state) VALUES('b01-prep','b01-app','b01-user','',$1)",[{currentResultRef:null,obligations:[],questionRefs:[],budget:{limitMicros:2000000,knownMicros:0,reservedMicros:0,unknownCost:false}}]);
  const declared=await service.enqueueMessage(access,{clientMessageId:'declared-context',text:request.initialMessage});
  await db.query("UPDATE borrower_agent_turns SET state='superseded',reason_code='fixture_context_only' WHERE id=$1",[declared.id]);

  await db.query("INSERT INTO user_ai_preferences(user_id,enabled) VALUES('b01-user',true) ON CONFLICT(user_id) DO UPDATE SET enabled=true");
  let bytes:Buffer|undefined;
  if(upload){bytes=await readFile('datasets/borrower-e2e-v1/corpus/development/D01/files/f7dbacda2c2f3.pdf');assert.equal(hash(bytes),fixture.sha256);
   await db.query("INSERT INTO documents(id,application_id,original_name,storage_key,content_type,size_bytes,sha256,uploaded_by,created_at) VALUES('small-doc','b01-app','f7dbacda2c2f3.pdf','small-blob','application/pdf',$1,$2,'Synthetic borrower',now())",[bytes.length,hash(bytes)]);
   accepted=performance.now();await service.enqueueEvents(access);
  }else{accepted=performance.now();await service.enqueueMessage(access,{clientMessageId:'small-question',text:fixture.question});}
  const borrower=()=>live?capture(createMastraBorrowerPlanner(transport())):{maximumCallMicros:PILOT_MODEL.reservationMicros,async decide(input:any,signal:any,execute:any,execution:any){
   const script=upload&&!input.processing.currentResult&&!input.processing.activeRuns.length?scriptedAgentTransport('investigate_documents',{goal:'Identify this uploaded document and assess its relevance and remaining requirements.',documentIds:['small-doc'],requirementIds:input.inventory.requirements.map((r:any)=>r.requirementId),message:'Received your document. I will check it.'}):scriptedAgentTransport('reply_to_borrower',{message:'Offline wiring probe; semantic review not performed.'});
   return capture(createMastraBorrowerPlanner(transport(script))).decide(input,signal,execute,execution);
  }};
  const investigator=()=>live?capture(createMastraInvestigationPlanner(transport(),AGENT_CONFIGURATION_DIGEST)):{maximumCallMicros:PILOT_MODEL.reservationMicros,async decide(input:any,signal:any,execute:any,execution:any){
   let script:AgentTransport;
   if(!input.observations.length)script=scriptedAgentTransport('inspect_document',{documentId:'small-doc'});
   else if(!input.observations.some((o:any)=>o.kind==='text'))script=scriptedAgentTransport('read_evidence',{documentId:'small-doc',pages:[1],mode:'text'});
   else script=scriptedAgentTransport('publish_assessment',{findings:[],limitations:[]});
   return capture(createMastraInvestigationPlanner(transport(script))).decide(input,signal,execute,execution);
  }};
  let snapshot:any,turns:any,elapsedMs=0,executionFailure:unknown;
  const evaluated=await runNativeEvaluationCase({observer,tier:upload?'e2e':'turn',correlation:{caseId,evalRunId:randomUUID(),datasetVersion:'small-start.1',configurationDigest:AGENT_CONFIGURATION_DIGEST},requiredChecks:upload?['one_saved_document','assessment_published','borrower_followthrough']:['empty_inventory','no_investigation','one_reply'],evaluate:async(id,context)=>{try{
   await db.query("UPDATE borrower_conversations SET agent_trace_ref=$1 WHERE application_id='b01-app'",[context.trace]);
   for(let cycle=0;cycle<(upload?12:1);cycle++){
    const ran=await service.runOne(access,borrower());
    if(firstDurableReplyMs===null&&(await db.query("SELECT 1 FROM borrower_agent_turns WHERE state='completed' AND response_text IS NOT NULL")).rowCount)firstDurableReplyMs=performance.now()-accepted;
    const queued=(await db.query("SELECT id FROM preparation_runs WHERE state='queued' ORDER BY created_at,id")).rows;
    for(const run of queued){await new PreparationWorker(service.preparation,investigator(),new DocumentEvidenceTools(),async key=>{assert.equal(key,'small-blob');return bytes!;},configuration.worker).run(access,run.id);if(analysisPublishedMs===null&&(await service.preparation.snapshot(access)).currentResult)analysisPublishedMs=performance.now()-accepted;}
    if(!upload)break;await service.enqueueEvents(access);if(!ran.ran&&!queued.length)break;if(cycle===11)throw Error('Controller cycle limit');
   }
   elapsedMs=performance.now()-accepted;snapshot=await service.preparation.snapshot(access);
   turns=(await db.query('SELECT id,state,decision,response_text,reason_code,actual_micros FROM borrower_agent_turns ORDER BY created_at,id')).rows;
   const documents=(await db.query('SELECT id,original_name,sha256 FROM documents')).rows,runs=(await db.query('SELECT id,state,spent_micros FROM preparation_runs')).rows;
   await save('controller.json',{snapshot,turns,documents,runs,events:(await db.query('SELECT sequence,payload FROM preparation_stream ORDER BY sequence')).rows});
   const replies=turns.filter((t:any)=>t.state==='completed'&&t.response_text);
   const checks=upload?[{id:'one_saved_document',passed:documents.length===1},{id:'assessment_published',passed:!!snapshot.currentResult},{id:'borrower_followthrough',passed:!!snapshot.currentResult&&replies.some((t:any)=>t.decision?.kind==='reply')}]:[{id:'empty_inventory',passed:documents.length===0},{id:'no_investigation',passed:runs.length===0},{id:'one_reply',passed:replies.length===1&&calls===1}];
   return {caseId:id,completed:true,checks};
  }catch(error){executionFailure=error;throw error;}}});
  if(executionFailure)throw executionFailure;
  const receipt={caseId,source:live?'live' as const:'offline' as const,status:turns.some((t:any)=>t.state==='blocked')?'blocked' as const:'completed' as const,quality:'pending' as const,timing:{clock:'monotonic' as const,queueMs:queueMs??0,completionMs:elapsedMs,firstUsefulMs:null}};
  const latencyInput={caseId,budget:upload?latencyBudgets.smallInvestigation:latencyBudgets.borrower};
  const scorer=createQualityLatencyScorer();observer.mastra.addScorer(scorer);const score=await scorer.run({input:latencyInput,output:receipt});await observer.recordScore(evaluated.trace,{scorerId:scorer.id,scorerVersion:'1',score:score.score??0});
  await save('report.json',{caseId,mode,configurationDigest:hash(JSON.stringify(configuration)),structuralPassed:evaluated.value.passed,semanticReview:'pending; structural/offline success is not quality',timing:{receipt,firstVisibleMs,firstDurableReplyMs,analysisPublishedMs,uploadReceiptVisibleMs:null,uploadReceiptMeasurement:"Requires upload API/browser evidence; DB fixture does not measure visible receipt",calls:callTimings},latency:assessLatency(latencyInput,receipt),calls,snapshot,turns,trace:evaluated.trace,budgetBefore:before,budgetAfter:live?evaluationSummary(ledger!):null});
  await save('reply-chunks.json',replyChunks);await save('trace.json',await observer.readTrace(evaluated.trace));
  if(!live)assert.equal(evaluated.value.passed,true,'Offline controller wiring must complete');
  console.log(JSON.stringify({caseId,mode,directory,calls,elapsedMs,structuralPassed:evaluated.value.passed,quality:'pending'}));
 }catch(error){await save('failure.json',{error:String(error),calls,callTimings,budgetAfter:live?evaluationSummary(ledger!):null});throw error;}
 finally{await observer.close();await db.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
