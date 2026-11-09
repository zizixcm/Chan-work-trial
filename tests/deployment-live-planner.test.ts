import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { createLivePreparationPlanner } from '../scripts/preparation-live-planner';
import { initializeLedger,evaluationSummary } from '../scripts/evaluation-ledger.mjs';
import type { PlannerInput } from '../lib/preparation/actions';
test('live planner uses actual image parts and reserves before network; invalid action keeps accounted spend',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'planner-guard-test-')),ledger=path.join(dir,'ledger.json');initializeLedger(ledger);
 const imageBase64=(await sharp({create:{width:2,height:2,channels:3,background:'white'}}).png().toBuffer()).toString('base64');
 const original=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=async(input,init)=>{
   calls++;const request=new Request(input,init);const payload=await request.json();
   assert.equal(payload.model,'google/gemini-3.8-flash');
   assert.equal(payload.max_tokens,24000,'native investigator options reach the provider');
   assert.deepEqual(payload.reasoning,{effort:'low',exclude:true});
   assert.equal(payload.provider.max_price.completion,5);
   assert.equal(evaluationSummary(ledger).heldMicros,1200000,'hold must exist before network');
   assert.equal(payload.provider.max_price.prompt,1);assert.equal(payload.provider.allow_fallbacks,false);
   assert.equal(payload.messages[1].content[0].text.includes(imageBase64),false,'base64 is not serialized as plain text');
   assert(payload.messages[1].content.some((part:{type:string;image_url?:{url:string}})=>part.type==='image_url'&&part.image_url?.url===`data:image/png;base64,${imageBase64}`),JSON.stringify(payload.messages[1].content));
   const tool={id:'call-'+calls,type:'function',function:{name:calls===1?'inspect_document':'invented_action',arguments:JSON.stringify({documentId:'d1'})}};
   const meta={id:'synthetic-generation',object:'chat.completion',created:1,model:'google/gemini-3.8-flash'};
   if(payload.stream){const chunks=[{...meta,choices:[{index:0,delta:{role:'assistant',tool_calls:[{index:0,...tool}]},finish_reason:null}]},{...meta,choices:[{index:0,delta:{},finish_reason:'tool_calls'}],usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20,cost:.0003}}];return new Response(chunks.map(c=>'data: '+JSON.stringify(c)+'\n\n').join('')+'data: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});}
   return Response.json({...meta,choices:[{index:0,finish_reason:'tool_calls',message:{role:'assistant',content:null,tool_calls:[tool]}}],usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20,cost:.0003}});
  };
  const planner=createLivePreparationPlanner({ledger,scenario:'unit-only',apiKey:'synthetic-no-network'});
  const input:PlannerInput={objective:'understand_and_assess',inventory:{application:{borrowerName:'Synthetic LLC',propertyName:'Synthetic Court',address:'18 Synthetic Lane',transactionType:'Refinance'},documents:[{documentId:'d1',name:'source.pdf',contentType:'application/pdf',active:true}],requirements:[],pendingUploads:false},mappingProposals:[],observations:[{id:'o1',documentId:'d1',sha256:'a'.repeat(64),kind:'image',pageCount:1,pages:[{page:1,text:'',imageBase64}],limitations:[]}],assertions:[]};
  assert.equal(planner.maximumCallMicros,1200000);
  const result=await planner.decide(input,new AbortController().signal,async action=>({executed:action.kind}));assert.deepEqual(result.action,{kind:'inspect_document',documentId:'d1'});assert.equal(result.actualMicros,300);
  await assert.rejects(planner.decide(input,new AbortController().signal,async()=>({})));assert.equal(evaluationSummary(ledger).knownMicros,600);assert.equal(calls,2,'no hidden retry');
 }finally{globalThis.fetch=original;await rm(dir,{recursive:true,force:true});}
});
