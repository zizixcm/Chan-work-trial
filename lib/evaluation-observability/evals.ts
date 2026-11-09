import {createScorer,runEvals} from '@mastra/core/evals';
import {createStep,createWorkflow} from '@mastra/core/workflows';
import {z} from 'zod';
import {type Correlation,type LocalMastraObservability,type OperationContext} from './index';

const id=z.string().regex(/^[A-Za-z0-9_.:-]{1,160}$/);
const inputSchema=z.strictObject({caseId:id});
export const evaluationReceiptSchema=z.strictObject({
 caseId:id,completed:z.boolean(),
 checks:z.array(z.strictObject({id,passed:z.boolean()})),
});
export type EvaluationReceipt=z.infer<typeof evaluationReceiptSchema>;

/** Receipts come from evaluator-owned assertions over durable controller state,
 * never from an agent's claims. Missing/duplicate checks fail closed. Gold stays
 * in the evaluate closure and is never a workflow or agent input. */
export function createRequiredChecksScorer(requiredChecks:readonly string[]) {
 if(!requiredChecks.length||new Set(requiredChecks).size!==requiredChecks.length)throw Error('Unique required checks are mandatory');
 requiredChecks.forEach(check=>id.parse(check));
 return createScorer({id:'required-document-processing-checks',description:'Every required independent assertion must be present and pass',
  type:{input:inputSchema,output:evaluationReceiptSchema}}).generateScore(({run})=>{
   const parsed=evaluationReceiptSchema.safeParse(run.output);
   if(!parsed.success||!parsed.data.completed||parsed.data.caseId!==run.input?.caseId)return 0;
   const checks=parsed.data.checks;
   if(new Set(checks.map(check=>check.id)).size!==checks.length)return 0;
   return requiredChecks.every(required=>checks.some(check=>check.id===required&&check.passed))?1:0;
  });
}

/** Native Workflow -> production controller driver -> native Agents/tools.
 * A single case per run prevents averaging a critical failure away. The driver
 * owns isolated state, metered transport and independent semantic adjudication.
 * This helper has no provider/configuration defaults or live-eval entry point. */
export async function runNativeEvaluationCase(options:{
 observer:LocalMastraObservability;
 tier:'turn'|'task'|'e2e';
 correlation:Correlation&{caseId:string;evalRunId:string;datasetVersion:string};
 requiredChecks:readonly string[];
 evaluate:(caseId:string,context:OperationContext)=>Promise<EvaluationReceipt>;
}) {
 const {observer,correlation,tier}=options;
 return observer.runOperation(tier==='turn'?'borrower-turn':tier,{...correlation,tier},async context=>{
  const scorer=createRequiredChecksScorer(options.requiredChecks);
  observer.mastra.addScorer(scorer);
  // Registrations can retain an existing workflow's step closures. Each run/case
  // must have its own target or a subsequent case can execute an earlier driver.
  const workflowId=`document-eval-${tier}-${correlation.evalRunId}-${correlation.caseId}`;
  const step=createStep({id:'drive-durable-controller',inputSchema,outputSchema:evaluationReceiptSchema,
   execute:async({inputData})=>evaluationReceiptSchema.parse(await options.evaluate(inputData.caseId,context))});
  const workflow=createWorkflow({id:workflowId,inputSchema,outputSchema:evaluationReceiptSchema}).then(step).commit();
  observer.mastra.addWorkflow(workflow);
  const result=await runEvals({target:observer.mastra.getWorkflow(workflowId),data:[{input:{caseId:correlation.caseId},tracingContext:context.tracingContext}],
   gates:[scorer],scorers:[],concurrency:1});
  const passed=result.verdict==='passed'&&result.summary.totalItems===1&&!Object.values(result.summary.notScorable??{}).some(n=>n>0);
  await observer.recordScore(context.trace,{scorerId:scorer.id,scorerVersion:'1',score:passed?1:0});
  return {passed,result};
 });
}
