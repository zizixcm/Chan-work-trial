import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {initializeLedger,reserveEvaluationCall,settleEvaluationCall,amendEvaluationBatchLimit,evaluationSummary,evaluationBatchLimit} from '../scripts/evaluation-ledger.mjs';
const amendment={batchId:'same-batch',expectedLimitMicros:5_000_000,newLimitMicros:10_000_000,reason:'User requested higher eval budget',authorizationRef:'evaluation-chat:explicit-user-request'};
const reservation=(callId:string,cap=5_000_000)=>({callId,model:'test',scenario:'offline',upperBoundMicros:1_200_000,batchId:'same-batch',batchLimitMicros:cap});
test('explicit amendment preserves historical calls and permits only the approved new cap',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'budget-amendment-')),file=join(dir,'ledger.json');
 try{
  initializeLedger(file);reserveEvaluationCall(file,reservation('one'));settleEvaluationCall(file,'one',500);
  const before=JSON.parse(await readFile(file,'utf8')).calls;assert.equal(evaluationBatchLimit(file,'same-batch'),5_000_000);
  assert.throws(()=>reserveEvaluationCall(file,reservation('implicit',10_000_000)),/Batch budget/);
  const changed=amendEvaluationBatchLimit(file,amendment);assert.ok(changed.amendedAt);assert.equal(evaluationBatchLimit(file,'same-batch'),10_000_000);
  assert.deepEqual(JSON.parse(await readFile(file,'utf8')).calls,before);
  assert.equal(evaluationSummary(file).knownMicros,500);
  assert.throws(()=>amendEvaluationBatchLimit(file,amendment),/changed/);
  assert.throws(()=>reserveEvaluationCall(file,reservation('old-cap')),/Batch budget/);
  reserveEvaluationCall(file,reservation('two',10_000_000));settleEvaluationCall(file,'two',700);
  reserveEvaluationCall(file,reservation('three',10_000_000));
  assert.equal(evaluationSummary(file).knownMicros,1200);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('held costs, absent authorization, unknown batches and cumulative-cap violations reject amendment',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'budget-amendment-')),file=join(dir,'ledger.json');
 try{
  initializeLedger(file);
  assert.throws(()=>amendEvaluationBatchLimit(file,amendment),/unknown/);
  reserveEvaluationCall(file,reservation('one'));
  assert.throws(()=>amendEvaluationBatchLimit(file,amendment),/settled idle/);
  settleEvaluationCall(file,'one',null);
  assert.throws(()=>amendEvaluationBatchLimit(file,amendment),/settled idle/);
  assert.throws(()=>amendEvaluationBatchLimit(file,{...amendment,authorizationRef:''}),/authorization/);
  assert.throws(()=>amendEvaluationBatchLimit(file,{...amendment,newLimitMicros:20_000_001}),/Invalid amended/);
  assert.equal(JSON.parse(await readFile(file,'utf8')).batchAmendments,undefined);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('$100 total and batch amendment preserves spend and enforces the amended ceiling',async()=>{
 const {amendEvaluationTotalLimit}=await import('../scripts/evaluation-ledger.mjs');
 const dir=await mkdtemp(join(tmpdir(),'budget-100-')),file=join(dir,'ledger.json');
 try{
  initializeLedger(file);reserveEvaluationCall(file,reservation('one'));settleEvaluationCall(file,'one',500);
  const before=JSON.parse(await readFile(file,'utf8')).calls;assert.equal(evaluationBatchLimit(file,'same-batch'),5_000_000);
  assert.throws(()=>amendEvaluationTotalLimit(file,{expectedLimitMicros:20_000_000,newLimitMicros:100_000_000,reason:'',authorizationRef:''}),/authorization/);
  amendEvaluationTotalLimit(file,{expectedLimitMicros:20_000_000,newLimitMicros:100_000_000,reason:'User authorized $100',authorizationRef:'test'});
  amendEvaluationBatchLimit(file,{...amendment,newLimitMicros:100_000_000});
  assert.deepEqual(JSON.parse(await readFile(file,'utf8')).calls,before);
  assert.equal(evaluationSummary(file).limitMicros,100_000_000);
  assert.equal(evaluationSummary(file).knownMicros,500);
  reserveEvaluationCall(file,reservation('two',100_000_000));settleEvaluationCall(file,'two',700);
  assert.throws(()=>reserveEvaluationCall(file,{...reservation('excess',100_000_000),upperBoundMicros:100_000_000}),/budget unavailable/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
