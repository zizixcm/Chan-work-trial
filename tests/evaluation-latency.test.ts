import test from 'node:test';
import assert from 'node:assert/strict';
import {assessLatency,createQualityLatencyScorer,latencyBudgets,summarizeLatency,type LatencyReceipt} from '../lib/evaluation-observability/latency';
const input={caseId:'B01',budget:latencyBudgets.borrower};
const good:LatencyReceipt={caseId:'B01',source:'live',status:'completed',quality:'pass',timing:{clock:'monotonic',queueMs:500,firstUsefulMs:2000,completionMs:4000}};
test('quality and user-visible elapsed time must both pass; queue time counts',()=>{
 assert.equal(assessLatency(input,good).passed,true);
 assert.equal(assessLatency(input,{...good,quality:'fail'}).passed,false);
 assert.equal(assessLatency(input,{...good,quality:'pending'}).passed,false);
 assert.equal(assessLatency(input,{...good,timing:{...good.timing!,queueMs:18000,firstUsefulMs:19000,completionMs:21000}}).latencyPassed,false);
});
test('missing, misbound, offline and impossible timing cannot become a speed pass',()=>{
 for(const changed of [{timing:null},{caseId:'different'},{source:'offline' as const},{timing:{...good.timing!,firstUsefulMs:null}},{timing:{...good.timing!,firstUsefulMs:20000}}])assert.equal(assessLatency(input,{...good,...changed}).latencyPassed,null);
 for(const status of ['failed','timeout','blocked','cancelled'] as const)assert.equal(assessLatency(input,{...good,status}).passed,false);
});
test('investigation timing uses final result; fast progress alone is insufficient',()=>{
 assert.equal(assessLatency({caseId:'B01',budget:latencyBudgets.smallInvestigation},{...good,timing:{...good.timing!,completionMs:75747}}).latencyPassed,false);
 assert.equal(assessLatency({caseId:'B01',budget:latencyBudgets.smallInvestigation},{...good,timing:{...good.timing!,firstUsefulMs:null,completionMs:20000}}).passed,true);
});
test('native Mastra gate accepts reviewed fast result and rejects fast wrong result',async()=>{
 const scorer=createQualityLatencyScorer();
 assert.equal((await scorer.run({input,output:good})).score,1);
 assert.equal((await scorer.run({input,output:{...good,quality:'fail'}})).score,0);
 assert.equal((await scorer.run({input,output:{...good,timing:null}})).score,0);
});
test('small-sample summaries retain failures and do not claim p95 stability',()=>{
 const summary=summarizeLatency([good,{...good,status:'timeout',timing:null},{...good,source:'offline'}]);
 assert.deepEqual(summary,{attempts:2,nonCompleted:1,missingTimings:1,completedTimingSamples:1,p50Ms:4000,p95Ms:null,maxMs:4000});
});
