// Opt-in deployment preload. Wraps actual OpenRouter calls with the ONE live-test ledger.
// Usage: PREPARATION_EVALUATION_LEDGER=<existing ledger> PREPARATION_EVALUATION_SCENARIO=<id>
// node --import ./scripts/live-evaluation-fetch.mjs --import tsx <evaluation entry point>
import { randomUUID } from 'node:crypto';
import { reserveEvaluationCall, settleEvaluationCall } from './evaluation-ledger.mjs';
import {PILOT_MODEL} from '../lib/agents/pilot-model.mjs';
const MODEL=PILOT_MODEL.id;
/** @param {typeof fetch} upstream
 * @param {{ledger:string,scenario:string,configurationDigest?:string|null,batchId?:string,batchLimitMicros?:number}} options */
export function guardedEvaluationFetch(upstream,{ledger,scenario,configurationDigest=null,batchId,batchLimitMicros}) {
 if(!ledger||!scenario)throw new Error('Evaluation ledger and scenario are required');
 return async function(input,init) {
  const request=new Request(input,init);const url=new URL(request.url);
  if(url.hostname!=='openrouter.ai')return upstream(input,init);
  if(request.method==='GET')return upstream(input,init);
  if(url.protocol!=='https:'||url.pathname!=='/api/v1/chat/completions'||request.method!=='POST')throw new Error('Unapproved paid evaluation endpoint');
  const payload=await request.clone().json();
  if(payload.model!==MODEL||payload.plugins!==undefined||payload.models||payload.route||payload.web_search_options||payload.tools?.some(t=>t.type!=='function'))throw new Error('Unapproved model, streaming, plugin or routing');
  // The full multimodal context costs at most $1.048576, and 24k output
  // (including reasoning) at most $0.12. Reserve $1.20 before dispatch.
  if(PILOT_MODEL.contextTokens*PILOT_MODEL.promptPerMillion+PILOT_MODEL.outputTokens*PILOT_MODEL.completionPerMillion>=PILOT_MODEL.reservationMicros)throw new Error('Invalid full-context reservation');
  payload.provider={allow_fallbacks:false,max_price:{prompt:PILOT_MODEL.promptPerMillion,completion:PILOT_MODEL.completionPerMillion}};
  payload.max_tokens=Math.min(payload.max_tokens??PILOT_MODEL.outputTokens,PILOT_MODEL.outputTokens);
  if(!Number.isSafeInteger(payload.max_tokens)||payload.max_tokens<1)throw new Error('Invalid completion cap');
  delete payload.max_completion_tokens;delete payload.reasoning_effort;
  payload.reasoning={effort:PILOT_MODEL.reasoningEffort,exclude:true};
  payload.usage={include:true};
  if(Buffer.byteLength(JSON.stringify(payload),'utf8')>4_000_000)throw new Error('Evaluation request too large');
  const callId=randomUUID();reserveEvaluationCall(ledger,{callId,model:MODEL,upperBoundMicros:PILOT_MODEL.reservationMicros,scenario,configurationDigest,batchId,batchLimitMicros});
  let settled=false;
  const settle=actual=>{if(settled)return;settleEvaluationCall(ledger,callId,actual);settled=true;};
  try {
   const headers=new Headers(request.headers);headers.delete('content-length');
   const response=await upstream(new Request(request,{headers,body:JSON.stringify(payload)}));
   if((response.headers.get('content-type')||'').includes('text/event-stream')&&response.body){
    const reader=response.body.getReader(),decoder=new TextDecoder();
    let actual=null,line='',data=[],oversized=false;
    const event=()=>{try{const body=JSON.parse(data.join('\n')),cost=body.usage?.cost;
     if(typeof cost==='number'&&Number.isFinite(cost)&&cost>=0&&Number.isSafeInteger(Math.ceil(cost*1_000_000)))actual=Math.ceil(cost*1_000_000);
    }catch{}data=[];};
    const consume=text=>{for(const c of text){
     if(c==='\n'){
      const value=line.replace(/\r$/,'');
      if(!oversized){if(value==='')event();else if(value.startsWith('data:'))data.push(value.slice(5).replace(/^ /,''));}
      line='';oversized=false;
      if(data.reduce((n,v)=>n+v.length,0)>4_000_000)data=[];
     }else if(!oversized){line+=c;if(line.length>4_000_000){line='';data=[];oversized=true;}}
    }};
    // No clone/tee or eager body consumption: bytes flow under downstream
    // backpressure, and incomplete/cancelled streams retain unknown charges.
    const body=new ReadableStream({
     async pull(controller){try{
      const next=await reader.read();
      if(next.done){consume(decoder.decode());consume('\n\n');settle(actual);controller.close();return;}
      consume(decoder.decode(next.value,{stream:true}));controller.enqueue(next.value);
     }catch(error){settle(actual);controller.error(error);}},
     async cancel(reason){try{settle(actual);}finally{await reader.cancel(reason);}}
    });
    return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
   }
   let actual=null;
   try{const body=await response.clone().json(),cost=body.usage?.cost;if(typeof cost==='number'&&Number.isFinite(cost)&&cost>=0&&Number.isSafeInteger(Math.ceil(cost*1_000_000)))actual=Math.ceil(cost*1_000_000);}catch{}
   settle(actual);return response;
  } catch(error) {settle(null);throw error;}
 };
}
if(process.env.PREPARATION_EVALUATION_PRELOAD==='1'){
 globalThis.fetch=guardedEvaluationFetch(globalThis.fetch,{ledger:process.env.PREPARATION_EVALUATION_LEDGER,scenario:process.env.PREPARATION_EVALUATION_SCENARIO});
}
