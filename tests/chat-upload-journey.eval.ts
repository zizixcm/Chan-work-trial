import {finalizeUpload} from '../lib/jobs/upload-finalization';
/** Offline native-Mastra regression for the critical upload -> scoped review ->
 * borrower update journey. Scripted generation proves orchestration, not live
 * model judgment. All evidence is synthetic; expected assertions stay outside prompts. */
import '../scripts/env';
import {Pool} from 'pg';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
import {BorrowerAgentService} from '../lib/agents/borrower-service';
import {UploadBatchService} from '../lib/jobs/batches';
import {ConversationUploads} from '../lib/borrower-chat/uploads';
import {transitionProcessorMode} from '../lib/preparation/ownership';
import {PreparationWorker} from '../lib/preparation/worker';
import {DocumentEvidenceTools} from '../lib/preparation/evidence-tools';
import {createMastraBorrowerPlanner,createMastraInvestigationPlanner,withAgentObservability} from '../lib/agents/runtime';
import {AGENT_CONFIGURATION_DIGEST} from '../lib/agents/definitions';
import {scriptedAgentTransport} from './fixtures/native-agent-model';
import {createLocalMastraObservability} from '../lib/evaluation-observability';
import {runNativeEvaluationCase} from '../lib/evaluation-observability/evals';

const CHECKS=['explicit-upload-with-auto-disabled','queued-at-upload-commit','receipt-before-agent','new-files-trigger','focused-delegation','new-file-inspected','prior-finding-retained','validated-change','borrower-update','no-duplicate-work','activity-lifecycle','linked-native-trace'] as const;
async function main(fileCount:number){
 const url=new URL(process.env.DATABASE_URL!);if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('Disposable local schemas only');
 const schema='upload_eval_'+randomUUID().replaceAll('-',''),admin=new Pool({connectionString:url.toString()});url.searchParams.set('options',`-c search_path=${schema},public`);const db=new Pool({connectionString:url.toString()});
 const baseDirectory=resolve(process.env.CHAT_UPLOAD_EVAL_DIRECTORY??`artifacts/evals/chat-upload/${Date.now()}`);const directory=fileCount===1?baseDirectory:join(baseDirectory,'multi-file');await mkdir(directory,{recursive:true});
 const observer=await createLocalMastraObservability({directory:join(directory,'traces')});
 const captured:any[]=[];const checks:Record<string,boolean>={};
 try{
  await admin.query(`CREATE SCHEMA ${schema}`);for(const file of (await readdir('migrations/postgres')).filter(f=>f.endsWith('.sql')).sort())await db.query(await readFile('migrations/postgres/'+file,'utf8'));
  await db.query(`INSERT INTO "user"(id,name,email,"emailVerified") VALUES('u','Borrower','upload-eval@example.test',true)`);
  await db.query("INSERT INTO applications(id,borrower_name,property_name,address,transaction_type,requested_amount,loi_reference,created_at) VALUES('a','Borrower','Property','Address','Refinance',1000,'LOI',now())");
  await db.query("INSERT INTO application_memberships(application_id,user_id,role) VALUES('a','u','borrower')");
  await db.query("INSERT INTO user_ai_preferences(user_id,enabled) VALUES('u',false) ON CONFLICT(user_id) DO UPDATE SET enabled=false");
  await db.query("INSERT INTO requirements(id,application_id,title,category,purpose,period,owner,applicability,sort_order,criteria) VALUES('r','a','Operating evidence','Financial','Income','2025 and current','Borrower','Required',1,ARRAY['2025 operating income','Current rent roll'])");
  await db.query("INSERT INTO borrower_conversations(id,application_id,borrower_user_id) VALUES('chat','a','u')");
  const access={applicationId:'a',userId:'u',role:'borrower' as const,displayName:'Borrower'},service=new BorrowerAgentService(db),batches=new UploadBatchService(access,db);
  await service.preparation.transaction(access,tx=>transitionProcessorMode(tx,'a','adaptive'));
  await db.query(`INSERT INTO borrower_preparations(id,application_id,user_id,fingerprint,state) VALUES('prep','a','u','',$1)`,[{currentResultRef:null,obligations:[],questionRefs:[],budget:{limitMicros:10000000,knownMicros:0,reservedMicros:0,unknownCost:false}}]);
  const newDocumentIds=Array.from({length:fileCount},(_,i)=>i===0?'new':`new-${i+1}`);
  const bytes=new Map([['old',Buffer.from('2025 operating income: 100000.')],['new',Buffer.from('Current rent roll: tenant Acme, monthly rent 5000.')]]);
  for(const id of newDocumentIds.slice(1))bytes.set(id,Buffer.from(`Current rent roll supplement ${id}: tenant Acme, monthly rent 5000.`));
  const fileName=(id:string)=>id==='new'?'Rent roll.txt':`Rent roll supplement ${id}.txt`;
  const save=async(id:string,name:string)=>{const data=bytes.get(id)!;const sha=createHash('sha256').update(data).digest('hex');await db.query("INSERT INTO documents(id,application_id,original_name,storage_key,content_type,size_bytes,sha256,uploaded_by,created_at) VALUES($1,'a',$2,$1,'text/plain',$3,$4,'Borrower',now())",[id,name,data.length,sha]);return sha;};
  const native=(name:string,args:any)=>withAgentObservability(scriptedAgentTransport(name,args),observer);
  const finding=(id:string,observationId:string,quote:string)=>({requirementId:'r',criterionId:id,state:'met',reasonCode:'supported',explanation:quote,evidence:[{observationId,page:1,quote}],gap:null});
  const runInvestigator=async(runId:string,documentId:string,criterionId:string,quote:string,reaffirm=false,documentIds=[documentId])=>{
   const planner={maximumCallMicros:600000,async decide(input:any,signal:AbortSignal,execute:any,execution:any){
    const observations=documentIds.map(id=>input.observations.find((o:any)=>o.documentId===id&&o.kind==='text'));
    const missingIndex=observations.findIndex(o=>!o),readDocumentId=missingIndex<0?documentId:documentIds[missingIndex];
    const name=missingIndex<0?'publish_assessment':'read_evidence';
    const assessment=missingIndex<0?{...finding(criterionId,observations[0].id,quote),evidence:observations.map((o:any,i:number)=>({observationId:o.id,page:1,quote:bytes.get(documentIds[i])!.toString()}))}:null;
    const args=assessment?{findings:[assessment],...(reaffirm?{reaffirmCriterionIds:['r:criterion:1']}:{ }),limitations:[]}:{documentId:readDocumentId,pages:[1],mode:'text'};
    captured.push({stage:'investigator',tool:name,documentId:readDocumentId,criterionId});
    return createMastraInvestigationPlanner(native(name,args)).decide(input,signal,execute,execution);
   }};
   await new PreparationWorker(service.preparation,planner,new DocumentEvidenceTools(),async key=>bytes.get(key)!,{runLimitMicros:5000000,maxCalls:5,timeoutMs:60000}).run(access,runId);
  };
  await save('old','Operating statement.txt');
  const revision=(await db.query("SELECT content_revision::text FROM applications WHERE id='a'")).rows[0].content_revision;
  const baseline=await service.preparation.accept(access,{commandId:'baseline',idempotencyKey:'baseline',objective:'resolve_gap',assessmentScope:'affected_requirements',documentIds:['old'],requirementIds:['r'],origin:{kind:'borrower_request',conversationId:'chat',artifactId:null,domainEventId:'baseline'},uploadBatchId:null,expectedContentRevision:revision,retryOf:null});
  await runInvestigator(baseline.runId,'old','r:criterion:1','2025 operating income: 100000.');
  assert.equal((await service.preparation.snapshot(access)).currentResult!.requirements[0].checks[0].state,'met');
  await service.enqueueEvents(access);
  while((await service.runOne(access,createMastraBorrowerPlanner(native('reply_to_borrower',{message:'The operating statement is recorded; the current rent roll remains outstanding.'})))).ran){}
  captured.length=0;
  const evaluation=await runNativeEvaluationCase({observer,tier:'e2e',correlation:{caseId:fileCount===1?'CHAT-UPLOAD-01':'CHAT-UPLOAD-MULTI-01',evalRunId:schema,datasetVersion:'chat-upload-v4',applicationId:'a',userId:'u',configurationDigest:AGENT_CONFIGURATION_DIGEST},requiredChecks:CHECKS,evaluate:async(caseId,context)=>{
   await db.query("UPDATE borrower_conversations SET agent_trace_ref=$1 WHERE id='chat'",[context.trace]);
   await batches.create('new-upload',newDocumentIds.map(id=>({id:`member-${id}`,name:fileName(id),sha256:createHash('sha256').update(bytes.get(id)!).digest('hex')})));
   // Another unfinished upload must not prevent this batch's review.
   await batches.create('unfinished',[{id:'pending',name:'Pending statement.txt',sha256:'c'.repeat(64)}]);
   for(const id of newDocumentIds){await save(id,fileName(id));await db.query("UPDATE upload_batch_members SET state='saved',document_id=$1 WHERE id=$2",[id,`member-${id}`]);}await finalizeUpload(batches,await new Request('http://localhost/api/upload-batches',{method:'POST',body:JSON.stringify({action:'finalize',id:'new-upload'})}).json());
   checks['queued-at-upload-commit']=(await db.query("SELECT count(*)::int n FROM borrower_agent_turns WHERE trigger_context->>'uploadBatchId'='new-upload' AND state='queued'")).rows[0].n===1;
   assert(checks['queued-at-upload-commit'],'Upload commit itself must send one durable agent message before any worker scan');
   const receipt=(await new ConversationUploads(access,db).read()).cards.find(card=>card.batchId==='new-upload');checks['receipt-before-agent']=receipt?.members.length===fileCount&&receipt.members.every(m=>m.state==='saved');captured.push({stage:'upload-receipt',batchId:'new-upload',files:receipt?.members.map(m=>m.name)});
   await service.enqueueEvents(access);await service.enqueueEvents(access);
   const turn=(await db.query("SELECT * FROM borrower_agent_turns WHERE trigger_context->>'uploadBatchId'='new-upload'")).rows[0];assert(turn,'Explicit upload must enqueue without an extra chat message while automatic preference is disabled');checks['explicit-upload-with-auto-disabled']=turn.trigger_context.grant.kind==='explicit_upload'&&(await db.query("SELECT enabled FROM user_ai_preferences WHERE user_id='u'")).rows[0].enabled===false;checks['new-files-trigger']=JSON.stringify([...turn.trigger_context.newDocumentIds].sort())===JSON.stringify([...newDocumentIds].sort());
   checks['activity-lifecycle']=(await service.streamState(access)).uploadPending===true;
   const delegate=createMastraBorrowerPlanner(native('investigate_documents',{goal:'Review the newly uploaded rent roll and update the affected income criteria, preserving prior supported operating income.',documentIds:newDocumentIds,requirementIds:['r'],message:'I’ll review the uploaded rent roll.'}));
   await service.runOne(access,{...delegate,async decide(input,signal,execute,execution){captured.push({stage:'upload-trigger',trigger:(input as any).trigger});return delegate.decide(input,signal,execute,execution);}});
   const run=(await db.query("SELECT * FROM preparation_runs WHERE request->>'uploadBatchId'='new-upload'")).rows[0];assert.match(run.request.authority.policyRevision,/^explicit:/,'explicit upload authority must reach the investigator');checks['focused-delegation']=JSON.stringify(run.request.documents.map((d:any)=>d.documentId).sort())===JSON.stringify([...newDocumentIds].sort());
   await runInvestigator(run.id,'new','r:criterion:2','Current rent roll: tenant Acme, monthly rent 5000.',true,newDocumentIds);
   const state=await service.preparation.snapshot(access),result=state.currentResult!;assert(result,'validated result required');
   checks['prior-finding-retained']=result.requirements[0].checks.find(c=>c.criterionId==='r:criterion:1')?.state==='met';
   checks['validated-change']=result.requirements[0].checks.find(c=>c.criterionId==='r:criterion:2')?.state==='met';
   checks['new-file-inspected']=newDocumentIds.every(id=>captured.some(item=>item.stage==='investigator'&&item.tool==='read_evidence'&&item.documentId===id))&&!captured.some(item=>item.stage==='investigator'&&item.tool==='read_evidence'&&item.documentId==='old');
   await service.enqueueEvents(access);
   const update=`I reviewed ${newDocumentIds.map(fileName).join(', ')}. Your uploaded rent roll records Acme’s monthly rent of 5000. Your prior operating statement remains supported. Another upload is still unfinished, so the application is not yet complete.`;
   const summarize=createMastraBorrowerPlanner(native('reply_to_borrower',{message:update}));
   await service.runOne(access,{...summarize,async decide(input,signal,execute,execution){assert.equal((input as any).trigger.event?.type,'run.result_committed','a reporting turn is distinguishable from a new upload even though original upload metadata is retained');assert.equal((input as any).processing.currentResult?.resultId,result.resultId,'reporting turn receives validated current findings');assert.equal((input as any).trigger.upload?.uploadBatchId,'new-upload');captured.push({stage:'result-trigger',trigger:(input as any).trigger});return summarize.decide(input,signal,execute,execution);}});
   const replies=await service.read(access);const final=replies.find(reply=>reply.text===update);checks['borrower-update']=!!final&&final.freshness==='current'&&state.packageCompleteness?.status!=='complete';captured.push({stage:'borrower-update',text:final?.text,resultId:result.resultId});
   await finalizeUpload(batches,await new Request('http://localhost/api/upload-batches',{method:'POST',body:JSON.stringify({action:'finalize',id:'new-upload'})}).json());await service.enqueueEvents(access);
   checks['no-duplicate-work']=(await db.query("SELECT count(*)::int n FROM preparation_runs WHERE request->>'uploadBatchId'='new-upload'")).rows[0].n===1&&(await db.query("SELECT count(*)::int n FROM borrower_agent_turns WHERE source_key LIKE 'upload:new-upload:%'")).rows[0].n===1;
   checks['activity-lifecycle']&&=!(await service.streamState(access)).pending;
   const trace=await observer.readTrace(context.trace);checks['linked-native-trace']=!!trace?.spans.some(span=>span.spanType==='tool_call')&&trace.spans.some(span=>(span.metadata as any)?.uploadBatchId==='new-upload');
   return {caseId,completed:true,checks:CHECKS.map(id=>({id,passed:checks[id]===true}))};
  }});
  const report={caseId:fileCount===1?'CHAT-UPLOAD-01':'CHAT-UPLOAD-MULTI-01',version:'chat-upload-v4',fileCount,mode:'offline-scripted-native',configurationDigest:AGENT_CONFIGURATION_DIGEST,trace:evaluation.trace,passed:evaluation.value.passed,checks,captured,limitations:['Synthetic files and scripted generation; does not establish live model judgment.','Browser staging/receipt display verified separately; real save-to-visible latency not measured.']};
  await writeFile(join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');assert.equal(report.passed,true,JSON.stringify(checks));
  console.log(`PASS critical chat-upload journey eval; report ${join(directory,'report.json')}`);
 }finally{await observer.close();await db.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
}
(async()=>{await main(1);await main(3);})().catch(error=>{console.error(error);process.exitCode=1;});
