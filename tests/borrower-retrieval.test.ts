import {parseDelegationInput} from '../lib/borrower-chat/delegation';
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGroundedAnswer,parseRetrievalInput} from '../lib/borrower-chat/retrieval';
import type {GroundedContext,ContextRequirement} from '../lib/borrower-chat/contracts';
function fixture():GroundedContext {
  const requirement:ContextRequirement={id:'r',title:'Statement',purpose:'Confirm balance',period:'Current',owner:'Borrower',applicability:'Conditional',condition:'If requested',stage:'Closing',collection:'borrower',criteria:['Balance'],definitionRevision:'2',evidenceRevision:'3',documentIds:[],evidencePresence:'absent',lenderReview:null,
    source:{kind:'requirement',requirementId:'r',definitionRevision:'2',evidenceRevision:'3'},
    assessment:{state:'not_assessed',jobId:null,freshness:'not_assessed',source:null,checks:[],missingEvidence:[],conflicts:[],limitations:[]}};
  return {schemaVersion:'borrower-context.v1',revision:'rev1',application:{id:'a',borrowerName:'B',propertyName:'P',address:'A',transactionType:'Loan',requestedAmount:'1',lifecycle:null,revision:'1',contentRevision:'1'},
    loi:{reference:'LOI',state:'unavailable',document:null},submission:null,hasUnsentChanges:true,requirements:[requirement],documents:[],inventory:{complete:true,total:0},
    counts:{filesSaved:0,borrowerRequests:1,requestsWithFiles:0,checking:0,appearsComplete:0,incomplete:0,indeterminate:0,outdated:0},intake:{openBatches:0,unsavedMembers:0,pendingMatches:0}};
}
test('retrieval accepts only three explicit intents and rejects injected authority/sources',()=>{
  assert.equal(parseRetrievalInput({intent:'missing',clientMessageId:'m'}).intent,'missing');
  for(const value of [null,[],{intent:'__proto__',clientMessageId:'m'},{intent:'approve',clientMessageId:'m'},
    {intent:'missing',clientMessageId:'m',sources:['invented']},{intent:'uploaded',clientMessageId:'x'.repeat(101)}])assert.throws(()=>parseRetrievalInput(value),{status:400});
});
test('requested explains recorded criteria/conditions and excludes lender-owned request inventory',()=>{
  const context=fixture();context.requirements.push({...context.requirements[0],id:'l',title:'Private lender task',collection:'lender'});
  const answer=buildGroundedAnswer(context,'requested');
  assert.equal(answer.items.length,1);assert.match(JSON.stringify(answer.items),/If requested/);assert.match(JSON.stringify(answer.items),/Closing/);
  assert.doesNotMatch(JSON.stringify(answer),/Private lender task/);
  assert.equal(answer.sources[1].reference.kind,'requirement');
});
test('uploaded enumerates current files without treating save or association as approval',()=>{
  const context=fixture();context.documents=[{id:'d',name:'<script>literal.csv',contentType:'text/csv',sizeBytes:12,sha256:'a'.repeat(64),seriesId:'d',version:2,createdAt:'2026-11-07T00:00:00Z',requirementIds:[],source:{kind:'document',documentVersionId:'d',sha256:'a'.repeat(64)}}];
  const answer=buildGroundedAnswer(context,'uploaded');assert.equal(answer.items.length,1);
  assert.match(answer.items[0].lines.join(' '),/Not linked/);assert.match(answer.notes.join(' '),/does not mean checked/);
  assert.deepEqual(answer.sources[1].reference,context.documents[0].source);
});
test('missing never equates unlinked or pending evidence to a proven gap',()=>{
  const context=fixture();context.intake.pendingMatches=1;
  const answer=buildGroundedAnswer(context,'missing');
  assert.match(answer.items[0].lines.join(' '),/Check unlinked uploads/);
  assert.match(answer.items[0].lines.join(' '),/not determined yet/);
  assert.match(answer.notes.join(' '),/cannot establish that all evidence/);
});
test('pending, unavailable and stale assessments suppress historical claims and evidence',()=>{
  for(const state of ['checking','unavailable','outdated'] as const) {
    const context=fixture();Object.assign(context.requirements[0].assessment,{state,freshness:state==='outdated'?'stale':'current',
      checks:[{state:'unmet',reason:'OLD PRIVATE FINDING',citations:[]}],missingEvidence:['OLD PRIVATE FINDING']});
    const answer=buildGroundedAnswer(context,'missing');assert.doesNotMatch(JSON.stringify(answer),/OLD PRIVATE FINDING/);
    assert.equal(answer.sources.length,2);
  }
});
test('current findings cite assessment revisions and immutable evidence with real locators',()=>{
  const context=fixture();Object.assign(context.requirements[0].assessment,{state:'incomplete',freshness:'current',
    source:{kind:'assessment',assessmentId:'j',requirementId:'r',definitionRevision:'2',evidenceRevision:'3'},
    checks:[{criterionId:'r:criterion:1',state:'unmet',reason:'Period not covered',citations:[{documentVersionId:'d',sha256:'a'.repeat(64),record:2,column:1,quote:'January'}]}],missingEvidence:['February statement']});
  const answer=buildGroundedAnswer(context,'missing');
  assert.match(answer.items[0].lines.join(' '),/reports unmet criteria/);
  assert.match(answer.items[0].lines.join(' '),/The check reports: February statement/);
  assert.equal(answer.sources[2].reference.kind,'assessment');assert.equal(answer.sources[3].evidence?.record,2);
  assert.equal(answer.sources[3].evidence?.quote,'January');assert.doesNotMatch(JSON.stringify(answer),/evidenceArtifactId|pageNumber/);
  for(const id of answer.items[0].sourceIds)assert.ok(answer.sources.some(s=>s.id===id));
});
test('empty inventories disclose their scope without a readiness claim',()=>{
  const context=fixture();context.requirements=[];
  assert.match(buildGroundedAnswer(context,'uploaded').summary,/0 current saved files/);
  assert.match(buildGroundedAnswer(context,'missing').notes.join(' '),/does not establish application readiness/);
});

test('delegation selector cannot inject trusted authority or request readiness',()=>{
  const input={intent:'review_documents',clientMessageId:'review',expectedContextRevision:'a'.repeat(64)};
  assert.equal(parseDelegationInput(input).intent,'review_documents');
  for(const extra of [{authority:{actorUserId:'x'}},{inputFingerprint:'forged'},{intent:'assess_submission_readiness'},{requirementId:'r'}])
    assert.throws(()=>parseDelegationInput({...input,...extra}),{status:400});
  assert.throws(()=>parseDelegationInput({...input,intent:'investigate_gap'}),{status:400});
});

test('upload answer eval: answers inventory succinctly, with conditional next steps and no gap checklist',()=>{
  for(const count of [0,2,30])for(const pending of [false,true]){
    const context=fixture();context.intake.unsavedMembers=pending?1:0;
    context.documents=Array.from({length:count},(_,i)=>({id:`d${i}`,name:`Statement-${i}.pdf`,contentType:'application/pdf',sizeBytes:12,sha256:'a'.repeat(64),seriesId:`d${i}`,version:1,createdAt:'2026-11-07T00:00:00Z',requirementIds:['r'],source:{kind:'document' as const,documentVersionId:`d${i}`,sha256:'a'.repeat(64)}}));
    const answer=buildGroundedAnswer(context,'uploaded');
    const visible=[answer.summary,...answer.notes,...answer.items.flatMap(item=>[item.title,...item.lines])].join(' ');
    assert.match(answer.summary,new RegExp(`^${count} current saved files`));
    assert.deepEqual(answer.items.map(item=>item.title),context.documents.map(d=>d.name),'brevity must not hide requested files');
    assert(visible.split(/\s+/).length<=40+count*8,'one compact entry per file, not repeated metadata/disclaimers');
    assert.equal((visible.match(/does not mean checked or accepted/g)??[]).length,1);
    assert.doesNotMatch(visible,/Incomplete|Reported gap|Your next step|SHA-256|Saved 2026/);
    if(pending)assert.match(visible,/Check upload history/);
    else if(count===0)assert.match(visible,/Next: upload/);
    else assert.doesNotMatch(visible,/Next:|upload the|Check upload history/,'do not manufacture work');
  }
});
