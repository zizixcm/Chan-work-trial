import {missingReason} from '../lib/evals/reasons';
import test from 'node:test';
import assert from 'node:assert/strict';
import {completionCases,matchingCases,packageTask,scorePackage} from '../lib/evals/packages';
import {evaluationCases} from '../lib/evals/cases';
import type {VerifyResult} from '../lib/analysis/types';
import {validateTaskSize} from '../lib/backend/provider-executor';

test('each package family has a baseline and every unique required-evidence omission',()=>{
 for(const family of ['ytd','bank','tax','lease']){
  const full=completionCases.find(c=>c.id===family+'-full')!;assert(full);assert.equal(full.expectedFulfillment,'fulfilled');
  assert.equal(new Set(full.documents.map(d=>d.sha256)).size,full.requiredComponents!.length);
  for(let index=0;index<full.requiredComponents!.length;index++){
   const omitted=completionCases.find(c=>c.id===`${family}-missing-${index+1}`)!;assert(omitted);
   assert.equal(omitted.documents.length,full.documents.length-1);assert.equal(omitted.expectedFulfillment,'partially_fulfilled');
   assert.equal(omitted.missing?.length,1);assert(!omitted.documents.some(d=>d.sha256===full.documents[index].sha256));
  }
  assert.equal(completionCases.find(c=>c.id===family+'-redundant-copy')?.expectedFulfillment,'fulfilled');
  assert.equal(completionCases.find(c=>c.id===family+'-duplicate-cannot-replace-missing')?.expectedFulfillment,'partially_fulfilled');
 }
});
test('omission scorer rejects false completion, generic/negated reasons, and unrelated citations',()=>{
 const fixture=completionCases.find(c=>c.id==='ytd-missing-1')!,d=fixture.documents[0];
 const result:VerifyResult={schemaVersion:'verify.v1',requirementId:fixture.requirements[0].id,assessment:'incomplete',checks:[
  {criterionId:'component-1',state:'unmet',reason:'YTD income statement is missing.',evidence:[]},
  {criterionId:'component-2',state:'met',reason:'Balance sheet supplied.',evidence:[{documentId:d.id,record:3,column:2,quote:d.records[2][1]}]}],missingEvidence:['YTD income statement is missing.'],conflicts:[],limitations:[]};
 assert(scorePackage(fixture,packageTask(fixture).validate(result) as VerifyResult).passed);
 assert(!scorePackage(fixture,{...result,missingEvidence:['More documents are needed.']}).passed);
 assert(!scorePackage(fixture,{...result,missingEvidence:['YTD income statement is not missing.']}).passed);
 assert(!scorePackage(fixture,{...result,checks:result.checks.map(c=>({...c,state:'met'}))}).passed);
 assert(!scorePackage(fixture,{...result,checks:result.checks.map(c=>({...c,state:'unmet'}))}).passed);
 assert(!scorePackage(fixture,{...result,checks:[result.checks[0],{...result.checks[1],evidence:[{documentId:d.id,record:2,column:2,quote:d.records[1][1]}]}]}).passed,'document type alone cannot establish subject/period content');
});
test('fixtures do not leak expected labels or withheld source prose through prompts',()=>{
 for(const fixture of [...completionCases,...matchingCases]){
  const task=packageTask(fixture);validateTaskSize(task,{model:'google/gemini-2.5-flash',maxInputTokens:16000,maxOutputTokens:3000,timeoutMs:60000});
  assert(!task.prompt.includes('expectedFulfillment'));assert(!task.prompt.includes('suppliedComponents'));
  assert(!fixture.documents.some(d=>/missing|full|wrong-property/.test(d.id)));
 }
 const absent=completionCases.find(c=>c.id==='ytd-missing-1')!;
 assert(!packageTask(absent).prompt.includes('21000'),'withheld income figure is not a criterion answer');
 assert(!evaluationCases.some(c=>/missing|wrong|complete/.test(c.document.id)));
 assert.equal(evaluationCases.find(c=>c.id==='formula-not-amount')?.expected,'partially_fulfilled');
});


test('missing reason screen accepts useful paraphrases and sends ambiguous prose to review',()=>{
 assert.equal(missingReason('2023 tax return','Could not find the 2023 personal return.'),'specific');
 assert.equal(missingReason('account inventory','Please provide the account list.'),'specific');
 assert.equal(missingReason('YTD income statement','The profit and loss is missing.'),'specific');
 assert.equal(missingReason('balance sheet','The statement of financial position was not supplied.'),'specific');
 assert.equal(missingReason('CASH-1 March statement','CASH-1 March statement is missing.'),'specific');
 assert.equal(missingReason('balance sheet','The balance sheet is not missing.'),'review_required');
 assert.equal(missingReason('balance sheet','Additional information requested.'),'review_required');
});

test('mixed and negated explanations require semantic review',()=>{
 for(const [label,reason] of [['YTD income statement','The balance sheet is present; the YTD income statement is missing.'],['balance sheet','Need not provide the balance sheet.'],['balance sheet','The balance sheet supplied is complete; the income statement is missing.']])assert.equal(missingReason(label,reason),'review_required');
});

test('duplicate evidence can satisfy its own component but cannot substitute another',()=>{
 const f=completionCases.find(c=>c.id==='ytd-redundant-copy')!;
 const output:VerifyResult={schemaVersion:'verify.v1',requirementId:f.requirements[0].id,assessment:'appears_complete',checks:f.requirements[0].criteria.map((c,i)=>{const d=i===0?f.documents.at(-1)!:f.documents[i];return {criterionId:c.id,state:'met',reason:'Supplied',evidence:[{documentId:d.id,record:3,column:2,quote:d.records[2][1]}]};}),missingEvidence:[],conflicts:[],limitations:[]};
 assert(scorePackage(f,packageTask(f).validate(output) as VerifyResult).passed);
 const mutant=structuredClone(output);mutant.checks[1].evidence=mutant.checks[0].evidence;
 assert(!scorePackage(f,mutant).passed);
});

test('matching scorer rejects false met even with correct relevance',()=>{
 const f=matchingCases.find(c=>c.id==='wrong-property-no-link')!;
 const output:import('../lib/analysis/types').MatchResult={schemaVersion:'match.v1',classification:{kind:'rent_roll',reason:'Table',evidence:[{documentId:f.documents[0].id,record:2,column:2,quote:'Rent roll'}]},requirements:f.requirements.map(r=>({requirementId:r.id,relevance:{state:'not_relevant',reason:'Wrong subject',evidence:[]},checks:r.criteria.map(c=>({criterionId:c.id,state:'unmet',reason:'No matching evidence',evidence:[]}))}))};
 assert(scorePackage(f,packageTask(f).validate(output)).passed);
 const mutant=structuredClone(output);mutant.requirements[0].checks[0].state='met';mutant.requirements[0].checks[0].evidence=[{documentId:f.documents[0].id,record:3,column:2,quote:'Unrelated Tower'}];assert(!scorePackage(f,packageTask(f).validate(mutant)).passed);
});

test('conflict scorer accepts defensible uncertainty but rejects unsupported absence',async()=>{
 const {scoreSemantic}=await import('../lib/evals/score');
 const fixture=evaluationCases.find(c=>c.id==='conflicting-rents')!;
 const evidence=(quote:string)=>({documentId:fixture.document.id,record:quote==='9000'?3:2,column:quote==='Demo Plaza'?1:5,quote});
 const output:VerifyResult={schemaVersion:'verify.v1',requirementId:fixture.requirement.id,assessment:'unknown',checks:[{criterionId:'identity',state:'met',reason:'Identified',evidence:[evidence('Demo Plaza')]},{criterionId:'rent',state:'unknown',reason:'Conflicting totals',evidence:[]}],missingEvidence:[],conflicts:[{reason:'Two current totals',evidence:[evidence('5000'),evidence('9000')]}],limitations:[]};
 const {buildVerifyTask}=await import('../lib/analysis/verify');
 const validated=()=>buildVerifyTask([fixture.document],fixture.requirement).validate(output);
 assert(scoreSemantic(fixture,validated()).passed);
 output.checks[1].state='met';output.checks[1].evidence=[evidence('5000'),evidence('9000')];assert(scoreSemantic(fixture,validated()).passed);
 output.checks[1].state='unmet';output.missingEvidence=['The requested rent is missing.'];assert(!scoreSemantic(fixture,validated()).passed);
 output.checks[1].state='unknown';output.conflicts[0].evidence.pop();assert(!scoreSemantic(fixture,output).passed);
});
