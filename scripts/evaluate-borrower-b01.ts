/** One explicitly approved turn, through the actual durable borrower controller.
 * Default is offline. Live dispatch remains the deployment owner's operation. */
import './env';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {Pool} from 'pg';
import {createRequire} from 'node:module';
import {z} from 'zod';
import {BorrowerAgentService} from '../lib/agents/borrower-service';
import {AGENT_CONFIGURATION_DIGEST,borrowerInstructions,borrowerActionSchema} from '../lib/agents/definitions';
import {createMastraBorrowerPlanner,withAgentObservability} from '../lib/agents/runtime';
import {transitionProcessorMode} from '../lib/preparation/ownership';
import {createLocalMastraObservability} from '../lib/evaluation-observability';
import {runNativeEvaluationCase} from '../lib/evaluation-observability/evals';
import {createEvaluationAgentTransport} from './mastra-evaluation-transport';
import {scriptedAgentTransport} from '../tests/fixtures/native-agent-model';
import {evaluationSummary} from './evaluation-ledger.mjs';

async function main(){
 const live=process.env.BORROWER_AGENT_EXECUTION==='live',url=new URL(process.env.DATABASE_URL!);
 if(!['127.0.0.1','localhost'].includes(url.hostname)||(live&&(url.hostname!=='127.0.0.1'||url.port!=='5434'||url.pathname!=='/preview')))throw Error('Isolated local database required');
 const approvalBytes=await readFile('datasets/borrower-e2e-v1/review/user-approval/B01.json');
 const approval=JSON.parse(approvalBytes.toString());if(approval.caseId!=='B01'||approval.status!=='approved')throw Error('B01 specification approval required');
 const request=JSON.parse(await readFile('datasets/borrower-e2e-v1/corpus/development/D01/agent/request.json','utf8'));
 const ledger=process.env.PREPARATION_EVALUATION_LEDGER,apiKey=process.env.OPENROUTER_API_KEY;
 if(live&&(!ledger||!apiKey||process.env.PREPARATION_EVALUATION_BATCH_ID!=='first-pilot-20261108'||process.env.PREPARATION_EVALUATION_BATCH_LIMIT_MICROS!=='5000000'))throw Error('Approved batch configuration required');
 const directory=path.resolve(process.env.B01_OUTPUT_DIR??`artifacts/testing/live-b01-${Date.now()}`);
 await mkdir(directory,{recursive:true,mode:0o700});
 const observer=await createLocalMastraObservability({directory:path.join(directory,'observability')});
 const schema=`dataset_eval_b01_${randomUUID().replaceAll('-','')}`,admin=new Pool({connectionString:url.toString()});
 url.searchParams.set('options',`-c search_path=${schema},public`);const db=new Pool({connectionString:url.toString()});
 const before=live?evaluationSummary(ledger!):null,started=Date.now();let dispatches=0;
 try{
  await admin.query(`CREATE SCHEMA ${schema}`);
  for(const file of (await readdir('migrations/postgres')).filter(f=>f.endsWith('.sql')).sort())await db.query(await readFile(path.join('migrations/postgres',file),'utf8'));
  await db.query(`INSERT INTO "user"(id,name,email,"emailVerified") VALUES('b01-user','Synthetic B01 borrower','b01@example.test',true)`);
  await db.query("INSERT INTO applications(id,borrower_name,property_name,address,transaction_type,requested_amount,loi_reference,created_at) VALUES('b01-app',$1,$2,'Synthetic address',$3,1000,'B01',now())",[request.application.borrower,request.application.property,request.policy.transaction]);
  await db.query("INSERT INTO application_memberships(application_id,user_id,role) VALUES('b01-app','b01-user','borrower')");
  for(let i=0;i<5;i++){
   const id=`b01-r${i+1}`,entries=Object.entries(request.policy.criteria).filter(([key])=>key.startsWith(`R${i+1}.`));
   const policy=Object.fromEntries(entries.flatMap(([key],n)=>key==='R2.chain'?[[`${id}:criterion:${n+1}`,'no_amendments']]:[]));
   await db.query("INSERT INTO requirements(id,application_id,title,category,purpose,period,owner,applicability,sort_order,criteria,criterion_confirmation_policy) VALUES($1,'b01-app',$2,'Pilot',$3,$4,'Borrower','Required',$5,$6,$7)",[id,request.policy.requests[i],request.policy.rules.join('\n'),request.policy.reviewDate,i,entries.map(([,description])=>description),policy]);
  }
  const service=new BorrowerAgentService(db),access={applicationId:'b01-app',userId:'b01-user',role:'borrower' as const,displayName:'Synthetic B01 borrower'};
  await service.preparation.transaction(access,tx=>transitionProcessorMode(tx,access.applicationId,'adaptive'));
  await db.query("INSERT INTO borrower_preparations(id,application_id,user_id,fingerprint,state) VALUES('b01-prep','b01-app','b01-user','',$1)",[{currentResultRef:null,obligations:[],questionRefs:[],budget:{limitMicros:2000000,knownMicros:0,reservedMicros:0,unknownCost:false}}]);
  const declared=await service.enqueueMessage(access,{clientMessageId:'declared-context',text:request.initialMessage});
  await db.query("UPDATE borrower_agent_turns SET state='superseded',reason_code='fixture_context_only' WHERE id=$1",[declared.id]);
  const turn=await service.enqueueMessage(access,{clientMessageId:'b01-question',text:approval.input.borrowerMessage});
  const base=live?createEvaluationAgentTransport({ledger:ledger!,apiKey:apiKey!,scenario:'B01',batchId:'first-pilot-20261108',batchLimitMicros:5000000,configurationDigest:AGENT_CONFIGURATION_DIGEST}):scriptedAgentTransport('reply_to_borrower',{message:'Please upload the five requested document groups. This offline fixture verifies wiring only.'});
  const require=createRequire(import.meta.url),sdkVersion=JSON.parse(await readFile(require.resolve('@mastra/core/package.json'),'utf8')).version;
  let dispatchedInputSha256:string|undefined,checks:{id:string;passed:boolean}[]=[];
  const transport={...base,async run(...args:Parameters<typeof base.run>){if(dispatches++)throw Error('B01 permits one generation only');const snapshot=JSON.stringify({messages:args[1],instructions:borrowerInstructions,actionSchema:z.toJSONSchema(borrowerActionSchema),model:'openrouter/google/gemini-2.5-flash',sdkVersion},null,2);dispatchedInputSha256=createHash('sha256').update(snapshot).digest('hex');await writeFile(path.join(directory,'dispatched-input.json'),snapshot+'\n',{mode:0o600});return base.run(...args);}};
  let response:unknown=null;
  const evaluation=await runNativeEvaluationCase({observer,tier:'turn',correlation:{caseId:'B01',evalRunId:`b01-${Date.now()}`,datasetVersion:'borrower-e2e-v1',configurationDigest:AGENT_CONFIGURATION_DIGEST},requiredChecks:['native_reply','response_persisted','no_investigation','no_document_claim_state','one_generation'],evaluate:async(caseId,context)=>{
   await db.query("UPDATE borrower_conversations SET agent_trace_ref=$1 WHERE application_id='b01-app'",[context.trace]);
   await service.runOne(access,createMastraBorrowerPlanner(withAgentObservability(transport,observer)));
   const stored=(await db.query('SELECT state,decision,response_text,reason_code,actual_micros FROM borrower_agent_turns WHERE id=$1',[turn.id])).rows[0];response=stored;
   const counts=(await db.query('SELECT (SELECT count(*) FROM preparation_runs)::int investigations,(SELECT count(*) FROM preparation_results)::int results,(SELECT count(*) FROM documents)::int documents')).rows[0];
   checks=[{id:'native_reply',passed:stored.decision?.kind==='reply'},{id:'response_persisted',passed:stored.state==='completed'&&!!stored.response_text},{id:'no_investigation',passed:counts.investigations===0},{id:'no_document_claim_state',passed:counts.documents===0&&counts.results===0},{id:'one_generation',passed:dispatches===1}];return {caseId,completed:true,checks};
  }});
  const report={caseId:'B01',sdkVersion,dispatchedInputSha256,checks,promptSha256:createHash('sha256').update(borrowerInstructions).digest('hex'),requestSha256:createHash('sha256').update(await readFile('datasets/borrower-e2e-v1/corpus/development/D01/agent/request.json')).digest('hex'),mode:live?'live':'offline-scripted',configurationDigest:AGENT_CONFIGURATION_DIGEST,approvalFileSha256:createHash('sha256').update(approvalBytes).digest('hex'),elapsedMs:Date.now()-started,dispatches,structuralPassed:evaluation.value.passed,semanticReview:'pending independent review; structural score is not a quality pass',response,trace:evaluation.trace,budgetBefore:before,budgetAfter:live?evaluationSummary(ledger!):null};
  await writeFile(path.join(directory,'report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({directory,mode:report.mode,structuralPassed:report.structuralPassed,semanticReview:report.semanticReview,trace:report.trace}));
 }finally{await observer.close();await db.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:'B01 evaluation failed');process.exitCode=1;});
