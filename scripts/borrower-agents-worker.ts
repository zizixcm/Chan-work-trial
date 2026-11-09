import {approvedPilotEvidence,verifyPilotBlob} from '../lib/agents/pilot-evidence';
/** Explicit isolated allowlisted pilot worker. Never started by the app or a GET. */
import './env';
import {createLocalMastraObservability} from '../lib/evaluation-observability';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import type {LocalMastraObservability} from '../lib/evaluation-observability';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {BorrowerAgentService} from '../lib/agents/borrower-service';
import {createMastraBorrowerPlanner,withAgentObservability} from '../lib/agents/runtime';
import {runBorrowerAgentsTick} from '../lib/agents/runner';
import {PreparationWorker} from '../lib/preparation/worker';
import {DocumentEvidenceTools} from '../lib/preparation/evidence-tools';
import {LocalBlobStorage} from '../lib/storage/local';
import {createLivePreparationPlanner} from './preparation-live-planner';
import {createEvaluationAgentTransport} from './mastra-evaluation-transport';
import {evaluationSummary,evaluationBatchLimit} from './evaluation-ledger.mjs';
import {PILOT_MODEL} from '../lib/agents/pilot-model.mjs';

export async function createBorrowerPilot(observer:LocalMastraObservability){
 if(process.env.BORROWER_AGENT_EXECUTION!=='live')throw Error('Live execution is disabled; use offline tests until candidate review');
 const url=new URL(process.env.DATABASE_URL!);
 if(url.hostname!=='127.0.0.1'||url.port!=='5434'||url.pathname!=='/preview')throw Error('Only the isolated pilot deployment database is allowed');
 const registryPath=process.env.PREPARATION_EVALUATION_REGISTRY,ledger=process.env.PREPARATION_EVALUATION_LEDGER,scenario=process.env.PREPARATION_EVALUATION_SCENARIO,apiKey=process.env.OPENROUTER_API_KEY;
 const cap=Number(process.env.PREPARATION_APPLICATION_BUDGET_MICROS),runCap=Number(process.env.PREPARATION_RUN_BUDGET_MICROS);
 const batchId=process.env.PREPARATION_EVALUATION_BATCH_ID,batchLimitMicros=Number(process.env.PREPARATION_EVALUATION_BATCH_LIMIT_MICROS);
 if(!batchId||!ledger||batchLimitMicros!==evaluationBatchLimit(ledger,batchId)||runCap>100000000)throw Error('Approved pilot batch and run caps required');
 if(!registryPath||!ledger||!scenario||!apiKey||!Number.isSafeInteger(cap)||cap<1||cap>100000000||!Number.isSafeInteger(runCap)||runCap<PILOT_MODEL.reservationMicros||runCap>cap)throw Error('Explicit registry, shared ledger, credentials and bounded budgets are required');
 const registry=JSON.parse(await readFile(registryPath,'utf8'));
 if(typeof registry.applicationId!=='string'||typeof registry.userId!=='string'||!Array.isArray(registry.sha256))throw Error('Invalid pilot registry');
 const database=new Pool({connectionString:url.toString()}),service=new BorrowerAgentService(database),storage=new LocalBlobStorage();
 const observability=observer;
 const access={applicationId:registry.applicationId,userId:registry.userId,role:'borrower' as const,displayName:'Pilot borrower'};
 let approved=new Map<string,string>();
 const verify=async()=>{approved=await service.preparation.transaction(access,db=>approvedPilotEvidence(db,access,registry.sha256));};
 try{
  await verify();
  await service.preparation.transaction(access,async db=>{
   await db.query(`INSERT INTO borrower_preparations(id,application_id,user_id,fingerprint,state) VALUES($1,$2,$3,'',$4) ON CONFLICT(application_id,user_id) DO NOTHING`,[randomUUID(),access.applicationId,access.userId,{currentResultRef:null,obligations:[],questionRefs:[],budget:{limitMicros:cap,knownMicros:0,reservedMicros:0,unknownCost:false}}]);
   const state=(await db.query('SELECT state FROM borrower_preparations WHERE application_id=$1 AND user_id=$2',[access.applicationId,access.userId])).rows[0].state;
   if(state.budget.limitMicros!==cap)throw Error('Existing application budget differs; reconcile explicitly without resetting accounting');
  });
  const options={ledger,scenario,apiKey,observability,batchId,batchLimitMicros},borrower=createMastraBorrowerPlanner(withAgentObservability(createEvaluationAgentTransport(options),observability));
  const worker=new PreparationWorker(service.preparation,createLivePreparationPlanner(options),new DocumentEvidenceTools(),async key=>{await verify();const bytes=await storage.get(key);verifyPilotBlob(key,bytes,approved);return bytes;},{runLimitMicros:runCap,maxCalls:24,timeoutMs:180000});
  return {async tick(){await verify();return {outcome:await runBorrowerAgentsTick(access,service,borrower,worker),budget:evaluationSummary(ledger)};},async close(){await database.end();}};
 }catch(error){await database.end();throw error;}
}
async function main(){
 const observer=await createLocalMastraObservability({directory:path.resolve(process.env.MASTRA_OBSERVABILITY_DIR??'.data/mastra-observability')});
 try{const pilot=await createBorrowerPilot(observer);try{console.log(JSON.stringify(await pilot.tick()));}finally{await pilot.close();}}finally{await observer.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(()=>{console.error('Borrower agent tick failed; inspect configuration and offline diagnostics. No automatic retry.');process.exitCode=1;});
