import {AgentExecutionError} from './execution-error';
import type {AgentExecutionContext} from './execution';
import type {LocalMastraObservability} from '../evaluation-observability';
import type {Agent,AgentConfig} from '@mastra/core/agent';
import type {PlannerInput,PlannerAction,PreparationPlanner} from '../preparation/actions';
import {createBorrowerPreparationAgent,createDocumentInvestigationAgent,AGENT_LIMITS,borrowerActionSchema,type BorrowerAction} from './definitions';

export interface AgentTransport {
 model?:AgentConfig['model'];
 /** Must reserve shared spend before generation, settle provider usage afterwards,
  * and retain the reservation if outcome/cost is unknown. Offline tests inject a model. */
 run(agent:Agent,messages:Parameters<Agent['generate']>[0],signal:AbortSignal,execution?:AgentExecutionContext):Promise<{actualMicros:number|null;replyText?:string}>;
}
export const nativeGenerateOptions={maxSteps:1,toolChoice:'required' as const,maxProcessorRetries:0,modelSettings:{temperature:0,maxOutputTokens:AGENT_LIMITS.maxOutputTokens,maxRetries:0}};

/** Tools own operational decisions. Borrower prose can only become a validated
 * reply through the same authorized handler; it is never parsed into an operation. */
async function call<A>(factory:(execute:(action:A)=>Promise<unknown>)=>Agent,transport:AgentTransport,input:Parameters<Agent['generate']>[0],signal:AbortSignal,execute:(action:A)=>Promise<unknown>,execution?:AgentExecutionContext,replyAction?:(text:string)=>A){
 let selected:A|undefined,failure:unknown;
 const agent=factory(async action=>{selected=action;try{return await execute(action);}catch(error){failure=error;throw error;}});
 let cost:{actualMicros:number|null;replyText?:string};
 try{cost=await transport.run(agent,input,signal,execution);}catch(error){
  if(failure)throw new AgentExecutionError('tool_or_validation_limit',error instanceof AgentExecutionError?error.actualMicros:null,failure);
  throw error;
 }
 if(failure)throw new AgentExecutionError('tool_or_validation_limit',cost.actualMicros,failure);
 if(!selected&&replyAction&&cost.replyText?.trim()){
  try{selected=replyAction(cost.replyText);await execute(selected);}catch(error){throw new AgentExecutionError('tool_or_validation_limit',cost.actualMicros,error);}
 }
 if(!selected)throw new AgentExecutionError('invalid_model_output',cost.actualMicros,Error('Agent did not execute a native tool'));
 return {action:selected,...cost,executed:true};
}
export function createMastraInvestigationPlanner(transport:AgentTransport,configurationDigest?:string):PreparationPlanner{
 return {maximumCallMicros:AGENT_LIMITS.maximumCallMicros,configurationDigest,async decide(input:PlannerInput,signal,execute,execution){
  if(!execute)throw Error('Durable investigation tool handler required');
  const observations=input.observations.map(o=>({...o,pages:o.pages.map(({imageBase64,...p})=>({...p,...(imageBase64?{imageAttached:true}:{})}))}));
  const content:any[]=[{type:'text',text:JSON.stringify({...input,observations})}];
  for(const observation of input.observations)for(const page of observation.pages)if(page.imageBase64){content.push({type:'text',text:`Observation ${observation.id}, document ${observation.documentId}, unit ${page.page}, sha256 ${observation.sha256}`},{type:'image',mediaType:'image/png',image:`data:image/png;base64,${page.imageBase64}`});}
  return call<PlannerAction>(execute=>createDocumentInvestigationAgent({model:transport.model,execute}),transport,[{role:'user',content}],signal,execute,execution);
 }};
}
export function createMastraBorrowerPlanner(transport:AgentTransport,borrowerInstructionSupplement?:string){
 return {maximumCallMicros:AGENT_LIMITS.maximumCallMicros,async decide(input:unknown,signal:AbortSignal,execute:(action:BorrowerAction)=>Promise<unknown>,execution?:AgentExecutionContext){
  return call<BorrowerAction>(execute=>createBorrowerPreparationAgent({model:transport.model,execute,borrowerInstructionSupplement}),transport,JSON.stringify(input),signal,execute,execution,text=>borrowerActionSchema.parse({kind:'reply',message:text}));
 }};
}

/** Decorate the existing metered transport; never generate outside it. */
export function withAgentObservability(transport:AgentTransport,observability:LocalMastraObservability):AgentTransport {
 return {...transport,async run(agent,messages,signal,execution){
  observability.attachAgent(agent);
  const result=await observability.runOperation(agent.id==='borrower-preparation'?'borrower-turn':'investigation-step',execution?.correlation??{},async context=>{
   await execution?.recordTrace?.(context.trace);
   const value=await transport.run(agent,messages,signal,{...execution,correlation:execution?.correlation??{},tracingOptions:context.tracingOptions,tracingContext:context.tracingContext});
   context.recordUsage(value.actualMicros);return value;
  },execution?.parent);
  return result.value;
 }};
}
