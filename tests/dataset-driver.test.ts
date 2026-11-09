import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {DATASET_CASES,loadDatasetCase,sha256} from '../lib/evaluation-observability/dataset';
import {scoreDatasetBoundary,semanticSubjects,observationDigest,semanticDimensions,type BoundaryObservation,type SemanticReview} from '../lib/evaluation-observability/dataset-scorers';
import {digest} from '../lib/preparation-pilot/contracts';

const root=resolve('datasets/borrower-e2e-v1');
test('all 12 admitted journeys and 4 overlays load with pinned sources and 54 boundaries',async()=>{
 let boundaries=0;
 for(const id of DATASET_CASES){const data=await loadDatasetCase(root,id);boundaries+=data.boundaries.length;
  for(const boundary of data.boundaries){assert.equal(boundary.findings.length,14);assert.ok(boundary.pendingIds.every(id=>!boundary.savedIds.includes(id)));}
 }
 assert.equal(boundaries,54);
 await assert.rejects(loadDatasetCase(root,'../D01' as any));
});

/** Authored scorer fixture only. These annotations are not an independent review
 * of agent behavior and must never be passed as a production reviewer. */
function fixtureReview(caseId:string,observation:BoundaryObservation):SemanticReview {
 return {caseId,boundaryId:observation.boundaryId,reviewerId:'test-fixture-only',independent:true,observationDigest:observationDigest(observation),
  judgments:semanticSubjects(observation).map(s=>({subjectId:s.id,subjectDigest:sha256(s.text),verdict:'pass',rationale:'Explicit synthetic positive control for scorer tests only',
   dimensions:Object.fromEntries(semanticDimensions.map(k=>[k,'pass'])) as any,criticalFailures:[],claims:[{start:0,end:s.text.length,text:s.text,judgment:'supported'}]}))};
}
test('native semantic scorer rejects missing/stale review, false states, irrelevant sources and fabricated quotes',async()=>{
 const data=await loadDatasetCase(root,'D01'),boundary=data.boundaries[2];
 const message=data.request.initialMessage;
 const observed:BoundaryObservation={boundaryId:boundary.id,activeIds:boundary.activeIds,pendingIds:[],messages:[{id:'reply',text:'The requested documentary evidence is supported. This is not loan approval.'}],borrowerMessages:[{id:'initial',text:message}],
  observations:[],reusedObservationIds:[],currentResultId:'result',runStates:['succeeded'],errors:[],unauthorizedEffects:[],budget:{limitMicros:100,knownMicros:1,reservedMicros:0,unknownCost:false},
  inspectedPages:boundary.activeIds.flatMap(id=>Array.from({length:data.documents.find(d=>d.documentId===id)!.pageCount},(_,i)=>({documentId:id,page:i+1}))),
  findings:boundary.findings.map(f=>({criterionId:f.criterionId,state:f.state,explanation:f.reason,gap:f.gap,citations:[
   ...f.supportGroups.map((g:any[])=>{const p=g[0],doc=data.documents.find(d=>d.documentId===p.documentId)!;return {...p,sha256:doc.sha256,quote:data.oracle.sourcePages[p.documentId][p.page-1].lines[0]};}),
   ...(f.assertionSupport?.length?[{messageId:'initial',messageDigest:digest(message),quote:message}]:[]),
  ]}))};
 const review=fixtureReview(data.id,observed);
 assert.equal((await scoreDatasetBoundary(data,boundary,observed,review)).passed,true);
 assert.equal((await scoreDatasetBoundary(data,boundary,observed)).reviewComplete,false);
 const changed=structuredClone(observed);changed.messages[0].text+=' Changed';
 assert.equal((await scoreDatasetBoundary(data,boundary,changed,review)).reviewComplete,false);
 const fake=structuredClone(observed);fake.findings[0].citations[0].quote='fabricated';
 assert.ok((await scoreDatasetBoundary(data,boundary,fake,fixtureReview(data.id,fake))).criticalFailures.some(f=>f.includes('fabricated')));
 const badReview=structuredClone(review);badReview.judgments[0].dimensions.entailment='fail';
 assert.equal((await scoreDatasetBoundary(data,boundary,observed,badReview)).passed,false);
 const partial=structuredClone(review);partial.judgments[0].claims=[];
 assert.equal((await scoreDatasetBoundary(data,boundary,observed,partial)).reviewComplete,false);
 const extra=structuredClone(review);extra.judgments.push(extra.judgments[0]);
 assert.equal((await scoreDatasetBoundary(data,boundary,observed,extra)).reviewComplete,false);
 const first=data.boundaries[0],wrong=structuredClone(observed);wrong.boundaryId=first.id;
 assert.ok((await scoreDatasetBoundary(data,first,wrong,fixtureReview(data.id,wrong))).criticalFailures.some(f=>f.includes('false_material_completion')));
});
