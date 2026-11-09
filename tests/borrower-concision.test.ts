import test from 'node:test';
import assert from 'node:assert/strict';
import {borrowerConcisionCases,borrowerQualityDimensions,evaluateBorrowerConcision,scoreBorrowerConcision,type BorrowerQualityReview} from '../lib/evals/borrower-concision';
import {scriptedAgentTransport} from './fixtures/native-agent-model';

const reviewed=Object.fromEntries(borrowerQualityDimensions.map(key=>[key,{passed:true,evidence:'Unit-test reviewer receipt; not a live quality judgment.'}])) as BorrowerQualityReview;
test('concision gate rejects a verbose checklist even when its factual review passes',()=>{
 const score=scoreBorrowerConcision(borrowerConcisionCases[0],{kind:'reply',message:'No original lease has been provided. Upload the original lease. '.repeat(20)},reviewed);
 assert.equal(score.status,'failed');assert.equal(score.checks.find(c=>c.id==='concise')?.passed,false);
});
test('shortness cannot compensate for ignoring the question, inventing actions, unsupported claims or repetition',()=>{
 for(const dimension of borrowerQualityDimensions){
  const review={...reviewed,[dimension]:{passed:false,evidence:'Independent reviewer identified this failure.'}};
  assert.equal(scoreBorrowerConcision(borrowerConcisionCases[0],{kind:'reply',message:'Please upload all required documents.'},review).status,'failed');
 }
 assert.equal(scoreBorrowerConcision(borrowerConcisionCases[0],{kind:'reply',message:'Two files saved.'}).status,'needs_review');
 assert.equal(scoreBorrowerConcision(borrowerConcisionCases[0],{kind:'reply',message:'Two files saved.'},{...reviewed,grounded:{passed:true,evidence:''}}).status,'failed');
});
test('native evaluation exercises every case without leaking evaluator expectations',async()=>{
 const responses=[
  'You have 2 saved files: Rent roll.pdf and 2025 operating statement.pdf. Saved does not mean reviewed or approved.',
  'No files are saved yet. Next: upload the requested current rent roll.',
  'You have 2 saved files: Rent roll.pdf and 2025 operating statement.pdf. More uploads are pending; check upload history for unfinished entries.',
  'Yes—Rent roll.pdf is saved. Saving does not mean it has been reviewed or accepted.',
  'Your saved files are Rent roll.pdf and 2025 operating statement.pdf. Saving a file does not mean the lender has approved it.',
 ];
 for(const [index,fixture] of borrowerConcisionCases.entries()){
  let sawInput=false;
  const transport=scriptedAgentTransport('reply_to_borrower',{message:responses[index]},input=>{
   const text=JSON.stringify(input);sawInput=text.includes(fixture.question);
   assert(!text.includes(fixture.rubric));assert(!text.includes('maxWords'));
  });
  const result=await evaluateBorrowerConcision(fixture,transport,AbortSignal.timeout(10000));
  assert(sawInput);assert.equal(result.score.status,'needs_review','scripted wording is not evidence of model quality');
  assert.equal(scoreBorrowerConcision(fixture,result.action,reviewed).status,'passed');
 }
});
test('inventory-only questions fail if delegated instead of answered',()=>{
 assert.equal(scoreBorrowerConcision(borrowerConcisionCases[0],{kind:'investigate',message:'I will check.',goal:'Check uploads',requirementIds:[],documentIds:[]},reviewed).status,'failed');
});
