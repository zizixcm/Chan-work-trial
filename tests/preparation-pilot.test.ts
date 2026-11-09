import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { buildFixture } from './fixtures/preparation-pilot/fixture';
import { facts,gold } from './fixtures/preparation-pilot/oracle';
import { simulatedActions,simulatedResult } from './fixtures/preparation-pilot/simulation';
import { digest,readiness,validateAction,validateResult,type Observation } from '../lib/preparation-pilot/contracts';
import { applicationEventSchema,compareRevisions,legacyAssessment,processingRequestSchema,processingResultSchema } from '../lib/preparation/protocol';
const fixture=buildFixture();
test('PREP-01 bytes, independent fact locators, duplicate identity and long/scan variants',async()=>{
 const f=await fixture;
 assert.deepEqual(f.bytes.get('d04'),f.bytes.get('d14'));assert.deepEqual(f.bytes.get('d07'),f.bytes.get('d15'));assert.notDeepEqual(f.bytes.get('d07'),f.bytes.get('d19'));
 assert.equal((await PDFDocument.load(f.bytes.get('d17')!)).getPageCount(),48);
 for(const atom of Object.values(facts)){const source=f.checkpoints[3].sources.find(s=>s.id===atom.source)!;assert.ok(source.pages[atom.page].includes(atom.quote));}
 assert.equal(f.checkpoints[0].sources.find(s=>s.id==='d01')?.historical,true);
 const again=await buildFixture(); for(const [id,bytes] of f.bytes)assert.deepEqual(bytes,again.bytes.get(id),`deterministic ${id}`);
});
test('C0–C5 simulated ledger matches independent oracle; no fixed tool ordering',async()=>{
 const f=await fixture;
 for(const [index,snapshot] of f.checkpoints.entries()) {
  const actions=simulatedActions(snapshot); const observations:Observation[]=[];
  // Read actions may be reordered without changing the settled finding contract.
  for(const a of actions.slice(0,-1).reverse()) {const action=validateAction(a,snapshot,observations);if(action.kind==='read_pages')observations.push({actionId:digest(action),sourceId:action.sourceId,pages:action.pages,sha256:snapshot.sources.find(s=>s.id===action.sourceId)!.sha256});}
  const result=validateResult(simulatedResult(snapshot),snapshot,observations);
  assert.equal(readiness(snapshot,result),gold[index].readiness);
  for(const state of ['unmet','unknown'] as const)assert.deepEqual(result.findings.filter(f=>f.state===state).map(f=>f.criterionId).sort(),[...gold[index][state]].sort());
  assert.deepEqual(result.findings.filter(f=>f.state==='lender_pending').map(f=>f.criterionId).sort(),[...gold[index].pending].sort());
  assert.deepEqual(result.findings.filter(f=>f.state==='later_stage').map(f=>f.criterionId),['R6.insurance']);
  assert.equal(new Set(result.findings.map(f=>f.criterionId.split('.')[0])).size,6);
 }
});
test('citation, complete-ledger, removal and unknown policy guardrails',async()=>{
 const checkpoints=(await fixture).checkpoints, snapshot=checkpoints[3],result=simulatedResult(snapshot);
 const observations=snapshot.sources.map(s=>({actionId:s.id,sourceId:s.id,sha256:s.sha256,pages:Object.keys(s.pages).map(Number)}));
 assert.throws(()=>validateResult(result,snapshot,[]),/Uninspected/);
 const incomplete=structuredClone(result);incomplete.findings.pop();assert.throws(()=>validateResult(incomplete,snapshot,observations),/Incomplete/);
 const invented=structuredClone(result);invented.findings[0].citations[0].quote='invented';assert.throws(()=>validateResult(invented,snapshot,observations),/Unsupported/);
 assert.throws(()=>validateResult(result,checkpoints[4],observations),/Unsupported/);
 assert.equal(readiness({...snapshot,policyId:null},result),'undetermined');
 const uncertain=structuredClone(result);uncertain.findings.find(f=>f.criterionId==='R5.execution')!.state='unknown';assert.equal(readiness(snapshot,uncertain),'undetermined');
 assert.throws(()=>validateAction({kind:'read_pages',sourceId:'outside',pages:[1]},snapshot,observations));
});
test('shared protocol distinguishes revisions, invalidation and readiness scope',()=>{
 assert.equal(compareRevisions('10','9'),1);assert.equal(compareRevisions('9007199254740993','9007199254740992'),1);assert.throws(()=>compareRevisions('01','1'));
 assert.equal(legacyAssessment('indeterminate'),'unknown');assert.throws(()=>legacyAssessment('checking'));
 const invalidation={schemaVersion:'preparation-invalidation.v1',type:'application.preparation_invalidated',eventId:'e',applicationId:'a',cursor:'opaque',occurredAt:'2026-07-31T00:00:00Z',preparationId:'p',preparationRevision:'2',affectedResultRefs:[{id:'r',revision:'1'}],affectedRequirementIds:[],reasonCode:'evidence_changed'};
 assert.ok(applicationEventSchema.safeParse(invalidation).success);assert.ok(!applicationEventSchema.safeParse({...invalidation,runId:'private'}).success);
 const event={schemaVersion:'processing-event.v1',type:'run.result_committed',eventId:'e',applicationId:'a',cursor:'opaque',occurredAt:'2026-07-31T00:00:00Z',runId:'r',runRevision:'2',artifactId:null,inputFingerprint:'a'.repeat(64),state:'succeeded',data:{terminal:true,resultId:'result',resultRevision:'1',coverageRef:{id:'coverage',revision:'1'}}};
 assert.ok(applicationEventSchema.safeParse(event).success);assert.ok(!applicationEventSchema.safeParse({...event,data:{...event.data,terminal:false}}).success);
 assert.ok(!processingRequestSchema.safeParse({schemaVersion:'processing-request.v1',snapshot:{contentRevision:'1'}}).success);
 assert.ok(!processingResultSchema.safeParse({assessmentScope:'affected_requirements',readiness:{submissionReadiness:'appears_ready'}}).success);
});
