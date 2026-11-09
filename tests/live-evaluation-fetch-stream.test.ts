import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {guardedEvaluationFetch} from '../scripts/live-evaluation-fetch.mjs';
import {initializeLedger,evaluationSummary} from '../scripts/evaluation-ledger.mjs';
const encoder=new TextEncoder();
const request=()=>new Request('https://openrouter.ai/api/v1/chat/completions',{method:'POST',body:JSON.stringify({model:'google/gemini-3.8-flash',stream:true})});
for(const ending of ['usage','missing','error','cancel'] as const)test(`meter forwards first SSE bytes before EOF; settles ${ending} once`,async()=>{
 const dir=await mkdtemp(join(tmpdir(),'meter-stream-')),ledger=join(dir,'ledger.json');initializeLedger(ledger);
 let controller!:ReadableStreamDefaultController<Uint8Array>,canceled=false;
 const stream=new ReadableStream<Uint8Array>({start(c){controller=c;},cancel(){canceled=true;}});
 const guard=guardedEvaluationFetch(async()=>{assert.equal(evaluationSummary(ledger).heldMicros,1200000);return new Response(stream,{headers:{'content-type':'text/event-stream','x-test':'preserved'}});},{ledger,scenario:'offline'});
 let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
 try{
  const response=await guard(request());assert.equal(response.headers.get('x-test'),'preserved');reader=response.body!.getReader();
  controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"first"}}]}\r\n\r\n'));
  const first=await reader.read();assert.equal(first.done,false);assert.match(new TextDecoder().decode(first.value),/first/);assert.equal(evaluationSummary(ledger).heldMicros,1200000,'usage not yet known');
  if(ending==='usage'){
   // Final usage JSON split across arbitrary byte boundaries and CRLF.
   for(const piece of ['data: {"usage":','{"cost":0.0002}}\r','\n\r\ndata: [DONE]\r\n\r\n'])controller.enqueue(encoder.encode(piece));controller.close();
   while(!(await reader.read()).done){}
   await reader.cancel();assert.equal(evaluationSummary(ledger).knownMicros,200);assert.equal(evaluationSummary(ledger).heldMicros,0);
  }else if(ending==='cancel'){await reader.cancel();assert.equal(canceled,true);}
  else if(ending==='error'){controller.error(Error('synthetic disconnect'));await assert.rejects(reader.read(),/synthetic disconnect/);}
  else{controller.close();assert.equal((await reader.read()).done,true);}
  const entry=JSON.parse(await readFile(ledger,'utf8')).calls;assert.equal(entry.length,1);assert.equal(entry[0].status,ending==='usage'?'settled':'uncertain');
  if(ending!=='usage')assert.equal(evaluationSummary(ledger).heldMicros,1200000);
 }finally{try{await reader?.cancel();}catch{}await rm(dir,{recursive:true,force:true});}
});
test('non-stream responses retain usage accounting and bytes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'meter-json-')),ledger=join(dir,'ledger.json');initializeLedger(ledger);
 try{const guard=guardedEvaluationFetch(async()=>Response.json({usage:{cost:.0003},choices:[]}),{ledger,scenario:'offline'});const response=await guard(request());assert.equal((await response.json()).usage.cost,.0003);assert.equal(evaluationSummary(ledger).knownMicros,300);assert.equal(evaluationSummary(ledger).heldMicros,0);}finally{await rm(dir,{recursive:true,force:true});}
});
