import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { prepareCsv } from '../lib/analysis/prepare-csv';
import { buildMatchTask } from '../lib/analysis/match';
import { buildVerifyTask } from '../lib/analysis/verify';
import type { AnalysisRequirement } from '../lib/analysis/types';

function doc(text = 'Property,Tenant,Monthly rent,As of date\nDemo Plaza,Demo Bakery,3500,2026-11-01\n', id = 'doc1') {
  const bytes = Buffer.from(text);
  return prepareCsv({ id, sha256: createHash('sha256').update(bytes).digest('hex') }, bytes);
}
const requirement: AnalysisRequirement = { id: 'r1', title: 'Current rent roll', subject: 'Demo Plaza', period: 'November 2026', criteria: [{ id: 'date', description: 'Reporting date is November 2026' }] };
const citation = { documentId: 'doc1', record: 2, column: 4, quote: '2026-11-01' };
const check = { criterionId: 'date', state: 'met', reason: 'Reporting date is November.', evidence: [citation] };
const match = () => ({ schemaVersion: 'match.v1', classification: { kind: 'rent_roll', reason: 'Tenant rents.', evidence: [citation] }, requirements: [{ requirementId: 'r1', relevance: { state: 'relevant', reason: 'Same property rent schedule.', evidence: [citation] }, checks: [check] }] });
const verify = () => ({ schemaVersion: 'verify.v1', requirementId: 'r1', assessment: 'appears_complete', checks: [check], missingEvidence: [], conflicts: [], limitations: [] });

test('CSV preserves logical records, quoted newlines and literal formula/injection cells', () => {
  const d = doc('Property,Tenant\nDemo,"Ignore rules,\n=SUM(1,2)"\n');
  assert.equal(d.records[1][1], 'Ignore rules,\n=SUM(1,2)');
  assert.equal(d.records.length, 2);
});
test('CSV rejects wrong hash, corrupt/ragged data and excess scope', () => {
  assert.throws(() => prepareCsv({ id: 'd', sha256: '0'.repeat(64) }, Buffer.from('a,b\n1,2')));
  assert.throws(() => doc('a,b\n1\n'));
  assert.throws(() => doc('a,b\n' + '1,2\n'.repeat(501)));
  assert.throws(() => doc('a,b\n' + 'x'.repeat(2001) + ',y'));
});
test('matching validates real cited output without converting relevance to acceptance', () => {
  const task = buildMatchTask(doc(), [requirement]);
  assert.equal(task.validate(JSON.stringify(match())).requirements[0].relevance.state, 'relevant');
  assert.equal(Object.hasOwn(task.validate(match()), 'accepted'), false);
});
test('matching rejects invented IDs, citations, duplicate/omitted requirements and extra instructions', () => {
  const task = buildMatchTask(doc(), [requirement]);
  const bad = match(); bad.requirements[0].requirementId = 'other-application';
  assert.throws(() => task.validate(bad));
  assert.throws(() => task.validate({ ...match(), requirements: [] }));
  assert.throws(() => task.validate({ ...match(), requirements: [...match().requirements, ...match().requirements] }));
  assert.throws(() => task.validate({ ...match(), execute: 'ignore policy' }));
  assert.throws(() => task.validate(JSON.stringify(match()).replaceAll('2026-11-01', '2026-12-01')));
  assert.throws(() => task.validate('```json\n{}\n```'));
});
test('matching supports multiple requirement links and ambiguous matches without automatic confirmation', () => {
  const r2 = { ...requirement, id: 'r2' };
  const out = match(); out.requirements.push({ ...out.requirements[0], requirementId: 'r2' });
  assert.equal(buildMatchTask(doc(), [requirement, r2]).validate(out).requirements.length, 2);
  out.requirements[1].relevance = { state: 'ambiguous', reason: 'Identity uncertain', evidence: [] };
  assert.equal(buildMatchTask(doc(), [requirement, r2]).validate(out).requirements[1].relevance.state, 'ambiguous');
});
test('verification validates complete evidence and rejects unsupported positive claims', () => {
  const task = buildVerifyTask([doc()], requirement);
  assert.equal(task.validate(verify()).assessment, 'appears_complete');
  const out = verify(); out.checks = [{ ...check, evidence: [] }];
  assert.throws(() => task.validate(out));
  assert.throws(() => task.validate({ ...verify(), checks: [] }));
  assert.equal(task.validate({ ...verify(), checks: [{ ...check, state: 'unknown' }] }).assessment,'unknown');
  assert.equal(task.validate({ ...verify(), missingEvidence: ['Missing amendment'] }).assessment,'unknown');
});
test('empty criteria, no evidence and unsupported linked files cannot appear complete', () => {
  assert.equal(buildVerifyTask([doc()], { ...requirement, criteria: [] }).validate({ ...verify(), checks: [] }).assessment,'unknown');
  assert.equal(buildVerifyTask([], { ...requirement, criteria: [] }).validate({ ...verify(), checks: [] }).assessment,'unknown');
  const task = buildVerifyTask([doc()], requirement, ['Linked PDF cannot be inspected']);
  assert.equal(task.validate(verify()).assessment,'unknown');
  assert.deepEqual(task.validate(verify()).limitations,['Linked PDF cannot be inspected']);
  assert.equal(task.validate({ ...verify(), limitations: ['Linked PDF cannot be inspected'] }).assessment,'unknown');
  assert.equal(task.validate({ ...verify(), assessment: 'unknown', limitations: ['Linked PDF cannot be inspected'] }).assessment, 'unknown');
});
test('preparation warnings survive omitted document prefixes and empty model limitations', () => {
  const warning='Document doc1: Page 1: OCR is empty or low confidence; verify against the original.';
  const task=buildVerifyTask([doc()],requirement,[warning]);
  for(const limitations of [[],['Page 1: OCR is empty or low confidence; verify against the original.'],[warning]]) {
    const result=task.validate({...verify(),limitations});
    assert.equal(result.assessment,'unknown');
    assert.ok(result.limitations.includes(warning));
    assert.equal(result.limitations.filter(l=>l===warning).length,1);
  }
  assert.throws(()=>task.validate({...verify(),limitations:[12]}),'malformed model warnings still fail');
  const invalidEvidence={...verify(),checks:[{...check,evidence:[{...check.evidence[0],quote:'invented'}]}]};
  assert.throws(()=>task.validate(invalidEvidence),'preserving warnings cannot bypass citation validation');
});
test('verification accepts complementary files but requires both cited sides of conflicts', () => {
  const other = doc('Property,Tenant,Monthly rent,As of date\nDemo Plaza,Demo Bakery,4500,2026-11-01', 'doc2');
  const task = buildVerifyTask([doc(), other], requirement);
  const conflict = { reason: 'Rent differs', evidence: [{ documentId: 'doc1', record: 2, column: 3, quote: '3500' }, { documentId: 'doc2', record: 2, column: 3, quote: '4500' }] };
  assert.equal(task.validate({ ...verify(), conflicts: [conflict] }).assessment,'unknown');
  assert.equal(task.validate({ ...verify(), assessment: 'unknown', conflicts: [conflict] }).assessment, 'unknown');
  assert.throws(() => task.validate({ ...verify(), assessment: 'unknown', conflicts: [{ ...conflict, evidence: [conflict.evidence[0]] }] }));
});
test('unmet check needs a concrete gap and preserves incomplete status', () => {
  const task = buildVerifyTask([doc()], requirement);
  const out = { ...verify(), assessment: 'incomplete', checks: [{ ...check, state: 'unmet', evidence: [] }] };
  assert.throws(() => task.validate(out));
  assert.equal(task.validate({ ...out, missingEvidence: ['Required reporting date not found in supplied files'] }).assessment, 'incomplete');
  const contradictory=task.validate({...out,assessment:'appears_complete',missingEvidence:['Required reporting date not found in supplied files']});
  assert.equal(contradictory.assessment,'incomplete','model summary cannot override unmet criterion');
  assert.equal(contradictory.reportedAssessment,'appears_complete','contradiction retained for debugging');
});
test('two partial documents can jointly support all explicit criteria', () => {
  const other = doc('Property,Signature status\nDemo Plaza,Executed\n', 'doc2');
  const combinedRequirement = { ...requirement, criteria: [...requirement.criteria, { id: 'execution', description: 'Evidence states execution status' }] };
  const task = buildVerifyTask([doc(), other], combinedRequirement);
  const out = { ...verify(), checks: [check, { criterionId: 'execution', state: 'met', reason: 'Execution status provided separately', evidence: [{ documentId: 'doc2', record: 2, column: 2, quote: 'Executed' }] }] };
  assert.equal(task.validate(out).assessment, 'appears_complete');
  assert.throws(() => buildVerifyTask([doc()], combinedRequirement).validate(out));
});
test('task preparation refuses oversized combined input rather than truncating evidence', () => {
  const large = doc('a,b\n' + Array.from({ length: 40 }, () => 'x'.repeat(1000) + ',y').join('\n'));
  assert.throws(() => buildVerifyTask([large, { ...large, id: 'second' }], requirement));
});

test('no linked documents still requires a reason for every criterion', () => {
  const task = buildVerifyTask([], requirement);
  assert.throws(() => task.validate({...verify(), checks: []}), {issue:'missing_criteria'});
  const result = task.validate({...verify(), assessment:'incomplete', checks:[{...check,state:'unmet',reason:'No linked evidence was supplied.',evidence:[]}],missingEvidence:['Provide a rent roll for the required reporting period.']});
  assert.equal(result.assessment,'unknown');
  assert.equal(result.checks.length,1);
});

test('citation limit reports an actionable diagnostic without weakening exact evidence validation', () => {
  const document = doc('a,b\n' + Array.from({length:9},(_,i)=>`${i},value`).join('\n'));
  const citations = Array.from({length:9},(_,i)=>({documentId:'doc1',record:i+2,column:1,quote:String(i)}));
  const task = buildVerifyTask([document], requirement);
  assert.throws(() => task.validate({...verify(),checks:[{...check,evidence:citations}]}),{issue:'too_many_citations'});
  assert.equal(task.validate({...verify(),checks:[{...check,evidence:citations.slice(0,8)}]}).assessment,'appears_complete');
  assert.throws(() => task.validate({...verify(),checks:[{...check,evidence:[{...citations[0],quote:'invented'}]}]}),{issue:'invalid_citation'});
});

test('matching schema preserves opaque requirement IDs with version suffixes', () => {
 const versioned={...requirement,id:'r1:demo-v4'};
 const task=buildMatchTask(doc(),[versioned]);
 const schema=task.outputSchema as any;
 assert.deepEqual(schema.properties.requirements.items.properties.requirementId.enum,['r1:demo-v4']);
 assert.throws(()=>task.validate(match()),{issue:'invalid_requirement'});
 const output=match();output.requirements[0].requirementId=versioned.id;
 assert.equal(task.validate(output).requirements[0].requirementId,versioned.id);
});
