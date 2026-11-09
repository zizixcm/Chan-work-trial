import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createScorer,runEvals} from '@mastra/core/evals';
import {createLocalMastraObservability} from '../lib/evaluation-observability';
import {createBorrowerPreparationAgent} from '../lib/agents/definitions';
import {nativeGenerateOptions} from '../lib/agents/runtime';
import {scriptedAgentTransport} from './fixtures/native-agent-model';
import {createRequiredChecksScorer,runNativeEvaluationCase} from '../lib/evaluation-observability/evals';

test('native Mastra tool, eval score, redacted trace, error and durable parent survive reopen',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'proximity-mastra-'));
 let observer=await createLocalMastraObservability({directory});
 try {
  let executed=0;
  const transport=scriptedAgentTransport('reply_to_borrower',{message:'PRIVATE_DOCUMENT_SENTINEL'});
  const agent=observer.attachAgent(createBorrowerPreparationAgent({model:transport.model,execute:async()=>{executed++;return {accepted:true};}}));
  const scorer=createScorer({id:'native-tool-effect',description:'Offline fixture requires exactly one native tool effect',type:'agent'})
   .generateScore(()=>executed===1?1:0);
  observer.mastra.addScorer(scorer);
  const operation=await observer.runOperation('borrower-turn',{borrowerTurnId:'turn-1',caseId:'offline-native',tier:'turn'},async({tracingOptions,tracingContext,recordUsage})=>{
   const result=await runEvals({target:observer.mastra.getAgent(agent.id),data:[{input:'PRIVATE_DOCUMENT_SENTINEL',tracingContext}],
    gates:[scorer],concurrency:1,targetOptions:{...nativeGenerateOptions,tracingOptions,tracingContext}});
   recordUsage(null);return result;
  });
  assert.equal(operation.value.verdict,'passed');assert.equal(operation.value.summary.totalItems,1);assert.equal(executed,1);
  await observer.recordScore(operation.trace,{scorerId:scorer.id,scorerVersion:'1',score:1});
  const trace=await observer.readTrace(operation.trace);
  assert.ok(trace&&trace.spans.length>=3);
  assert.ok(trace.spans.some(s=>s.parentSpanId===operation.trace.spanId));
  assert.ok(trace.spans.some(s=>s.spanType==='tool_call'));
  assert.ok(!JSON.stringify(trace).includes('PRIVATE_DOCUMENT_SENTINEL'));
  const root=trace.spans.find(s=>s.spanId===operation.trace.spanId)!;
  assert.equal(root.metadata?.costKnown,false);assert.equal(root.metadata?.actualMicros,undefined);
  const domain=await observer.mastra.getStorage()!.getStore('observability');
  const scores=await domain!.listScores({filters:{traceId:operation.trace.traceId}});
  assert.ok(JSON.stringify(scores).includes('native-tool-effect'));
  const studioStore=await observer.mastra.getStorage()!.getStore('scores');
  const studioScores=await studioStore!.listScoresBySpan({...operation.trace,pagination:{page:0,perPage:50}});
  assert.ok(JSON.stringify(studioScores).includes('native-tool-effect'));
  assert.ok(!JSON.stringify(studioScores).includes('PRIVATE_DOCUMENT_SENTINEL'));
  const metrics=await domain!.listMetrics({filters:{traceId:operation.trace.traceId}});
  assert.ok(JSON.stringify(metrics).includes('mastra_model_total_input_tokens'));
  assert.ok(!JSON.stringify(metrics).includes('PRIVATE_DOCUMENT_SENTINEL'));
  await observer.close();
  observer=await createLocalMastraObservability({directory});
  await assert.rejects(observer.runOperation('investigation-step',{investigationRunId:'run-1'},async()=>{
   throw Error('PRIVATE_ERROR_SENTINEL');
  },operation.trace),/PRIVATE_ERROR_SENTINEL/);
  const restored=await observer.readTrace(operation.trace);
  assert.ok(restored!.spans.some(s=>s.name==='investigation-step'&&s.parentSpanId===operation.trace.spanId));
  assert.ok(restored!.spans.some(s=>s.error));
  assert.ok(!JSON.stringify(restored).includes('PRIVATE_ERROR_SENTINEL'));
  await assert.rejects(observer.runOperation('task',{applicationId:'person@example.com'},async()=>null));
 }finally{await observer.close();await rm(directory,{recursive:true,force:true});}
});

test('required native scorer rejects omitted, duplicated, failed and incomplete checks',async()=>{
 const scorer=createRequiredChecksScorer(['citation','no-stale-result']);
 const checks=[{id:'citation',passed:true},{id:'no-stale-result',passed:true}];
 for(const output of [
  {caseId:'case-1',completed:true,checks:checks.slice(0,1)},
  {caseId:'case-1',completed:true,checks:[...checks,checks[0]]},
  {caseId:'case-1',completed:true,checks:[checks[0],{id:'no-stale-result',passed:false}]},
  {caseId:'case-1',completed:false,checks},
  {caseId:'case-2',completed:true,checks},
 ])assert.equal((await scorer.run({input:{caseId:'case-1'},output})).score,0);
 assert.equal((await scorer.run({input:{caseId:'case-1'},output:{caseId:'case-1',completed:true,checks}})).score,1);
});

test('native workflow harness records per-case failure instead of averaging or skipping',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'proximity-mastra-workflow-'));
 const observer=await createLocalMastraObservability({directory});
 try {
  const outcome=await runNativeEvaluationCase({observer,tier:'task',correlation:{caseId:'missing-check',evalRunId:'offline',datasetVersion:'v1'},
   requiredChecks:['citation'],evaluate:async caseId=>({caseId,completed:true,checks:[]})});
  assert.equal(outcome.value.passed,false);assert.equal(outcome.value.result.verdict,'failed');
  const trace=await observer.readTrace(outcome.trace);
  assert.ok(trace!.spans.some(span=>span.spanType==='workflow_run'&&span.parentSpanId===outcome.trace.spanId));
  let nextCaseRan=false;
  const second=await runNativeEvaluationCase({observer,tier:'task',correlation:{caseId:'next-case',evalRunId:'offline',datasetVersion:'v1'},
   requiredChecks:['different-check'],evaluate:async caseId=>{nextCaseRan=true;return {caseId,completed:true,checks:[{id:'different-check',passed:true}]};}});
  assert.equal(nextCaseRan,true);assert.equal(second.value.passed,true);
 }finally{await observer.close();await rm(directory,{recursive:true,force:true});}
});
