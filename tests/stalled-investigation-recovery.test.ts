import {sameRecoveryScope} from '../scripts/finalize-investigation-recovery';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertResumeLimits} from '../scripts/resume-repaired-investigations';
import {RECOVERY,confirmedCost,repairedBudget,redundantTurn} from '../scripts/recover-stalled-investigations';
const ref={traceId:RECOVERY.traceId,spanId:'span'},correlation={applicationId:RECOVERY.applicationId,userId:'borrower',investigationRunId:'run',stepId:'step'};
function trace(){return {traceId:RECOVERY.traceId,spans:[{...ref,name:'investigation-step',status:'success',endedAt:'2026-11-08T23:10:00Z',error:null,metadata:{...correlation,costKnown:true,actualMicros:1666}}]};}
test('recovery accepts only exact correlated, known provider costs',()=>{
 assert.equal(confirmedCost(trace(),ref,correlation,'investigation-step',600000),1666);
 const wrongActor=trace();wrongActor.spans[0].metadata.userId='another-borrower';
 assert.throws(()=>confirmedCost(wrongActor,ref,correlation,'investigation-step',600000),/correlation/);
 const unknown=trace();unknown.spans[0].metadata.costKnown=false;
 assert.throws(()=>confirmedCost(unknown,ref,correlation,'investigation-step',600000),/not confirmed/);
 const duplicate=trace();duplicate.spans.push(duplicate.spans[0]);
 assert.throws(()=>confirmedCost(duplicate,ref,correlation,'investigation-step',600000),/exactly one/);
 assert.throws(()=>confirmedCost(trace(),ref,correlation,'borrower-turn',600000),/not confirmed/);
 assert.throws(()=>confirmedCost(trace(),ref,correlation,'investigation-step',1000),/Invalid/);
});
test('reconciliation preserves $5 cap, charges actual costs, and releases only fully accounted reservations',()=>{
 const before={limitMicros:5000000,knownMicros:9967,reservedMicros:4200000,unknownCost:true};
 assert.deepEqual(repairedBudget(before,4200000,14485),{limitMicros:5000000,knownMicros:24452,reservedMicros:0,unknownCost:false});
 assert.equal(before.reservedMicros,4200000);
 assert.throws(()=>repairedBudget(before,1800000,5000),/Unaccounted/);
 assert.throws(()=>repairedBudget({...before,limitMicros:6000000},4200000,14485),/unchanged/);
 assert.throws(()=>repairedBudget({...before,knownMicros:4999999},4200000,14485),/exceed cap/);
});

test('retire only failed event reactions with matching investigation scope, preserving user intents',()=>{
 const event={eventId:'event-id',type:'run.needs_input',runId:'run',data:{reasonCode:'provider_outcome_unknown'}};
 const run={id:'run',request:{objective:'understand_and_assess',assessmentScope:'affected_requirements',documents:[{documentId:'doc'}],requirements:[{requirementId:'req'}]}};
 const turn={source_message_id:null,outcome:null,source_key:'retry:event:event-id:1234',state:'blocked',decision:{kind:'investigate',goal:'Determine which requested documents have been satisfied by the uploaded file.',documentIds:['doc'],requirementIds:['req']}};
 assert.equal(redundantTurn(turn,event,run),true);
 assert.equal(redundantTurn({...turn,source_message_id:'user-message'},event,run),false);
 assert.equal(redundantTurn({...turn,decision:{...turn.decision,requirementIds:['another-req']}},event,run),false);
 assert.equal(redundantTurn({...turn,decision:{...turn.decision,goal:'A different request'}},event,run),false);
 assert.equal(redundantTurn({...turn,source_key:'event:unrelated'},event,run),false);
 assert.equal(redundantTurn({...turn,decision:null,state:'superseded',reason_code:'context_changed'},event,run),true);
 assert.equal(redundantTurn({...turn,decision:null},event,run),false);
});

test('second resume preserves total call and spend bounds, and rejects unsettled cost',()=>{
 const budget={limitMicros:5000000,reservedMicros:0,unknownCost:false};
 assert.doesNotThrow(()=>assertResumeLimits(budget,5,10000));
 assert.throws(()=>assertResumeLimits(budget,24,10000),/budget exhausted/);
 assert.throws(()=>assertResumeLimits(budget,5,1400001),/budget exhausted/);
 assert.throws(()=>assertResumeLimits({...budget,unknownCost:true},5,10000),/fully settled/);
 assert.throws(()=>assertResumeLimits({...budget,reservedMicros:600000},5,10000),/fully settled/);
 assert.throws(()=>assertResumeLimits({...budget,limitMicros:6000000},5,10000),/unchanged/);
});

test('duplicate retirement requires reviewed intent and exact evidence/requirement/authority scope',()=>{
 const request={objective:'understand_and_assess',assessmentScope:'affected_requirements',documents:[{documentId:'doc',sha256:'sha'}],requirements:[{requirementId:'req',evidenceRevision:'1'}],snapshot:{inputFingerprint:'fingerprint'},authority:{actorUserId:'user',policyRevision:'explicit:1'}};
 const successor={id:RECOVERY.steps[2].runId,delegation_goal:'Determine which requested documents have been uploaded and what remains outstanding.',request};
 const old={id:RECOVERY.steps[0].runId,delegation_goal:'Determine which documents have been uploaded and if they satisfy any requirements.',request};
 assert.equal(sameRecoveryScope(old,successor),true);
 assert.equal(sameRecoveryScope({...old,delegation_goal:'A distinct request'},successor),false);
 assert.equal(sameRecoveryScope({...old,request:{...request,requirements:[]}},successor),false);
 assert.equal(sameRecoveryScope({...old,request:{...request,snapshot:{inputFingerprint:'stale'}}},successor),false);
 assert.equal(sameRecoveryScope({...old,request:{...request,authority:{...request.authority,actorUserId:'other'}}},successor),false);
});
