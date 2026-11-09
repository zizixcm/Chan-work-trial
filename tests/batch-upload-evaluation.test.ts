import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createLocalMastraObservability} from '../lib/evaluation-observability';
import {assessBatchUpload,batchQualityChecks,batchStages,createBatchUploadScorer,runNativeBatchUploadEvaluation,type BatchInput,type BatchReceipt} from '../lib/evaluation-observability/batch-upload';

const input:BatchInput={caseId:'BATCH-01',batchId:'batch',documentIds:['a','b'],maxParallel:2,reportCeilingMs:20000,requireBrowser:true};
function receipt():BatchReceipt{return {caseId:input.caseId,batchId:input.batchId,source:'live',clock:'monotonic',traceId:'synthetic-test-only',
 delegations:[{documentIds:['a','b'],atMs:10}],files:['a','b'].map((documentId,i)=>({documentId,filename:`${documentId}.pdf`,startedMs:20+i,terminalMs:500+i,
  execution:[{spanId:`test-span-${documentId}`,kind:'local',startedMs:20+i,endedMs:500+i}],
  stages:batchStages.map((stage,j)=>({stage,status:'completed',persistedMs:40+j*100+i,visibleMs:50+j*100+i,evidenceRefs:[`test-observation-${documentId}-${j}`]}))})),
 assessments:[{startedMs:510,completedMs:1000,documentIds:['a','b']}],finalReplyMs:1100,receiptVisibleMs:5,
 browser:{reconnectRestored:true,noDuplicateRows:true,noFalseSuccess:true},review:{provenance:'evaluator',status:'complete',checks:batchQualityChecks.map(id=>({id,passed:true}))}};}

test('native scorer accepts complete synthetic evidence and fails closed on unreviewed output',async()=>{
 const scorer=createBatchUploadScorer();assert.equal((await scorer.run({input,output:receipt()})).score,1);
 const r=receipt();r.review.status='pending';assert.equal((await scorer.run({input,output:r})).score,0);
});
test('sequential files, split delegation and premature assessment fail independently',()=>{
 const r=receipt();r.files[1].startedMs=600;r.files[1].terminalMs=1100;r.files[1].execution=[{spanId:'later',kind:'local',startedMs:600,endedMs:1100}];r.files[1].stages.forEach(s=>{s.persistedMs+=600;s.visibleMs!+=600;});
 assert.ok(assessBatchUpload(input,r).issues.includes('no_parallel_file_work'));
 const split=receipt();split.delegations=[{documentIds:['a'],atMs:10},{documentIds:['b'],atMs:11}];assert.ok(assessBatchUpload(input,split).issues.includes('one_bulk_delegation'));
 const early=receipt();early.assessments[0].startedMs=400;assert.ok(assessBatchUpload(input,early).issues.includes('assessment_barrier'));
});

test('overlapping queued file lifetimes do not prove parallel execution',()=>{
 const r=receipt();r.files[0].execution[0].endedMs=200;r.files[1].execution[0].startedMs=201;
 assert.ok(assessBatchUpload(input,r).issues.includes('no_parallel_file_work'));
});
test('reordered stages, missing file, false UI success, and absent browser evidence cannot pass',()=>{
 const r=receipt();r.files[0].stages[2].persistedMs=30;assert.equal(assessBatchUpload(input,r).passed,false);
 const missing=receipt();missing.files.pop();assert.ok(assessBatchUpload(input,missing).issues.includes('file_coverage'));
 const ui=receipt();ui.browser!.noFalseSuccess=false;assert.equal(assessBatchUpload(input,ui).passed,false);
 ui.browser=null;assert.equal(assessBatchUpload(input,ui).passed,false);
});
test('blocked evidence may finish checks but semantic unknown-to-fulfilled fails',()=>{
 const r=receipt();r.files[0].stages.slice(1).forEach(s=>{s.status='blocked';});assert.equal(assessBatchUpload(input,r).passed,true);
 r.review.checks.find(c=>c.id==='unknown_not_fulfilled')!.passed=false;assert.equal(assessBatchUpload(input,r).passed,false);
});
test('offline, slow and duplicated review receipts cannot earn live pass',()=>{
 const r=receipt();r.source='offline';assert.equal(assessBatchUpload(input,r).passed,false);
 r.source='live';r.finalReplyMs=20001;assert.equal(assessBatchUpload(input,r).passed,false);
 const dup=receipt();dup.review.checks[0]=dup.review.checks[1];assert.equal(assessBatchUpload(input,dup).passed,false);
});

test('native batch workflow records offline verdict and workflow trace without provider calls',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'proximity-batch-eval-'));
 const observer=await createLocalMastraObservability({directory});
 try{
  const outcome=await runNativeBatchUploadEvaluation({observer,input,correlation:{caseId:input.caseId,evalRunId:'offline-contract',datasetVersion:'batch-upload.1'},
   evaluate:async context=>{const r=receipt();r.source='offline';r.traceId=context.trace.traceId;return r;}});
  assert.equal(outcome.value.passed,false);
  const trace=await observer.readTrace(outcome.trace);
  assert.ok(trace!.spans.some(s=>s.spanType==='workflow_run'));
 }finally{await observer.close();await rm(directory,{recursive:true,force:true});}
});
