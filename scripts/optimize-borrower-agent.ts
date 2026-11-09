/** Explicit bounded synthetic evaluation; never changes deployed prompts or application data. */
import './env';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {z} from 'zod';
import {optimize,grade,digest,candidate,proposalSchema,reviewSchema,type Candidate,type Case,type Result} from '../lib/agent-optimization/core';
import {JUDGE_VERSION,JUDGE_INSTRUCTIONS,judgeCalibration} from '../lib/agent-optimization/judge';
import {promotionCases} from '../lib/agent-optimization/promotion-cases';
import {developmentCases,holdoutCases} from '../lib/agent-optimization/cases';
import {borrowerActionSchema} from '../lib/agents/definitions';
import {createMastraBorrowerPlanner} from '../lib/agents/runtime';
import {PILOT_MODEL} from '../lib/agents/pilot-model.mjs';
import {createEvaluationAgentTransport} from './mastra-evaluation-transport';
import {guardedEvaluationFetch} from './live-evaluation-fetch.mjs';
import {initializeLedger,evaluationSummary} from './evaluation-ledger.mjs';
async function main(){
 const rawArgs=process.argv.slice(2),validateCurrent=rawArgs.includes('--validate-current');
 const rescoreIndex=rawArgs.indexOf('--rescore'),rescoreDirectory=rescoreIndex>=0?rawArgs[rescoreIndex+1]:undefined;
 if(rescoreIndex>=0&&(!validateCurrent||!rescoreDirectory))throw Error('--rescore requires --validate-current and a prior artifact directory');
 const args=rawArgs.filter((a,i)=>a!=='--validate-current'&&(rescoreIndex<0||(i!==rescoreIndex&&i!==rescoreIndex+1)));
 if(![3,5].includes(args.length)||(args.length===5&&args[3]!=='--ledger')||args[0]!=='--live'||args[1]!=='--budget-usd'||!['5','10','20'].includes(args[2]))throw Error('Usage: npx tsx scripts/optimize-borrower-agent.ts --live --budget-usd <5|10|20> [--ledger existing-ledger-path]');
 const apiKey=process.env.OPENROUTER_API_KEY;if(!apiKey)throw Error('OPENROUTER_API_KEY unavailable');
 const batchLimitMicros=Number(args[2])*1_000_000,batchId=`optimizer-${Date.now()}`;
 const directory=resolve('artifacts/testing/agent-optimization',batchId);await mkdir(directory,{recursive:true,mode:0o700});
 const save=async(name:string,value:unknown)=>writeFile(join(directory,name),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
 const ledger=args[4]?resolve(args[4]):join(directory,'ledger.json');
 if(args[4]){const state=JSON.parse(await readFile(ledger,'utf8'));if(state.limitMicros!==batchLimitMicros)throw Error('Reused ledger cap must match requested budget');}else initializeLedger(ledger);
 const initialHeldMicros=evaluationSummary(ledger).heldMicros;
 const files=['lib/agents/definitions.ts','lib/agents/runtime.ts','lib/agents/pilot-model.mjs','lib/agent-optimization/core.ts','lib/agent-optimization/cases.ts','lib/agent-optimization/judge.ts','lib/agent-optimization/promotion-cases.ts','scripts/optimize-borrower-agent.ts','scripts/mastra-evaluation-transport.ts','scripts/live-evaluation-fetch.mjs','scripts/evaluation-ledger.mjs'];
 const sourceHashes=Object.fromEntries(await Promise.all(files.map(async f=>[f,digest(await readFile(f,'utf8'))])));
 await save('manifest.json',{batchId,batchLimitMicros,model:PILOT_MODEL,ledger,initialHeldMicros,validateCurrent,rescoreDirectory,promotionCasesDigest:digest(promotionCases),judgeVersion:JUDGE_VERSION,judgeIndependence:'Separate blind call, same model family; not human-certified',sourceHashes,revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:execFileSync('git',['status','--short'],{encoding:'utf8'}),developmentDigest:digest(developmentCases),holdoutDigest:digest(holdoutCases),repeats:2,promotion:'manual',createdAt:new Date().toISOString()});
 console.log(JSON.stringify({directory,batchLimitMicros}));
 let calls=0;
 async function jsonCall(role:string,system:string,input:unknown,configurationDigest:string){
  const call=++calls,fetcher=guardedEvaluationFetch(fetch,{ledger,scenario:role,batchId,batchLimitMicros,configurationDigest});
  const response=await fetcher('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(120000),body:JSON.stringify({model:PILOT_MODEL.id,messages:[{role:'system',content:system},{role:'user',content:JSON.stringify(input)}],temperature:0,max_tokens:8000,response_format:{type:'json_object'}})});
  if(!response.ok)throw Error(`${role} provider HTTP ${response.status}`);
  const body=await response.json();const choice=body.choices?.[0];if(choice?.finish_reason!=='stop')throw Error(`${role} incomplete response`);
  const output=JSON.parse(choice.message.content);await save(`auxiliary-${call}.json`,{role,configurationDigest,input,output,usage:body.usage});
  if(evaluationSummary(ledger).heldMicros>initialHeldMicros)throw Error('Unknown API cost; stop before further dispatch');
  return output;
 }
 async function evaluate(c:Candidate,cases:Case[],repeats:number):Promise<Result[]>{
  const results:Result[]=[];
  for(const fixture of cases)for(let repeat=0;repeat<repeats;repeat++){
   const start=Date.now(),before=evaluationSummary(ledger).knownMicros;
   const transport=createEvaluationAgentTransport({ledger,scenario:`${fixture.id}:${repeat}`,apiKey:apiKey!,configurationDigest:c.id,batchId,batchLimitMicros});
   let generated;
   if(rescoreDirectory){
    const prior=JSON.parse(await readFile(join(resolve(rescoreDirectory),`${c.id}-${fixture.id}-${repeat}-action.json`),'utf8'));
    if(prior.candidateId!==c.id||digest(prior.input)!==digest(fixture.input))throw Error('Replay configuration/input mismatch');
    generated={action:borrowerActionSchema.parse(prior.action),actualMicros:prior.actualMicros,executed:prior.executed,replayOrigin:resolve(rescoreDirectory)};
   }else generated=await createMastraBorrowerPlanner(transport,c.supplement).decide(fixture.input,AbortSignal.timeout(120000),async()=>({evaluationOnly:true}));
   await save(`${c.id}-${fixture.id}-${repeat}-action.json`,{candidateId:c.id,input:fixture.input,...generated});
   if(evaluationSummary(ledger).heldMicros>initialHeldMicros)throw Error('Unknown agent cost; stop before further dispatch');
   const review=reviewSchema.parse(await jsonCall('judge',JUDGE_INSTRUCTIONS,{input:fixture.input,rubric:fixture.rubric,action:generated.action},c.id));
   const result={caseId:fixture.id,repeat,action:generated.action,review,...grade(fixture,generated.action,review),costMicros:evaluationSummary(ledger).knownMicros-before,elapsedMs:Date.now()-start};
   results.push(result);await save(`${c.id}-${fixture.id}-${repeat}-score.json`,result);
   console.log(JSON.stringify({candidate:c.id.slice(0,10),caseId:fixture.id,repeat,passed:result.passed,spentMicros:evaluationSummary(ledger).knownMicros}));
  }
  return results;
 }
 try{
  for(const calibration of judgeCalibration){
   const review=reviewSchema.parse(await jsonCall('judge-calibration',JUDGE_INSTRUCTIONS,{input:calibration.activeRun?promotionCases.find(c=>c.id==='promotion-running')!.input:developmentCases[0].input,rubric:calibration.activeRun?promotionCases.find(c=>c.id==='promotion-running')!.rubric:developmentCases[0].rubric,action:{kind:'reply',message:calibration.message}},digest({JUDGE_VERSION})));
   if(review.grounded.passed!==calibration.grounded)throw Error(`Judge failed calibration: ${calibration.id}`);
  }
  if(validateCurrent){
   const configuration=candidate('','Reviewed production instructions; no optimizer supplement');
   await save('production-config.json',configuration);
   const results=await evaluate(configuration,[...developmentCases,...holdoutCases,...promotionCases],2);
   const report={status:results.every(r=>r.passed)?'validation_passed':'validation_failed',configurationDigest:configuration.id,baseDigest:configuration.baseDigest,passed:results.filter(r=>r.passed).length,total:results.length,results,promoted:false};
   await save('production-validation.json',report);await save('budget-final.json',evaluationSummary(ledger));
   console.log(JSON.stringify({directory,status:report.status,passed:report.passed,total:report.total,budget:evaluationSummary(ledger)}));
   if(report.status!=='validation_passed')process.exitCode=1;
   return;
  }
  const report=await optimize({development:developmentCases,holdout:holdoutCases,repeats:2,evaluate,save,propose:async(baseline,results)=>{
   const schema=z.strictObject({candidates:z.array(proposalSchema).min(1).max(3)});
   return schema.parse(await jsonCall('proposer',`Propose exactly two distinct, small additions to a borrower assistant's instructions to address development failures. Preserve all evidence, authorization and tool-use constraints. Do not mention test IDs, fixture names, exact fixture filenames, scoring or evaluators in additions. Generalize the behavior. Do not weaken grounding, suppress uncertainty, or imply approval. Output JSON {candidates:[{hypothesis:string,supplement:string}]}. Each supplement at most 2000 characters. Existing instructions remain immutable; only add guidance. If baseline passes all cases, propose general improvements; selection will retain baseline unless measured correctness improves.`,{baselineInstructions:baseline.baseInstructions,development:developmentCases,results},baseline.id)).candidates;
  }});
  await save('budget-final.json',evaluationSummary(ledger));console.log(JSON.stringify({directory,status:report.status,budget:evaluationSummary(ledger)}));
 }catch(error){await save('failure.json',{error:error instanceof Error?error.message:'Optimization failed',budget:evaluationSummary(ledger)});throw error;}
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Optimization failed');process.exitCode=1;});
