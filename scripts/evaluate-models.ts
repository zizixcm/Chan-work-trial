import './env';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {evaluationCases} from '../lib/evals/cases';
import {formatEvaluationCases} from '../lib/evals/formats';
import {completionCases,matchingCases,packageTask,scorePackage} from '../lib/evals/packages';
import {scoreSemantic} from '../lib/evals/score';
import {buildVerifyTask} from '../lib/analysis/verify';
import {deriveFulfillment} from '../lib/analysis/fulfillment';
import {executeProvider,validateTaskSize,type ProviderTransport} from '../lib/backend/provider-executor';
import {mastraTransport} from '../lib/backend/mastra-transport';
import {safeFailure} from '../lib/backend/failures';
import {MODEL_PROFILES} from '../lib/backend/models';
import {ANALYSIS_VERSION,type AnalysisTask,type VerifyResult,type MatchResult} from '../lib/analysis/types';
async function main(){
 const arg=(name:string)=>process.argv.find(v=>v.startsWith(`--${name}=`))?.slice(name.length+3);
 const live=process.argv.includes('--live'),packages=process.argv.includes('--packages'),formats=process.argv.includes('--formats');
 if(packages&&formats)throw Error('Choose one suite.');
 const suite=packages?'package-coverage':formats?'formats':'semantic';
 const fixtures=packages?[...completionCases,...matchingCases]:formats?await formatEvaluationCases():evaluationCases;
 const selected=arg('cases')?.split(',');if(selected?.some(id=>!fixtures.some(c=>c.id===id)))throw Error('Unknown case.');
 const cases=fixtures.filter(c=>!selected||selected.includes(c.id));
 const models=arg('model')?[arg('model')!]:['google/gemini-2.5-flash-lite','google/gemini-2.5-flash'];
 if(models.some(model=>!MODEL_PROFILES[model]))throw Error('Unknown model.');
 const results:Array<Record<string,unknown>>=[],taskManifests:Array<Record<string,unknown>>=[];let reserved=0;
 for(const model of models)for(const fixture of cases){
  const packageFixture='kind' in fixture?fixture:undefined;
  const task=(packageFixture?packageTask(packageFixture):buildVerifyTask([(fixture as typeof evaluationCases[number]).document],(fixture as typeof evaluationCases[number]).requirement,(fixture as typeof evaluationCases[number]).document.limitations||[])) as AnalysisTask<VerifyResult|MatchResult>;
  taskManifests.push({case:fixture.id,model,instructions:task.instructions,prompt:task.prompt,outputSchema:task.outputSchema});
  const budget={model,maxInputTokens:16000,maxOutputTokens:3000,timeoutMs:60000};validateTaskSize(task,budget);
  if(!live)continue;
  const maximum=(16000*MODEL_PROFILES[model].input+3000*MODEL_PROFILES[model].output)/1000000;
  if(reserved+maximum>.15){results.push({case:fixture.id,model,status:'not_run_budget'});continue;}reserved+=maximum;
  const start=performance.now();let rawResponse:string|undefined;let responseBytes:number|undefined;
  const transport:ProviderTransport={generate:async input=>{const response=await mastraTransport.generate(input);responseBytes=Buffer.byteLength(response.text);rawResponse=response.text.slice(0,32000);return response;}};
  try{
   const output=await executeProvider(task,budget,transport,new AbortController().signal);
   const score=packageFixture?scorePackage(packageFixture,output.value):scoreSemantic(fixture as typeof evaluationCases[number],output.value as VerifyResult);
   const actual=output.value.schemaVersion==='verify.v1'?deriveFulfillment(output.value):undefined;
   results.push({case:fixture.id,model,status:'executed',expected:packageFixture?{fulfillment:packageFixture.expectedFulfillment,relevance:packageFixture.expectedRelevance,missing:packageFixture.missing}:('expected' in fixture?fixture.expected:undefined),actual,...score,elapsedMs:Math.round(performance.now()-start),usage:output.usage,output:output.value});
  }catch(error){results.push({case:fixture.id,model,status:'executed',passed:false,error:safeFailure(error).code,stage:rawResponse===undefined?'provider':'output_validation',elapsedMs:Math.round(performance.now()-start),rawResponse,responseBytes,responseTruncated:responseBytes!==undefined&&responseBytes>Buffer.byteLength(rawResponse||'')});}
 }
 if(!live){console.log(JSON.stringify({suite,validatedCases:cases.length,models,live:false}));return;}
 const report={version:ANALYSIS_VERSION,oracleVersion:'coverage.v1',suite,createdAt:new Date().toISOString(),reservedMaximumUsd:reserved,syntheticOnly:true,taskManifests,scoringNote:'Reason screens are provisional, not semantic proof. Compare models only on paired executed cases. Ambiguous relevance entries are unscored.',fixtures:cases.map(f=>({fixture:f,sha256:createHash('sha256').update(JSON.stringify(f)).digest('hex')})),results};
 await mkdir('artifacts/ai-evaluations',{recursive:true});
 const filename=`artifacts/ai-evaluations/comparison-${Date.now()}.json`;await writeFile(filename,JSON.stringify(report,null,2));
 console.log(JSON.stringify({filename,reservedMaximumUsd:reserved,results:results.map(({output,rawResponse,...summary})=>summary)}));
}
main().catch(()=>{console.error('Evaluation stopped; check configuration, case selection or budgets.');process.exitCode=1;});
