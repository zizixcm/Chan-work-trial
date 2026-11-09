import test from 'node:test';
import assert from 'node:assert/strict';
import {candidate,grade,improves,optimize,type Result,type Review} from '../lib/agent-optimization/core';
import {developmentCases,holdoutCases} from '../lib/agent-optimization/cases';
import {createMastraBorrowerPlanner} from '../lib/agents/runtime';
import {scriptedAgentTransport} from './fixtures/native-agent-model';
const pass={passed:true,reason:'Supported by fixture'};
const review:Review={grounded:pass,answersQuestion:pass,appropriateNextSteps:pass,noRepetition:pass,criticalFailures:[]};
function result(caseId:string,passed=true):Result{return {caseId,repeat:0,action:{kind:'reply',message:'Saved.'},review,wordCount:1,passed,hardPassed:true,costMicros:1,elapsedMs:1};}
test('critical failures reject a candidate even with better aggregate score',()=>{
 assert.equal(improves([result('a',false)],[{...result('a'),hardPassed:false}]),false);
 assert.equal(improves([result('a',false)],[result('b')]),false);
 assert.equal(improves([result('a',false)],[result('a')]),true);
 assert.equal(improves([result('a')],[result('a')]),false);
 assert.equal(grade(developmentCases[0],{kind:'reply',message:'Approved'}, {...review,criticalFailures:['approval_claim']}).passed,false);
});
test('candidate supplement changes digest and reaches real native model without replacing base',async()=>{
 let request:unknown;
 const transport=scriptedAgentTransport('reply_to_borrower',{message:'Saved.'},v=>{request=v;});
 await createMastraBorrowerPlanner(transport,'Unique supplement marker').decide({},AbortSignal.timeout(5000),async()=>({}));
 assert.match(JSON.stringify(request),/Unique supplement marker/);
 assert.match(JSON.stringify(request),/Do not delete files/);
 assert.notEqual(candidate('a','h').id,candidate('b','h').id);
});
test('optimizer freezes selection before holdout, never sends holdout to proposer, and rejects failing finalist',async()=>{
 const saved=new Map<string,any>();let proposed=false;
 const report=await optimize({development:developmentCases.slice(0,1),holdout:holdoutCases.slice(0,1),repeats:1,save:async(n,v)=>{saved.set(n,v);},propose:async(_b,rs)=>{assert.equal(rs[0].caseId,developmentCases[0].id);proposed=true;return [{hypothesis:'Improve clarity',supplement:'Be direct.'}];},evaluate:async(c,cases)=>{
  if(cases[0].id.startsWith('heldout')){assert.ok(proposed);assert.ok(saved.has('frozen-selection.json'));return [result(cases[0].id,false)];}
  return [result(cases[0].id,Boolean(c.supplement))];
 }});
 assert.equal(report.status,'candidate_rejected_on_holdout');assert.equal(report.selected.supplement,'');assert.equal(report.promoted,false);
});
test('missing repeated evaluations cannot yield a selected winner',async()=>{
 await assert.rejects(optimize({development:developmentCases.slice(0,1),holdout:holdoutCases.slice(0,1),repeats:2,save:async()=>{},propose:async()=>[],evaluate:async()=>[result(developmentCases[0].id)]}),/Incomplete evaluation coverage/);
});
test('review omissions and unsupported review status fail closed',()=>{
 assert.throws(()=>grade(developmentCases[0],{kind:'reply',message:'Saved.'},{} as Review));
 assert.equal(grade(developmentCases[0],{kind:'reply',message:'Files have not been reviewed.'},{...review,grounded:{passed:false,reason:'No actual review status provided'}}).passed,false);
});
test('production guidance distinguishes lender records from document investigation',async()=>{
 let request:unknown;
 await createMastraBorrowerPlanner(scriptedAgentTransport('reply_to_borrower',{message:'Saving does not establish approval.'},v=>{request=v;})).decide({},AbortSignal.timeout(5000),async()=>({}));
 const prompt=JSON.stringify(request);
 assert.match(prompt,/authoritative lender records/);
 assert.match(prompt,/Investigation findings and document completeness do not establish lender review or approval/);
});
