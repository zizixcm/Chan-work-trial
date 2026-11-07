import test from 'node:test';
import assert from 'node:assert/strict';
import {summarize,metricsCsv,type MetricRow} from '../lib/analysis-metrics/data';
import {metricsRequest} from '../lib/analysis-metrics/handler';
import {UploadError} from '../lib/validation';
const row:MetricRow={id:'j',applicationId:'a',task:'match_document.v1',state:'succeeded',model:'model',version:'v',attempts:2,providerAttempts:2,createdAt:'2026-11-07T00:00:00Z',updatedAt:'2026-11-07T00:00:10Z',safeCode:null,reservations:2,knownCostUsd:.01,unknownReservedUsd:.02,unknownUsageAttempts:1,inputTokens:100,outputTokens:20,events:[{event:'running',token:'1',at:'2026-11-07T00:00:02Z'},{event:'preparing',token:'1',at:'2026-11-07T00:00:02Z'},{event:'prepared',token:'1',at:'2026-11-07T00:00:03Z'},{event:'dispatch',token:'1',at:'2026-11-07T00:00:04Z'},{event:'responded',token:'1',at:'2026-11-07T00:00:09Z'}]};
test('metrics distinguish waiting, phase samples, pending jobs, retries and unknown charges',()=>{
 const s=summarize([row,{...row,id:'pending',state:'queued',providerAttempts:0,reservations:0,knownCostUsd:0,unknownReservedUsd:0,unknownUsageAttempts:0,events:[]}],Date.parse('2026-11-07T00:00:20Z'));
 assert.equal(s.queueWait.p50Ms,2000);assert.equal(s.preparation.p50Ms,1000);assert.equal(s.modelAndValidation.p50Ms,5000);assert.equal(s.terminalLatency.count,1);assert.equal(s.terminalLatency.p50Ms,10000);assert.equal(s.oldestPendingMs,20000);assert.equal(s.retriedJobs,1);assert.equal(s.unknownReservedUsd,.02);assert.equal(s.knownCostUsd,.01);
 assert.equal(summarize([]).preparation.p95Ms,null);
 assert.equal(summarize([{...row,events:[{event:'preparing',token:'1',at:row.createdAt},{event:'prepared',token:'2',at:row.updatedAt}]}]).preparation.count,0,'never pair phases across attempts');
});
test('exports defend spreadsheet formulas and do not export evidence',()=>{
 const csv=metricsCsv([{...row,applicationId:'=HYPERLINK("bad")'}]);assert(csv.includes("'=HYPERLINK"));assert(!csv.includes('events'));assert(csv.includes('unknownReservedUsd'));
});
test('metrics authorization precedes DB reads; invalid filters and downloads are handled safely',async()=>{
 let reads=0;
 const report={schemaVersion:'workflow-metrics.v1',generatedAt:new Date().toISOString(),filter:{days:7},totalMatchingJobs:1,exportedJobs:1,truncated:false,limit:2000,summary:summarize([row]),jobs:[row]};
 const deps={authorize:async()=>({id:'u'}),read:async()=>{reads++;return report;}};
 const denied=await metricsRequest(new Request('http://localhost:3001/api/internal/ai-workflows'),{...deps,authorize:async()=>{throw new UploadError('Forbidden',403);}});assert.equal(denied.status,403);assert.equal(reads,0);
 const invalid=await metricsRequest(new Request('http://localhost:3001/api/internal/ai-workflows?days=999'),deps);assert.equal(invalid.status,400);assert.equal(reads,0);
 const csv=await metricsRequest(new Request('http://localhost:3001/api/internal/ai-workflows?format=csv'),deps);assert.equal(csv.status,200);assert.match(csv.headers.get('content-disposition')!,/attachment/);assert.equal(csv.headers.get('cache-control'),'private, no-store');assert.equal(csv.headers.get('x-metrics-truncated'),'false');
 const json=await metricsRequest(new Request('http://localhost:3001/api/internal/ai-workflows?download=1'),deps);assert.equal((await json.json()).schemaVersion,'workflow-metrics.v1');
});
