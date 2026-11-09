import type {AgentTransport} from '../../lib/agents/runtime';
import {nativeGenerateOptions} from '../../lib/agents/runtime';

/** Real Mastra loop + deterministic provider protocol; never calls a network. */
export function scriptedAgentTransport(toolName:string,input:Record<string,unknown>,onRequest?:(value:unknown)=>void):AgentTransport{
 const content={type:'tool-call',toolCallId:'offline-call',toolName,input:JSON.stringify(input)};
 const usage={inputTokens:1,outputTokens:1,totalTokens:2};
 const model={specificationVersion:'v2',provider:'offline',modelId:'scripted-tools',supportedUrls:{},
  async doGenerate(options:unknown){onRequest?.(options);return {content:[content],finishReason:'tool-calls',usage,warnings:[]};},
  async doStream(options:unknown){onRequest?.(options);return {stream:new ReadableStream({start(controller){controller.enqueue({type:'stream-start',warnings:[]});controller.enqueue(content);controller.enqueue({type:'finish',finishReason:'tool-calls',usage});controller.close();}})};}
 };
 return {model:model as any,async run(agent,messages,signal,execution){const result=await agent.generate(messages,{...nativeGenerateOptions,abortSignal:signal,tracingOptions:execution?.tracingOptions,tracingContext:execution?.tracingContext});if(result.error)throw result.error;return {actualMicros:1};}};
}
