import {validationDiagnosticSchema} from '../preparation/validation-diagnostics';
import {mkdir} from 'node:fs/promises';
import {isAbsolute, join} from 'node:path';
import type {Agent} from '@mastra/core/agent';
import {Mastra} from '@mastra/core/mastra';
import {MastraCompositeStore} from '@mastra/core/storage';
import {SpanType, type SpanOutputProcessor, type TracingOptions, type TracingContext} from '@mastra/core/observability';
import {DuckDBStore} from '@mastra/duckdb';
import {LibSQLStore} from '@mastra/libsql';
import {MastraStorageExporter, Observability} from '@mastra/observability';
import {z} from 'zod';

const opaque = z.string().regex(/^[A-Za-z0-9_.:-]{1,160}$/);
export const correlationSchema = z.strictObject({
 applicationId:opaque.optional(),userId:opaque.optional(),borrowerTurnId:opaque.optional(),
 uploadBatchId:opaque.optional(),investigationRunId:opaque.optional(),stepId:opaque.optional(),configurationDigest:opaque.optional(),
 evalRunId:opaque.optional(),caseId:opaque.optional(),datasetVersion:opaque.optional(),
 tier:z.enum(['turn','task','e2e','foundation']).optional(),evidenceRevision:opaque.optional(),resultId:opaque.optional(),
});
export type Correlation = z.infer<typeof correlationSchema>;
const traceSchema=z.strictObject({traceId:z.string().regex(/^[a-f0-9]{1,32}$/),spanId:z.string().regex(/^[a-f0-9]{1,16}$/)});
export type TraceRef=z.infer<typeof traceSchema>;
const operations=['borrower-turn','investigation-step','evidence-read','assessment','task','e2e'] as const;
export type Operation=typeof operations[number];
export interface OperationContext {trace:TraceRef;tracingOptions:TracingOptions;tracingContext:TracingContext;recordUsage:(actualMicros:number|null)=>void}

/** Never recursively retain arbitrary attributes: model messages and tool results
 * can contain documents, credentials or oracle data. Keep numeric usage only. */
function numericTree(value:unknown):unknown {
 if(typeof value==='number'&&Number.isFinite(value))return value;
 if(!value||typeof value!=='object'||Array.isArray(value))return undefined;
 return Object.fromEntries(Object.entries(value).flatMap(([key,item])=>{
  const safe=numericTree(item);return safe===undefined?[]:[[key,safe]];
 }));
}
export function metadataOnlyProcessor():SpanOutputProcessor {
 return {name:'proximity-metadata-only',async shutdown(){},process(span){
  if(!span)return span;
  span.input=undefined;span.output=undefined;span.requestContext=undefined;
  const metadata=span.metadata??{};
  const diagnostic=validationDiagnosticSchema.safeParse(metadata.validationDiagnostic);
  span.metadata={...correlationSchema.strip().parse(metadata),
   ...(diagnostic.success?{validationDiagnostic:diagnostic.data}:{}),
   ...(typeof metadata.actualMicros==='number'?{actualMicros:metadata.actualMicros}:{}),
   ...(typeof metadata.costKnown==='boolean'?{costKnown:metadata.costKnown}:{})};
  const attrs=span.attributes as Record<string,unknown>;
  const safe:Record<string,unknown>={};
  for(const key of ['usage','cost','usageDetails','tokenUsage'])if(attrs[key]!==undefined)safe[key]=numericTree(attrs[key]);
  for(const key of ['model','provider','toolId','toolName','finishReason']){
   const val=attrs[key];if(typeof val==='string'&&/^[A-Za-z0-9_.:/ -]{1,160}$/.test(val))safe[key]=val;
  }
  span.attributes=safe;
  if(span.errorInfo)span.errorInfo={message:'Operation failed (details withheld)',name:'OperationError'};
  return span;
 }};
}

/** Opt-in local storage only. One writer process per directory (DuckDB lock).
 * No provider calls, shared application migrations, or cloud exporters. */
export async function createLocalMastraObservability({directory}:{directory:string}) {
 if(!isAbsolute(directory))throw Error('Observability directory must be absolute');
 await mkdir(directory,{recursive:true,mode:0o700});
 const base=new LibSQLStore({id:'proximity-local-state',url:`file:${join(directory,'mastra.db')}`});
 const analytics=new DuckDBStore({id:'proximity-local-observability',path:join(directory,'observability.duckdb'),threads:1,memoryLimit:'256MB'});
 const storage=new MastraCompositeStore({id:'proximity-local',default:base,domains:{observability:analytics.observability}});
 const observability=new Observability({configs:{local:{serviceName:'proximity-document-processing',
  exporters:[new MastraStorageExporter()],spanOutputProcessors:[metadataOnlyProcessor()],logging:{enabled:false}}}});
 const mastra=new Mastra({storage,observability,logger:false});
 try {await storage.init();} catch(error){await Promise.allSettled([base.close(),analytics.close()]);throw error;}
 const instance=observability.getSelectedInstance({});
 if(!instance)throw Error('Local Mastra observability did not initialize');
 let closed=false;
 const assertOpen=()=>{if(closed)throw Error('Observability has closed');};
 return {
  mastra,
  attachAgent<T extends Agent>(agent:T):T {assertOpen();mastra.addAgent(agent);return agent;},
  async runOperation<T>(operation:Operation,correlation:Correlation,callback:(context:OperationContext)=>Promise<T>,parent?:TraceRef):Promise<{value:T;trace:TraceRef}>{
   assertOpen();z.enum(operations).parse(operation);
   const metadata=correlationSchema.parse(correlation),ancestor=parent?traceSchema.parse(parent):undefined;
   const span=instance.startSpan({name:operation,type:SpanType.GENERIC,metadata,
    ...(ancestor?{traceId:ancestor.traceId,parentSpanId:ancestor.spanId}:{})});
   const trace={traceId:span.traceId,spanId:span.id};
   const tracingOptions:TracingOptions={traceId:span.traceId,parentSpanId:span.id,nestUnderParent:true,metadata,hideInput:true,hideOutput:true};
   try {
    const value=await callback({trace,tracingOptions,tracingContext:{currentSpan:span},recordUsage(actualMicros){
     if(actualMicros!==null&&(!Number.isSafeInteger(actualMicros)||actualMicros<0))throw Error('Invalid cost');
     span.update({metadata:{...metadata,costKnown:actualMicros!==null,...(actualMicros===null?{}:{actualMicros})}});
    }});
    span.end();return {value,trace};
   }catch(error){span.error({error:new Error('Operation failed (details withheld)'),endSpan:true});throw error;}
  },
  async readTrace(ref:TraceRef){assertOpen();await observability.flush();return analytics.observability.getTrace({traceId:traceSchema.parse(ref).traceId});},
  async recordScore(ref:TraceRef,score:{scorerId:string;scorerVersion:string;score:number}){
   assertOpen();const anchor=traceSchema.parse(ref);
   const checked=z.strictObject({scorerId:opaque,scorerVersion:opaque,score:z.number().min(0).max(1)}).parse(score);
   // Studio's span Scores panel currently reads the legacy scores domain,
   // whereas analytics reads observability scores. Persist only opaque anchors
   // and numeric output in that compatibility projection, never case contents.
   const scores=await storage.getStore('scores');
   if(!scores)throw Error('Native Studio scores storage unavailable');
   await scores.saveScore({...anchor,scorerId:checked.scorerId,entityId:anchor.spanId,runId:anchor.traceId,
    input:{},output:{score:checked.score},score:checked.score,source:'TEST',
    scorer:{id:checked.scorerId,name:checked.scorerId,version:checked.scorerVersion},
    entity:{id:anchor.spanId,name:'Document processing evaluation'},metadata:{scorerVersion:checked.scorerVersion}});
   await observability.addScore({...anchor,score:{...checked,scoreSource:'automated'}});
  },
  async flush(){assertOpen();await observability.flush();},
  async close(){if(closed)return;closed=true;try{await observability.shutdown();}finally{await Promise.all([analytics.close(),base.close()]);}},
 };
}
export type LocalMastraObservability=Awaited<ReturnType<typeof createLocalMastraObservability>>;
