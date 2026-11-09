/** Explicitly invoked isolated worker only. This does not activate any provider. */
import {guardedEvaluationFetch} from './live-evaluation-fetch.mjs';
import {PILOT_MODEL} from '../lib/agents/pilot-model.mjs';
import {AgentExecutionError} from '../lib/agents/execution-error';
import {createReplyStream} from '../lib/agents/reply-stream';
import {evaluationSummary} from './evaluation-ledger.mjs';
import {nativeGenerateOptions,type AgentTransport} from '../lib/agents/runtime';
let generating=false;
export function createEvaluationAgentTransport(options:{ledger:string;scenario:string;apiKey:string;configurationDigest?:string;batchId?:string;batchLimitMicros?:number}):AgentTransport{
 if(!options.apiKey.trim())throw Error('Provider credential unavailable');
 if(process.env.PREPARATION_EVALUATION_PRELOAD==='1')throw Error('Do not combine transport and preload guards');
 return {model:{id:PILOT_MODEL.nativeId,apiKey:options.apiKey,api:'chat'},async run(agent,messages,signal,execution){
  if(generating)throw Error('Evaluation transport is sequential; another generation is active');
  const original=globalThis.fetch,before=evaluationSummary(options.ledger);
  const actualCost=()=>{const after=evaluationSummary(options.ledger);return after.heldMicros===before.heldMicros?after.knownMicros-before.knownMicros:null;};
  generating=true;
  try{
   globalThis.fetch=guardedEvaluationFetch(original,options);
   const borrower=agent.id==='borrower-preparation';
   const result=await agent.stream(messages,{...nativeGenerateOptions,...(borrower?{toolChoice:'auto' as const}:{}),abortSignal:signal,tracingOptions:execution?.tracingOptions,tracingContext:execution?.tracingContext});
   const emit=agent.id==='borrower-preparation'&&execution?.onReplyText?createReplyStream(execution.onReplyText):undefined;
   // Keep draining after a draft-delivery failure so usage is reconciled and
   // the authoritative tool result is not lost to an optional UI callback.
   let draftDeliveryFailed=false,sawTool=false,textLength=0;const started=Date.now();
   for await(const chunk of result.fullStream){
    if(['tool-call-input-streaming-start','tool-call-delta','tool-call'].includes(chunk.type))sawTool=true;
    if(chunk.type==='text-delta')textLength+=chunk.payload.text.length;
    if(borrower&&process.env.BORROWER_STREAM_TIMING==='1'&&['text-delta','tool-call','finish'].includes(chunk.type))console.info(JSON.stringify({event:'borrower-stream-timing',type:chunk.type,elapsedMs:Date.now()-started,textLength}));
    if(emit&&!draftDeliveryFailed)try{await emit(chunk);}catch{draftDeliveryFailed=true;}
   }
   const finishReason=await result.finishReason;
   if(signal.aborted||result.error||result.tripwire||!['stop','tool-calls'].includes(finishReason??''))throw Error('Agent generation incomplete');
   const replyText=borrower&&!sawTool&&finishReason==='stop'?await result.text:undefined;
   return {actualMicros:actualCost(),...(replyText?{replyText}:{})};
  }catch(error){
   const actual=actualCost();
   if(actual!==null)throw new AgentExecutionError('invalid_model_output',actual,error);
   throw error;
  }finally{globalThis.fetch=original;generating=false;}
 }};
}
