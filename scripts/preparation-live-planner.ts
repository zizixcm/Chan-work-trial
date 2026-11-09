/** Opt-in live adapter. Both agents now use native Mastra tool calling. */
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {LocalMastraObservability} from '../lib/evaluation-observability';
import {createMastraInvestigationPlanner,withAgentObservability} from '../lib/agents/runtime';
import {createEvaluationAgentTransport} from './mastra-evaluation-transport';
export function createLivePreparationPlanner(options:{ledger:string;scenario:string;apiKey:string;observability?:LocalMastraObservability;batchId?:string;batchLimitMicros?:number}){
 const configurationDigest=createHash('sha256').update(JSON.stringify(['../lib/agents/pilot-model.mjs','../lib/agents/definitions.ts','../lib/agents/runtime.ts','../lib/preparation/actions.ts','../lib/preparation/worker.ts','../lib/preparation/evidence-tools.ts','./read-preparation-evidence.ts','./mastra-evaluation-transport.ts','./live-evaluation-fetch.mjs'].map(file=>createHash('sha256').update(readFileSync(new URL(file,import.meta.url))).digest('hex')))).digest('hex');
 const transport=createEvaluationAgentTransport({...options,configurationDigest});
 return createMastraInvestigationPlanner(options.observability?withAgentObservability(transport,options.observability):transport,configurationDigest);
}
