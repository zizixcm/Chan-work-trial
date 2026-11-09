import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMessageInput, parseMessagePage, type ContextDocument } from '../lib/borrower-chat/contracts';
import { projectAssessment } from '../lib/borrower-chat/context';
import type { jobDTO } from '../lib/jobs/core';

const document: ContextDocument = {id:'d',name:'roll.csv',contentType:'text/csv',sizeBytes:12,sha256:'a'.repeat(64),
  seriesId:'d',version:1,createdAt:'2026-11-07T00:00:00.000Z',requirementIds:['r'],source:{kind:'document',documentVersionId:'d',sha256:'a'.repeat(64)}};
const requirement = {id:'r',criteria:['Rent amounts'],definitionRevision:'2',evidenceRevision:'3',documentIds:['d']};
function job(overrides: Record<string, unknown> = {}) {
  return {id:'j',task:'verify_requirement.v1',requirementId:'r',state:'succeeded',freshness:'current',result:{
    schemaVersion:'verify.v1',requirementId:'r',assessment:'appears_complete',
    checks:[{criterionId:'r:criterion:1',state:'met',reason:'Amount present',evidence:[{documentId:'d',record:2,column:1,quote:'1200'}]}],
    missingEvidence:[],conflicts:[],limitations:[],privateField:'never exposed'},...overrides} as Awaited<ReturnType<typeof jobDTO>>;
}
test('message accepts literal text but rejects identity injection and oversized input', () => {
  assert.deepEqual(parseMessageInput({clientMessageId:'msg-1',text:'  What is missing?  '}),{clientMessageId:'msg-1',text:'  What is missing?  '});
  for (const input of [null,[],{clientMessageId:'id',text:' '},{clientMessageId:'id',text:'x',role:'assistant'},
    {clientMessageId:'id',text:'\0'}, {clientMessageId:'id',text:'😀'.repeat(4001)}, {clientMessageId:'bad id',text:'x'}]) {
    assert.throws(()=>parseMessageInput(input),{status:400});
  }
});
test('message cursor preserves bigint precision and enforces bounded pages', () => {
  assert.deepEqual(parseMessagePage(new URLSearchParams('after=9007199254740993&limit=100')),{after:'9007199254740993',limit:100});
  for (const query of ['limit=0','limit=101','after=-1','after=1.2','after=9223372036854775808','after=01'])
    assert.throws(()=>parseMessagePage(new URLSearchParams(query)),{status:400});
});
test('saved evidence without an assessment is not complete', () => {
  assert.equal(projectAssessment(requirement,[document],undefined,false).state,'not_assessed');
});
test('current positive assessment exposes only scoped citations and allowlisted fields', () => {
  const actual=projectAssessment(requirement,[document],job(),false);
  assert.equal(actual.state,'appears_complete');
  assert.equal(actual.checks[0].citations[0].sha256,document.sha256);
  assert.equal(actual.source?.evidenceRevision,'3');
  assert.doesNotMatch(JSON.stringify(actual),/privateField/);
});
test('stale, pending and failed checks cannot leak old findings as current', () => {
  for (const [overrides,state] of [[{freshness:'stale'},'outdated'],[{state:'running'},'checking'],[{state:'blocked'},'unavailable']] as const) {
    const actual=projectAssessment(requirement,[document],job(overrides),false);
    assert.equal(actual.state,state);assert.deepEqual(actual.checks,[]);assert.equal(actual.source,null);
  }
});
test('coverage uncertainty overrides an optimistic summary', () => {
  assert.equal(projectAssessment(requirement,[document],job(),true).state,'indeterminate');
  for (const change of [{limitations:['Unreadable page']},{conflicts:[{reason:'Conflicting amount',evidence:[]}]},
    {missingEvidence:['Missing period']},{checks:[{criterionId:'r:criterion:1',state:'unknown',reason:'Unknown',evidence:[]}]}]) {
    const j=job();j.result={...j.result,...change};
    assert.equal(projectAssessment(requirement,[document],j,false).state,'indeterminate');
  }
});
test('known unmet checks stay incomplete, distinct from technical uncertainty', () => {
  const j=job();j.result.checks=[{criterionId:'r:criterion:1',state:'unmet',reason:'Required amount absent',evidence:[]}];
  assert.equal(projectAssessment(requirement,[document],j,false).state,'incomplete');
});
test('malformed, incomplete criterion coverage or cross-file references fail closed', () => {
  for (const change of [{requirementId:'other'}, {checks:[]}, {checks:[{criterionId:'r:criterion:1',state:'met',reason:'x',evidence:[]}]},
    {checks:[{criterionId:'r:criterion:1',state:'met',reason:'x',evidence:[{documentId:'other-app-doc',record:1,column:1,quote:'private'}]}]}]) {
    const j=job();j.result={...j.result,...change};
    const actual=projectAssessment(requirement,[document],j,false);
    assert.equal(actual.state,'indeterminate');assert.deepEqual(actual.checks,[]);
  }
});
