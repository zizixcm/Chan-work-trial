/** Explicit live opt-in; synthetic context only, no application mutations. */
import './env';
import {mkdir,writeFile,access} from 'node:fs/promises';
import path from 'node:path';
import {AGENT_CONFIGURATION_DIGEST,borrowerInstructions} from '../lib/agents/definitions';
import {borrowerConcisionCases,evaluateBorrowerConcision} from '../lib/evals/borrower-concision';
import {createEvaluationAgentTransport} from './mastra-evaluation-transport';
import {initializeLedger,evaluationSummary} from './evaluation-ledger.mjs';
async function main(){
 if(process.argv[2]!=='--live')throw Error('Explicit --live required');
 const round=process.argv[3]??'baseline';
 if(!/^[a-z0-9-]{1,40}$/.test(round))throw Error('Invalid round');
 const apiKey=process.env.OPENROUTER_API_KEY;
 if(!apiKey)throw Error('OPENROUTER_API_KEY unavailable');
 const root=path.resolve('artifacts/testing/borrower-concision/live');
 await mkdir(root,{recursive:true});
 const ledger=path.join(root,'ledger.json');
 try{await access(ledger);}catch{initializeLedger(ledger);}
 const directory=path.join(root,round);
 await mkdir(directory); // Never overwrite a previous run.
 await writeFile(path.join(directory,'instructions.txt'),borrowerInstructions);
 for(const fixture of borrowerConcisionCases){
  const transport=createEvaluationAgentTransport({ledger,scenario:fixture.id,apiKey,configurationDigest:AGENT_CONFIGURATION_DIGEST,batchId:'borrower-concision-20261108',batchLimitMicros:2_000_000});
  const result=await evaluateBorrowerConcision(fixture,transport,AbortSignal.timeout(90000));
  const report={mode:'live',model:'openrouter/google/gemini-2.5-flash',configurationDigest:AGENT_CONFIGURATION_DIGEST,fixture,createdAt:new Date().toISOString(),...result};
  await writeFile(path.join(directory,`${fixture.id}.json`),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({caseId:fixture.id,...result}));
 }
 console.log(JSON.stringify({directory,budget:evaluationSummary(ledger)}));
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Live evaluation failed');process.exitCode=1;});
