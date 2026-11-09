import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {replyMessagePrefix,createReplyStream} from '../lib/agents/reply-stream';
import {createBorrowerPreparationAgent} from '../lib/agents/definitions';
import {createEvaluationAgentTransport} from '../scripts/mastra-evaluation-transport';
import {initializeLedger,evaluationSummary} from '../scripts/evaluation-ledger.mjs';
const part=(type:string,payload:Record<string,unknown>)=>({type,payload});
test('prefix parser excludes nested messages and other arguments and handles split JSON escapes',()=>{
 assert.equal(replyMessagePrefix('{"goal":{"message":"PRIVATE"},"answerText":"SECRET","message":"Hello'), 'Hello');
 assert.equal(replyMessagePrefix('{"nested":[{"message":"PRIVATE"}],"message":"A\\nB\\uD83D'), 'A\nB');
 assert.equal(replyMessagePrefix('{"message":"A\\nB\\uD83D\\uDE00"}'), 'A\nB😀');
 assert.equal(replyMessagePrefix('{"answerText":"message: PRIVATE'),undefined);
 assert.equal(replyMessagePrefix('{"message":{"nested":"PRIVATE"}}'),undefined);
 assert.equal(replyMessagePrefix('{"goal":notJSON,"message":"PRIVATE"}'),undefined);
 assert.equal(replyMessagePrefix('{"message":"bad\\q'),undefined);
});
test('stream emits only one allowlisted tool top-level message, never reasoning/raw arguments/results',async()=>{
 const seen:string[]=[],emit=createReplyStream(async text=>{seen.push(text);});
 await emit(part('reasoning-delta',{toolCallId:'reason',toolName:'reply_to_borrower',argsTextDelta:'{"message":"PRIVATE"}'}));
 await emit(part('tool-call-delta',{toolCallId:'other',toolName:'read_evidence',argsTextDelta:'{"message":"PRIVATE"}'}));
 await emit(part('tool-call-input-streaming-start',{toolCallId:'one',toolName:'investigate_documents'}));
 for(const argsTextDelta of ['{"goal":"PRIVATE",','"documentIds":["PRIVATE"],','"message":"I’ll',' check',' your files"}'])await emit(part('tool-call-delta',{toolCallId:'one',argsTextDelta}));
 await emit(part('tool-call',{toolCallId:'one',toolName:'investigate_documents',args:{message:'I’ll check your files'}}));
 await emit(part('tool-result',{toolCallId:'one',toolName:'investigate_documents',args:{message:'PRIVATE'}}));
 await emit(part('tool-call',{toolCallId:'two',toolName:'reply_to_borrower',args:{message:'SECOND PRIVATE'}}));
 assert.deepEqual(seen,['I’ll','I’ll check','I’ll check your files']);
});
test('native Mastra stream yields borrower message before provider EOF and executes one durable tool',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'reply-stream-')),ledger=join(dir,'ledger.json');initializeLedger(ledger);
 let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});
 let first!:()=>void;const firstText=new Promise<void>(r=>{first=r;});
 let eof=false,calls=0,effects=0;const texts:string[]=[];
 const args=JSON.stringify({message:'Hello borrower'});
 const model={specificationVersion:'v2',provider:'offline',modelId:'streamed-tools',supportedUrls:{},
  async doGenerate(){throw Error('Must use stream, never a second generation');},
  async doStream(){calls++;return {stream:new ReadableStream({async start(c){
   c.enqueue({type:'stream-start',warnings:[]});
   c.enqueue({type:'tool-input-start',id:'one',toolName:'reply_to_borrower'});
   c.enqueue({type:'tool-input-delta',id:'one',delta:'{"message":"Hello'});
   await gate;
   c.enqueue({type:'tool-input-delta',id:'one',delta:' borrower"}'});
   c.enqueue({type:'tool-input-end',id:'one'});
   c.enqueue({type:'tool-call',toolCallId:'one',toolName:'reply_to_borrower',input:args});
   c.enqueue({type:'finish',finishReason:'tool-calls',usage:{inputTokens:1,outputTokens:2,totalTokens:3}});eof=true;c.close();
  }})};}};
 try{
  const agent=createBorrowerPreparationAgent({model:model as any,execute:async()=>{effects++;return {kind:'reply'};}});
  const transport=createEvaluationAgentTransport({ledger,scenario:'offline-stream',apiKey:'fake-no-network'});
  const running=transport.run(agent,'hello',AbortSignal.timeout(5000),{correlation:{},onReplyText:async text=>{texts.push(text);first();}});
  try{await Promise.race([firstText,new Promise((_,reject)=>setTimeout(()=>reject(Error('No incremental message before EOF')),1500))]);assert.equal(eof,false);}finally{release();}
  assert.deepEqual(await running,{actualMicros:0});assert.deepEqual(texts,['Hello','Hello borrower']);assert.equal(calls,1);assert.equal(effects,1);assert.equal(evaluationSummary(ledger).calls,0);
  let deliveries=0;
  assert.deepEqual(await transport.run(createBorrowerPreparationAgent({model:model as any,execute:async()=>{effects++;return {kind:'reply'};}}),'hello',AbortSignal.timeout(5000),{correlation:{},onReplyText:async()=>{deliveries++;throw Error('Draft persistence unavailable');}}),{actualMicros:0});
  assert.equal(deliveries,1,'failed optional draft delivery is disabled while the stream still drains');assert.equal(calls,2);assert.equal(effects,2,'durable tools still execute once per generation');
 }finally{release();await rm(dir,{recursive:true,force:true});}
});
test('stream terminal failure preserves confirmed provider cost; disconnect retains reservation',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'reply-cost-')),ledger=join(dir,'ledger.json');initializeLedger(ledger);
 const original=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=async(input,init)=>{
   const payload=await new Request(input,init).json();
   assert.equal(payload.model,'google/gemini-3.8-flash');
   assert.equal(payload.max_tokens,24000,'native borrower options reach the provider');
   assert.deepEqual(payload.reasoning,{effort:'low',exclude:true});
   assert.deepEqual(payload.provider,{allow_fallbacks:false,max_price:{prompt:1,completion:5}});
   calls++;assert.equal(evaluationSummary(ledger).heldMicros,1200000);
   if(calls===2)throw Error('offline disconnect');
   const meta={id:'offline',object:'chat.completion.chunk',created:1,model:'google/gemini-3.8-flash'};
   return new Response('data: '+JSON.stringify({...meta,choices:[{index:0,delta:{role:'assistant',tool_calls:[{index:0,id:'one',type:'function',function:{name:'reply_to_borrower',arguments:'{"message":"Incomplete'}}]},finish_reason:null}]})+'\n\ndata: '+JSON.stringify({...meta,choices:[{index:0,delta:{},finish_reason:'length'}],usage:{prompt_tokens:10,completion_tokens:20,total_tokens:30,cost:.0004}})+'\n\ndata: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});
  };
  const transport=createEvaluationAgentTransport({ledger,scenario:'offline-cost',apiKey:'fake-no-network'});
  const make=()=>createBorrowerPreparationAgent({model:transport.model,execute:async()=>({})});
  await assert.rejects(transport.run(make(),'hello',AbortSignal.timeout(5000)),(error:any)=>error.name==='AgentExecutionError'&&error.actualMicros===400);
  assert.equal(evaluationSummary(ledger).knownMicros,400);assert.equal(evaluationSummary(ledger).heldMicros,0);
  await assert.rejects(transport.run(make(),'hello',AbortSignal.timeout(5000)));
  assert.equal(evaluationSummary(ledger).heldMicros,1200000);assert.equal(calls,2,'no hidden retry or second generation');
 }finally{globalThis.fetch=original;await rm(dir,{recursive:true,force:true});}
});

test('ordinary Mastra text streams before EOF and commits through the borrower controller once',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'reply-text-')),ledger=join(dir,'ledger.json');initializeLedger(ledger);
 let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});let first!:()=>void;const seen=new Promise<void>(r=>{first=r;});
 let eof=false,calls=0,effects=0;const texts:string[]=[];
 const model={specificationVersion:'v2',provider:'offline',modelId:'streamed-text',supportedUrls:{},async doGenerate(){throw Error('No extra generation');},async doStream(options:any){calls++;assert.equal(options.toolChoice.type,'auto');return {stream:new ReadableStream({async start(c){
  c.enqueue({type:'stream-start',warnings:[]});c.enqueue({type:'text-start',id:'answer'});c.enqueue({type:'text-delta',id:'answer',delta:'Please upload'});await gate;
  c.enqueue({type:'text-delta',id:'answer',delta:' the rent roll.'});c.enqueue({type:'text-end',id:'answer'});c.enqueue({type:'finish',finishReason:'stop',usage:{inputTokens:1,outputTokens:2,totalTokens:3}});eof=true;c.close();
 }})};}};
 try{
  const {createMastraBorrowerPlanner}=await import('../lib/agents/runtime');
  const transport=createEvaluationAgentTransport({ledger,scenario:'offline-text',apiKey:'fake-no-network'});
  const running=createMastraBorrowerPlanner({...transport,model:model as any}).decide({},AbortSignal.timeout(5000),async action=>{effects++;assert.deepEqual(action,{kind:'reply',message:'Please upload the rent roll.'});return {};},{correlation:{},onReplyText:async text=>{texts.push(text);first();}});
  try{await Promise.race([seen,new Promise((_,reject)=>setTimeout(()=>reject(Error('No text before EOF')),1500))]);assert.equal(eof,false);assert.equal(effects,0);}finally{release();}
  const result=await running;assert.equal(result.actualMicros,0);assert.equal(calls,1);assert.equal(effects,1);assert.deepEqual(texts,['Please upload','Please upload the rent roll.']);
 }finally{release();await rm(dir,{recursive:true,force:true});}
});
test('tool selection withdraws provisional prose and never streams reasoning',async()=>{
 const texts:string[]=[],emit=createReplyStream(async text=>{texts.push(text);});
 await emit(part('text-delta',{text:'Provisional'}));await emit(part('reasoning-delta',{text:'PRIVATE'}));
 await emit(part('tool-call-input-streaming-start',{toolCallId:'one',toolName:'investigate_documents'}));
 await emit(part('text-delta',{text:'Ignored'}));await emit(part('tool-call',{toolCallId:'one',toolName:'investigate_documents',args:{message:'Reading leases.'}}));
 assert.deepEqual(texts,['Provisional','','Reading leases.']);
});

test('truncated or filtered ordinary text never reaches the durable reply handler',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'reply-incomplete-')),ledger=join(dir,'ledger.json');initializeLedger(ledger);
 try{
  const {createMastraBorrowerPlanner}=await import('../lib/agents/runtime');
  for(const finishReason of ['length','content-filter']){
   const model={specificationVersion:'v2',provider:'offline',modelId:'incomplete-text',supportedUrls:{},async doGenerate(){throw Error('No extra generation');},async doStream(){return {stream:new ReadableStream({start(c){
    c.enqueue({type:'stream-start',warnings:[]});c.enqueue({type:'text-start',id:'answer'});c.enqueue({type:'text-delta',id:'answer',delta:'Partial'});c.enqueue({type:'text-end',id:'answer'});c.enqueue({type:'finish',finishReason,usage:{inputTokens:1,outputTokens:2,totalTokens:3}});c.close();
   }})};}};
   let effects=0;const transport=createEvaluationAgentTransport({ledger,scenario:'offline-incomplete',apiKey:'fake-no-network'});
   await assert.rejects(createMastraBorrowerPlanner({...transport,model:model as any}).decide({},AbortSignal.timeout(5000),async()=>{effects++;return {};}),(error:any)=>error.name==='AgentExecutionError'&&error.actualMicros===0);
   assert.equal(effects,0);
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});
