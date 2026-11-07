import './env';
import {mkdir,writeFile} from 'node:fs/promises';
import {evaluationCases} from '../lib/evals/cases';
import {formatEvaluationCases} from '../lib/evals/formats';
import {buildVerifyTask} from '../lib/analysis/verify';
import {deriveFulfillment} from '../lib/analysis/fulfillment';
import {executeProvider,validateTaskSize} from '../lib/backend/provider-executor';
import {mastraTransport} from '../lib/backend/mastra-transport';
import {ANALYSIS_VERSION} from '../lib/analysis/types';
async function main(){
 const live=process.argv.includes('--live');
 const cases=process.argv.includes('--formats')?await formatEvaluationCases():evaluationCases;
 const models=['google/gemini-2.5-flash-lite','google/gemini-2.5-flash'];
 const results:unknown[]=[];let reserved=0;
 for(const model of models)for(const fixture of cases){
  const task=buildVerifyTask([fixture.document],fixture.requirement,fixture.document.limitations||[]),budget={model,maxInputTokens:10000,maxOutputTokens:2000,timeoutMs:60000};
  validateTaskSize(task,budget);
  if(!live)continue;
  // Explicit synthetic-only evaluation budget, independent of application jobs.
  const maximum=model.endsWith('flash-lite')?.0018:.008;
  if(reserved+maximum>.15)throw Error('Evaluation cost cap reached');reserved+=maximum;
  const start=performance.now();
  try{
   const output=await executeProvider(task,budget,mastraTransport,new AbortController().signal),actual=deriveFulfillment(output.value);
   results.push({case:fixture.id,sourceHash:fixture.document.sha256,model,expected:fixture.expected,actual,passed:actual===fixture.expected,falseFulfilled:actual==='fulfilled'&&fixture.expected!=='fulfilled',elapsedMs:Math.round(performance.now()-start),usage:output.usage,output:output.value});
  }catch{results.push({case:fixture.id,sourceHash:fixture.document.sha256,model,expected:fixture.expected,passed:false,error:'call_or_validation_failed',elapsedMs:Math.round(performance.now()-start)});}
 }
 if(!live){console.log(JSON.stringify({validatedCases:cases.length,models,live:false}));return;}
 const report={version:ANALYSIS_VERSION,createdAt:new Date().toISOString(),reservedMaximumUsd:reserved,results};
 await mkdir('artifacts/ai-evaluations',{recursive:true});
 const filename=`artifacts/ai-evaluations/comparison-${Date.now()}.json`;await writeFile(filename,JSON.stringify(report,null,2));
 console.log(JSON.stringify({filename,cases:results.length,reservedMaximumUsd:reserved,results:results.map(({output,...summary}:any)=>summary)}));
}
main().catch(()=>{console.error('Evaluation stopped; check configuration or budgets.');process.exitCode=1;});
