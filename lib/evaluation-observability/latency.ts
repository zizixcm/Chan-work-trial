import {createScorer} from '@mastra/core/evals';
import {z} from 'zod';

/** Engineering targets, not measured service guarantees. Start at accepted work,
 * include queue delay, and exclude only human time BETWEEN separate requests. */
export const latencyBudgets={
 borrower:{completionMs:5_000,firstUsefulMs:3_000},
 smallInvestigation:{completionMs:20_000},
 ordinaryInvestigation:{completionMs:120_000},
 longOrScannedInvestigation:{completionMs:180_000},
} as const;
const milliseconds=z.number().finite().nonnegative();
export const latencyInputSchema=z.object({caseId:z.string().min(1),budget:z.object({completionMs:milliseconds.positive(),firstUsefulMs:milliseconds.positive().optional()})});
export const latencyReceiptSchema=z.object({
 caseId:z.string().min(1),source:z.enum(['live','offline']),
 status:z.enum(['completed','failed','timeout','blocked','cancelled']),
 quality:z.enum(['pass','fail','pending']),
 // All elapsed times use the same monotonic clock, relative to acceptance.
 timing:z.object({clock:z.literal('monotonic'),queueMs:milliseconds,completionMs:milliseconds,firstUsefulMs:milliseconds.nullable()}).nullable(),
});
export type LatencyReceipt=z.infer<typeof latencyReceiptSchema>;
export type LatencyInput=z.infer<typeof latencyInputSchema>;
export function assessLatency(input:LatencyInput,receipt:LatencyReceipt){
 const issues:string[]=[];
 if(receipt.caseId!==input.caseId)issues.push('case_binding');
 if(receipt.source!=='live')issues.push('offline_not_live_latency');
 if(receipt.status!=='completed')issues.push(`terminal_${receipt.status}`);
 const t=receipt.timing;
 if(!t)issues.push('missing_timing');
 else{
  if(t.queueMs>t.completionMs||t.firstUsefulMs!==null&&(t.firstUsefulMs<t.queueMs||t.firstUsefulMs>t.completionMs))issues.push('invalid_timing_order');
  if(input.budget.firstUsefulMs!==undefined&&t.firstUsefulMs===null)issues.push('missing_first_useful_timing');
 }
 const measured=issues.length===0;
 const latencyPassed=measured?!!t&&t.completionMs<=input.budget.completionMs&&(input.budget.firstUsefulMs===undefined||t.firstUsefulMs!<=input.budget.firstUsefulMs):null;
 if(latencyPassed===false)issues.push('latency_budget_exceeded');
 return {latencyPassed,quality:receipt.quality,passed:latencyPassed===true&&receipt.quality==='pass',issues};
}

/** Native Mastra gate: speed alone cannot pass a wrong, unreviewed or incomplete
 * result. Deterministic and makes no judge/provider calls. */
export function createQualityLatencyScorer(){
 return createScorer({id:'document-quality-and-latency',description:'Reviewed quality and measured user-visible latency must both pass',
  type:{input:latencyInputSchema,output:latencyReceiptSchema}}).generateScore(({run})=>{
   const input=latencyInputSchema.safeParse(run.input),receipt=latencyReceiptSchema.safeParse(run.output);
   return input.success&&receipt.success&&assessLatency(input.data,receipt.data).passed?1:0;
  });
}

/** Describe small samples honestly. Always expose failures/missing timings;
 * never present a percentile of successful runs as reliability of all runs. */
export function summarizeLatency(receipts:LatencyReceipt[]){
 const live=receipts.filter(r=>r.source==='live');
 const samples=live.filter(r=>r.status==='completed'&&r.timing&&r.timing.queueMs<=r.timing.completionMs).map(r=>r.timing!.completionMs).sort((a,b)=>a-b);
 const percentile=(q:number)=>samples.length?samples[Math.max(0,Math.ceil(q*samples.length)-1)]:null;
 return {attempts:live.length,nonCompleted:live.filter(r=>r.status!=='completed').length,missingTimings:live.filter(r=>!r.timing).length,
  completedTimingSamples:samples.length,p50Ms:percentile(.5),p95Ms:samples.length>=20?percentile(.95):null,maxMs:samples.at(-1)??null};
}
