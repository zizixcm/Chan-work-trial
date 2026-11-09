import {createScorer} from '@mastra/core/evals';
import {z} from 'zod';
import {runNativeEvaluationCase} from './evals';
import type {Correlation,LocalMastraObservability,OperationContext} from './index';

// Evaluator-owned normalized evidence, not a production event contract or model input.
// The adapter must derive this from persisted events, spans and browser observations.
export const batchStages=['identified','readability','requirement-relevance','document-checks'] as const;
const ms=z.number().finite().nonnegative();
const id=z.string().min(1);
export const batchQualityChecks=[
 'file_identity','readability_grounded','mapping_grounded','document_errors_grounded',
 'all_files_covered','all_requirements_covered','saved_not_missing','unknown_not_fulfilled',
 'partial_not_complete','no_internal_ids','no_approval_claim','citations_valid','completed_requirement_checkmark',
] as const;
export const batchInputSchema=z.object({caseId:id,batchId:id,documentIds:z.array(id).min(2),
 maxParallel:z.number().int().min(2),reportCeilingMs:ms.positive(),requireBrowser:z.boolean()});
export const batchReceiptSchema=z.object({caseId:id,batchId:id,source:z.enum(['offline','live']),
 clock:z.literal('monotonic'),traceId:id,
 delegations:z.array(z.object({documentIds:z.array(id),atMs:ms})),
 files:z.array(z.object({documentId:id,filename:id,startedMs:ms,terminalMs:ms,
  execution:z.array(z.object({spanId:id,kind:z.enum(['local','provider']),startedMs:ms,endedMs:ms})),
  stages:z.array(z.object({stage:z.enum(batchStages),status:z.enum(['completed','blocked']),
   persistedMs:ms,visibleMs:ms.nullable(),evidenceRefs:z.array(id)}))})),
 assessments:z.array(z.object({startedMs:ms,completedMs:ms,documentIds:z.array(id)})),
 finalReplyMs:ms.nullable(),receiptVisibleMs:ms.nullable(),
 browser:z.object({reconnectRestored:z.boolean(),noDuplicateRows:z.boolean(),noFalseSuccess:z.boolean()}).nullable(),
 review:z.object({provenance:z.literal('evaluator'),status:z.enum(['pending','complete']),
  checks:z.array(z.object({id:z.enum(batchQualityChecks),passed:z.boolean()}))}),
});
export type BatchInput=z.infer<typeof batchInputSchema>;
export type BatchReceipt=z.infer<typeof batchReceiptSchema>;
const sameIds=(a:string[],b:string[])=>a.length===b.length&&new Set(a).size===a.length&&a.every(x=>b.includes(x));

export function assessBatchUpload(input:BatchInput,receipt:BatchReceipt){
 const issues:string[]=[];
 const fail=(condition:boolean,reason:string)=>{if(condition)issues.push(reason);};
 fail(receipt.caseId!==input.caseId||receipt.batchId!==input.batchId,'binding');
 fail(new Set(input.documentIds).size!==input.documentIds.length,'duplicate_expected_file');
 fail(receipt.delegations.length!==1||!sameIds(receipt.delegations[0]?.documentIds??[],input.documentIds),'one_bulk_delegation');
 fail(!sameIds(receipt.files.map(f=>f.documentId),input.documentIds),'file_coverage');
 const delegation=receipt.delegations[0]?.atMs??Infinity;
 const edges:Array<{at:number;delta:number}>=[];
 for(const f of receipt.files){
  fail(f.startedMs<delegation||f.terminalMs<f.startedMs,`file_interval:${f.documentId}`);
  let priorExecutionEnd=f.startedMs;
  fail(!f.execution.length,`missing_execution:${f.documentId}`);
  for(const span of [...f.execution].sort((a,b)=>a.startedMs-b.startedMs)){
   fail(span.startedMs<priorExecutionEnd||span.endedMs<=span.startedMs||span.endedMs>f.terminalMs,`execution_interval:${f.documentId}`);
   priorExecutionEnd=span.endedMs;
   edges.push({at:span.startedMs,delta:1},{at:span.endedMs,delta:-1});
  }
  fail(f.stages.length!==batchStages.length||new Set(f.stages.map(s=>s.stage)).size!==batchStages.length,`stage_coverage:${f.documentId}`);
  let prior=f.startedMs,priorVisible=-1;
  for(const stage of batchStages){
   const s=f.stages.find(s=>s.stage===stage);if(!s)continue;
   fail(s.persistedMs<prior||s.persistedMs>f.terminalMs,`stage_order:${f.documentId}:${stage}`);
   fail(s.evidenceRefs.length===0,`missing_evidence:${f.documentId}:${stage}`);
   prior=s.persistedMs;
   if(input.requireBrowser){
    fail(s.visibleMs===null||s.visibleMs<s.persistedMs||s.visibleMs<priorVisible||s.visibleMs> (receipt.finalReplyMs??-1),`stage_visibility:${f.documentId}:${stage}`);
    if(s.visibleMs!==null)priorVisible=s.visibleMs;
   }
  }
 }
 let active=0,peak=0;
 // End before start at equal timestamps: adjacent work is not parallel.
 for(const e of edges.sort((a,b)=>a.at-b.at||a.delta-b.delta)){active+=e.delta;peak=Math.max(peak,active);}
 fail(peak<2,'no_parallel_file_work');fail(peak>input.maxParallel,'parallel_limit');
 const assessment=receipt.assessments[0],lastFile=Math.max(...receipt.files.map(f=>f.terminalMs));
 fail(receipt.assessments.length!==1,'one_batch_assessment');
 fail(!assessment||!sameIds(assessment.documentIds,input.documentIds)||assessment.startedMs<lastFile||assessment.completedMs<assessment.startedMs,'assessment_barrier');
 fail(receipt.finalReplyMs===null||!assessment||receipt.finalReplyMs<assessment.completedMs,'final_reply_order');
 if(input.requireBrowser){
  fail(receipt.receiptVisibleMs===null||receipt.receiptVisibleMs>1000,'upload_receipt_latency');
  fail(!receipt.browser||!Object.values(receipt.browser).every(Boolean),'browser_projection');
  fail(!receipt.files.some(f=>f.stages.some(s=>s.visibleMs!==null&&s.visibleMs<lastFile)),'no_progress_before_batch_complete');
 }
 const quality=receipt.review;
 fail(quality.status!=='complete'||quality.checks.length!==batchQualityChecks.length||new Set(quality.checks.map(c=>c.id)).size!==batchQualityChecks.length||!batchQualityChecks.every(k=>quality.checks.some(c=>c.id===k&&c.passed)),'semantic_review');
 const latencyPassed=receipt.source==='live'&&receipt.finalReplyMs!==null&&receipt.finalReplyMs<=input.reportCeilingMs;
 return {structuralAndQualityPassed:issues.length===0,latencyPassed,peakParallel:peak,
  passed:issues.length===0&&latencyPassed,issues};
}

/** Native Mastra scorer. Offline traces can test the contract, never certify live latency. */
export function createBatchUploadScorer(){
 return createScorer({id:'batch-upload-sequential-parallel',description:'Bulk delegation, ordered per-file evidence, parallel work, final assessment barrier, reviewed quality and latency',
  type:{input:batchInputSchema,output:batchReceiptSchema}}).generateScore(({run})=>{
   const input=batchInputSchema.safeParse(run.input),receipt=batchReceiptSchema.safeParse(run.output);
   return input.success&&receipt.success&&assessBatchUpload(input.data,receipt.data).passed?1:0;
  });
}

/** The production adapter supplies observed evidence, never a scripted live pass.
 * This uses the same native Workflow/runEvals and original-trace score storage
 * as the existing journey driver. No provider calls or credentials are implicit. */
export async function runNativeBatchUploadEvaluation(options:{
 observer:LocalMastraObservability;
 correlation:Correlation&{caseId:string;evalRunId:string;datasetVersion:string};
 input:BatchInput;
 evaluate:(context:OperationContext)=>Promise<BatchReceipt>;
}){
 batchInputSchema.parse(options.input);
 if(options.input.caseId!==options.correlation.caseId)throw Error('Batch evaluation case binding mismatch');
 const scorer=createBatchUploadScorer();options.observer.mastra.addScorer(scorer);
 return runNativeEvaluationCase({observer:options.observer,correlation:options.correlation,tier:'e2e',
  requiredChecks:['batch_structure_and_quality','live_latency'],
  evaluate:async(caseId,context)=>{
   const receipt=batchReceiptSchema.parse(await options.evaluate(context));
   if(receipt.traceId!==context.trace.traceId)throw Error('Batch receipt must reference this native evaluation trace');
   const verdict=assessBatchUpload(options.input,receipt);
   const score=await scorer.run({input:options.input,output:receipt});
   await options.observer.recordScore(context.trace,{scorerId:scorer.id,scorerVersion:'batch-upload.1',score:score.score??0});
   return {caseId,completed:receipt.finalReplyMs!==null,checks:[
    {id:'batch_structure_and_quality',passed:verdict.structuralAndQualityPassed},
    {id:'live_latency',passed:verdict.latencyPassed},
   ]};
  }});
}
