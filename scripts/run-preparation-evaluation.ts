/** One bounded live synthetic tick. Never a daemon or normal borrower worker. */
import './env';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Pool} from 'pg';
import {PreparationService,type PreparationAccess} from '../lib/preparation/service';
import {PreparationWorker} from '../lib/preparation/worker';
import {DocumentEvidenceTools} from '../lib/preparation/evidence-tools';
import {runPreparationTick} from '../lib/preparation/runner';
import {dispatchPendingChatDelegations} from '../lib/borrower-chat/dispatch-pending';
import {LocalBlobStorage} from '../lib/storage/local';
import {createLivePreparationPlanner} from './preparation-live-planner';
import {evaluationSummary} from './evaluation-ledger.mjs';
async function main(){
 const url=new URL(process.env.DATABASE_URL!);
 if(url.hostname!=='127.0.0.1'||url.port!=='5434'||url.pathname!=='/preview')throw Error('Only isolated deployment database is allowed');
 const registryPath=process.env.PREPARATION_EVALUATION_REGISTRY,ledger=process.env.PREPARATION_EVALUATION_LEDGER,scenario=process.env.PREPARATION_EVALUATION_SCENARIO;
 if(!registryPath||!ledger||!scenario||!process.env.OPENROUTER_API_KEY)throw Error('Explicit evaluation configuration required');
 const registry=JSON.parse(await readFile(registryPath,'utf8')) as {applicationId:string;userId:string;sha256:string[]};
 if(!registry.applicationId||!registry.userId||!registry.sha256.length)throw Error('Synthetic evidence allowlist required');
 const database=new Pool({connectionString:url.toString()}),service=new PreparationService(database),storage=new LocalBlobStorage();
 try{
  const planner=createLivePreparationPlanner({ledger,scenario,apiKey:process.env.OPENROUTER_API_KEY});
  class ScopedWorker extends PreparationWorker {
   override async run(access:PreparationAccess,runId:string){
    if(access.applicationId!==registry.applicationId||access.userId!==registry.userId)throw Error('Run is outside synthetic evaluation scope');
    await service.transaction(access,async db=>{
     const inventory=await service.inventory(db,access.applicationId);
     if(inventory.documents.some(d=>!registry.sha256.includes(d.sha256)))throw Error('Unregistered evidence: paid dispatch denied');
     // Grant only this isolated synthetic preparation, preserving all existing accounting.
     await db.query("UPDATE borrower_preparations SET state=jsonb_set(state,'{budget,limitMicros}','20000000') WHERE application_id=$1 AND user_id=$2",[access.applicationId,access.userId]);
    });
    return super.run(access,runId);
   }
  }
  const worker=new ScopedWorker(service,planner,new DocumentEvidenceTools(),async key=>{
   const bytes=await storage.get(key);if(!registry.sha256.includes(createHash('sha256').update(bytes).digest('hex')))throw Error('Blob outside synthetic evaluation allowlist');return bytes;
  },{runLimitMicros:20_000_000,maxCalls:24,timeoutMs:60000});
  const outcome=await runPreparationTick(service,worker,{dispatchPendingChatDelegations:()=>dispatchPendingChatDelegations(database)});
  console.log(JSON.stringify({outcome,evaluation:evaluationSummary(ledger)}));
 }finally{await database.end();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Evaluation failed');process.exitCode=1;});
