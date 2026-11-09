import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {BorrowerAgentService,type BorrowerPlanner} from '../agents/borrower-service';
import {PreparationWorker,type WorkerOptions} from '../preparation/worker';
import {DocumentEvidenceTools} from '../preparation/evidence-tools';
import type {PreparationPlanner,EvidenceTools,PageObservation} from '../preparation/actions';
import {transitionProcessorMode} from '../preparation/ownership';
import {digest} from '../preparation-pilot/contracts';
import type {LocalMastraObservability} from './index';
import {runNativeEvaluationCase} from './evals';
import {loadDatasetCase,type DatasetCaseId,type DatasetBoundary,sha256} from './dataset';
import {scoreDatasetBoundary,type BoundaryObservation,type BoundaryScore,type SemanticReviewer} from './dataset-scorers';

export interface DatasetDriverOptions {
 datasetRoot:string;caseId:DatasetCaseId;database:Pool;observer:LocalMastraObservability;
 /** Explicit opt-in only; caller owns guarded provider transport and ledger. */
 mode:'offline-scripted'|'live-exploratory';
 planners:{borrower:()=>BorrowerPlanner;investigator:()=>PreparationPlanner};
 reviewer?:SemanticReviewer;
 budgetMicros:number;worker:WorkerOptions;maxControllerCycles?:number;
 evidenceTools?:EvidenceTools;
 /** Evaluator-owned persisted snapshots; includes text. Store privately. */
 onBoundary?:(observation:BoundaryObservation,score:BoundaryScore)=>Promise<void>;
}
export interface DatasetDriverReport {
 caseId:DatasetCaseId;mode:DatasetDriverOptions['mode'];applicationId:string;admissionDigest:string;
 boundaries:{observation:BoundaryObservation;score:BoundaryScore}[];
 documentBindings:Record<string,string>;
 compatibility:{id:string;status:'verified'|'requires_targeted_test'|'blocked';detail:string}[];
 passed:boolean;trace:{traceId:string;spanId:string};
}

/** Real controller execution against caller-owned migrated disposable schema.
 * No schema creation/destruction, storage connection, provider or judge defaults.
 * Fixtures enter through trusted DB ingestion, so this is API/controller E2E,
 * not HTTP multipart/browser coverage. IDs are mapped, never gold revisions. */
export async function runDatasetJourney(options:DatasetDriverOptions):Promise<DatasetDriverReport>{
 if(!['offline-scripted','live-exploratory'].includes(options.mode))throw Error('Explicit evaluation mode required');
 if(options.mode==='live-exploratory'){
  if(!['D01','D03'].includes(options.caseId))throw Error('Exploratory live case is not allowlisted');
  if(!Number.isSafeInteger(options.worker.runLimitMicros)||options.worker.runLimitMicros!<1||options.worker.runLimitMicros!>2_000_000||options.budgetMicros>2_000_000||!Number.isSafeInteger(options.worker.maxCalls)||options.worker.maxCalls!<1||options.worker.maxCalls!>24||!Number.isSafeInteger(options.worker.timeoutMs)||options.worker.timeoutMs!<1||options.worker.timeoutMs!>180_000)throw Error('Bounded live execution limits required');
 }
 if(!Number.isSafeInteger(options.budgetMicros)||options.budgetMicros<1)throw Error('Explicit positive budget required');
 const db=options.database;
 const schema=(await db.query('SELECT current_schema() AS name')).rows[0]?.name;
 if(typeof schema!=='string'||!/^dataset_eval_[a-z0-9_]+$/.test(schema))throw Error('Driver requires a disposable dataset_eval_ schema');
 const dataset=await loadDatasetCase(options.datasetRoot,options.caseId);
 const prefix=randomUUID(),applicationId=`eval-${prefix}`,userId=`eval-user-${prefix}`;
 const access={applicationId,userId,role:'borrower' as const,displayName:'Synthetic dataset borrower'};
 const service=new BorrowerAgentService(db),stored=new Set<string>(),released=new Map<string,Uint8Array>();
 const bindings=new Map<string,string>(),savedHashes=new Map<string,string>();
 const docId=(id:string)=>bindings.get(id)??`${prefix}-${id}`;
 const fixtureDocs=(id:string)=>[...bindings].filter(([,actual])=>actual===id).map(([fixture])=>fixture);
 const fixtureDoc=(id:string)=>fixtureDocs(id)[0]??id;
 const requirementId=(id:string)=>`${prefix}-${id}`;
 const criterionMap=new Map<string,string>();
 const report:Omit<DatasetDriverReport,'trace'>={caseId:dataset.id,mode:options.mode,applicationId,admissionDigest:dataset.admissionDigest,boundaries:[],documentBindings:{},passed:false,compatibility:[]};
 await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)',[userId,access.displayName,`${prefix}@example.test`]);
 await db.query("INSERT INTO applications(id,borrower_name,property_name,address,transaction_type,requested_amount,loi_reference,created_at) VALUES($1,$2,$3,'Synthetic fixture address',$4,1000,'Dataset evaluation',now())",[applicationId,dataset.request.application.borrower,dataset.request.application.property,dataset.request.policy.transaction]);
 await db.query("INSERT INTO application_memberships(application_id,user_id,role) VALUES($1,$2,'borrower')",[applicationId,userId]);
 for(let index=0;index<dataset.request.policy.requests.length;index++){
  const logical=`R${index+1}`,id=requirementId(logical);
  const entries=Object.entries(dataset.request.policy.criteria).filter(([key])=>key.startsWith(logical+'.')) as [string,string][];
  entries.forEach(([key],n)=>criterionMap.set(`${id}:criterion:${n+1}`,key));
  const confirmation=Object.fromEntries([...criterionMap].filter(([,logical])=>logical==='R2.chain').map(([actual])=>[actual,'no_amendments']));
  await db.query("INSERT INTO requirements(id,application_id,title,category,purpose,period,owner,applicability,sort_order,criteria,criterion_confirmation_policy) VALUES($1,$2,$3,'Dataset',$4,$5,'Borrower','Required',$6,$7,$8)",[id,applicationId,dataset.request.policy.requests[index],dataset.request.policy.rules.join('\n')+'\nDeclared application context: '+JSON.stringify(dataset.request.application),dataset.request.policy.reviewDate,index,entries.map(([,description])=>description),logical==='R2'?confirmation:{}]);
 }
 await service.preparation.transaction(access,tx=>transitionProcessorMode(tx,applicationId,'adaptive'));
 await db.query('INSERT INTO user_ai_preferences(user_id,enabled) VALUES($1,true) ON CONFLICT(user_id) DO UPDATE SET enabled=true',[userId]);
 await db.query('INSERT INTO borrower_preparations(id,application_id,user_id,fingerprint,state) VALUES($1,$2,$3,\'\',$4)',[`prep-${prefix}`,applicationId,userId,{currentResultRef:null,obligations:[],questionRefs:[],budget:{limitMicros:options.budgetMicros,knownMicros:0,reservedMicros:0,unknownCost:false}}]);
 const readBlob=async(key:string)=>{const bytes=released.get(key);if(!bytes)throw Error('Document bytes not released');return bytes;};
 const tools=options.evidenceTools??new DocumentEvidenceTools();
 const planner=options.planners.borrower();
 let executionFailure:unknown;
 const evaluator=await runNativeEvaluationCase({observer:options.observer,tier:'e2e',correlation:{caseId:dataset.id,evalRunId:prefix,datasetVersion:dataset.version,applicationId,userId},requiredChecks:['all-boundaries','evidence','safety','semantic-review'],evaluate:async(caseId,context)=>{try{
  await service.enqueueMessage(access,{clientMessageId:'dataset-initial',text:dataset.request.initialMessage});
  await db.query('UPDATE borrower_conversations SET agent_trace_ref=$1 WHERE application_id=$2 AND borrower_user_id=$3',[context.trace,applicationId,userId]);
  let prior:BoundaryObservation|undefined;
  const capturedMessages=new Set<string>();
  for(const boundary of dataset.boundaries){
   const errors:string[]=[];
   // Release only saved bytes. Pending files remain metadata, never readBlob entries.
   for(const id of boundary.savedIds){if(stored.has(id))continue;
    const doc=dataset.documents.find(d=>d.documentId===id);if(!doc)throw Error('Unknown saved fixture');
    // Production upload storage deduplicates identical bytes per application.
    // Keep fixture aliases explicit instead of violating that invariant or
    // manufacturing a second persisted document for a renamed duplicate.
    const duplicate=savedHashes.get(doc.sha256);
    if(duplicate){bindings.set(id,duplicate);report.documentBindings[id]=duplicate;stored.add(id);continue;}
    bindings.set(id,docId(id));report.documentBindings[id]=docId(id);savedHashes.set(doc.sha256,docId(id));
    const bytes=await dataset.readDocument(id),key=`${applicationId}/${id}`;released.set(key,bytes);
    await db.query("INSERT INTO documents(id,application_id,original_name,storage_key,content_type,size_bytes,sha256,uploaded_by,created_at) VALUES($1,$2,$3,$4,'application/pdf',$5,$6,$7,now())",[docId(id),applicationId,doc.filename,key,bytes.length,doc.sha256,access.displayName]);stored.add(id);
   }
   for(const id of boundary.savedIds.filter(id=>!boundary.activeIds.includes(id)))await db.query('INSERT INTO draft_document_removals(application_id,document_id,removed_by) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[applicationId,docId(id),userId]);
   for(const rejected of boundary.rejectedMatches)await db.query('INSERT INTO document_match_rejections(application_id,document_id,requirement_id,rejected_by) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[applicationId,docId(rejected.documentId),requirementId(rejected.requirementId),userId]);
   for(const id of stored)await db.query("UPDATE upload_batch_members SET state='saved',document_id=$3 WHERE application_id=$1 AND id=$2 AND state='pending'",[applicationId,id,docId(id)]);
   await db.query("UPDATE upload_batches SET state='finalized' WHERE application_id=$1 AND state='open'",[applicationId]);
   if(boundary.pendingIds.length){
    const batchId=`${prefix}-${boundary.id}`;
    await db.query("INSERT INTO upload_batches(id,application_id,user_id,manifest_hash,state) VALUES($1,$2,$3,$4,'open')",[batchId,applicationId,userId,sha256(boundary.pendingIds.join(','))]);
    for(const id of boundary.pendingIds){const doc=dataset.documents.find(d=>d.documentId===id)!;
     await db.query("INSERT INTO upload_batch_members(batch_id,id,application_id,name,sha256,state) VALUES($1,$2,$3,$4,$5,'pending')",[batchId,id,applicationId,doc.filename,doc.sha256]);}
   }
   if(boundary.message&&!(boundary.sourceCheckpoint===1&&boundary.message===dataset.request.initialMessage))await service.enqueueMessage(access,{clientMessageId:`boundary-${boundary.id}`,text:boundary.message});
   if(boundary.id==='budget_exhausted'){
    await db.query("UPDATE borrower_preparations SET state=jsonb_set(state,'{budget,limitMicros}',to_jsonb((state#>>'{budget,knownMicros}')::bigint+(state#>>'{budget,reservedMicros}')::bigint)) WHERE application_id=$1",[applicationId]);
   }
   if(boundary.id==='resumed_with_observations'){
    await db.query("UPDATE borrower_preparations SET state=jsonb_set(state,'{budget,limitMicros}',$2::jsonb) WHERE application_id=$1",[applicationId,JSON.stringify(options.budgetMicros)]);
    // A retry is a new authorized controller run, not a fabricated result/state.
    const previous=(await db.query('SELECT id FROM preparation_runs WHERE application_id=$1 ORDER BY created_at DESC LIMIT 1',[applicationId])).rows[0];
    if(previous){const inventory=await service.preparation.transaction(access,tx=>service.preparation.inventory(tx,applicationId));
     const id=randomUUID();await service.preparation.accept(access,{commandId:id,idempotencyKey:id,objective:'understand_and_assess',assessmentScope:'application',documentIds:inventory.documents.filter(d=>d.active).map(d=>d.documentId),requirementIds:inventory.requirements.map(r=>r.requirementId),origin:{kind:'borrower_request',conversationId:null,artifactId:null,domainEventId:id},uploadBatchId:null,expectedContentRevision:inventory.contentRevision,retryOf:previous.id});}
   }
   // Arrival snapshots deliberately precede worker completion. These are external
   // event boundaries, not prescriptions for the model's tool choices.
   const beforeWork=['upload_in_flight','clear_copy_saved','amendment_arrival','resumed_with_observations'].includes(boundary.id);
   await service.enqueueEvents(access);
   if(!beforeWork){
    const max=options.maxControllerCycles??24;
    for(let cycle=0;cycle<max;cycle++){
     const ran=await service.runOne(access,planner);
     const queued=(await db.query("SELECT id FROM preparation_runs WHERE application_id=$1 AND state='queued' ORDER BY created_at,id",[applicationId])).rows;
     for(const run of queued){
      try{await new PreparationWorker(service.preparation,options.planners.investigator(),tools,readBlob,options.worker).run(access,run.id);}
      catch(error){errors.push(`controller:${error instanceof Error?error.message:'failed'}`);}
     }
     await service.enqueueEvents(access);
     if(!ran.ran&&!queued.length)break;
     if(cycle===max-1)errors.push('controller_cycle_limit');
    }
   }
   if(boundary.id==='stale_result_rejected')errors.push('C-lifecycle:stale-worker-interleaving-requires-injected-worker-race');
   if(['identified_before_limit','budget_exhausted'].includes(boundary.id))errors.push('C-lifecycle:partial-publication-and-identification-pause-not-forced');
   const snapshot=await service.preparation.snapshot(access),inventory=await service.preparation.transaction(access,tx=>service.preparation.inventory(tx,applicationId));
   const runs=(await db.query('SELECT id,state,observations FROM preparation_runs WHERE application_id=$1 ORDER BY created_at,id',[applicationId])).rows;
   const observations=new Map<string,PageObservation>();for(const run of runs)for(const o of run.observations)observations.set(o.id,o);
   const messages=(await service.read(access)).filter(m=>m.text&&!capturedMessages.has(m.id)).map(m=>({id:m.id,text:m.text!}));messages.forEach(m=>capturedMessages.add(m.id));
   const borrowerMessages=(await db.query('SELECT id,body AS text FROM borrower_conversation_messages WHERE application_id=$1 ORDER BY sequence',[applicationId])).rows;
   const result=snapshot.currentResult;
   const pending=(await db.query("SELECT DISTINCT m.id FROM upload_batch_members m JOIN upload_batches b ON b.id=m.batch_id WHERE m.application_id=$1 AND m.state<>'saved'",[applicationId])).rows.map(r=>r.id as string);
   const findings=result?.requirements.flatMap(r=>r.checks.map(c=>({criterionId:criterionMap.get(c.criterionId)??c.criterionId,state:c.state,explanation:c.explanation,gap:r.gaps.find(g=>g.criterionId===c.criterionId)??null,citations:c.citationIds.map(id=>result.citations.find(c=>c.citationId===id)).filter(c=>!!c).map(c=>c.kind==='artifact'?{documentId:fixtureDoc(c.documentId),sha256:c.sha256,page:c.page,quote:c.quote}:c.kind==='structured_record'?{messageId:c.recordId,messageDigest:c.recordRevision,quote:borrowerMessages.find(m=>m.id===c.recordId)?.text}:{documentId:fixtureDoc(c.documentId),sha256:c.sha256,quote:c.quote})})))??[];
   const observed:BoundaryObservation={boundaryId:boundary.id,findings,messages,borrowerMessages,
    inspectedPages:[...observations.values()].filter(o=>['text','image','ocr'].includes(o.kind)).flatMap(o=>o.pages.filter(p=>o.kind==='image'||p.text.trim()&&(p.confidence===undefined||p.confidence>=80)).flatMap(p=>fixtureDocs(o.documentId).map(documentId=>({documentId,page:p.page})))),
    activeIds:inventory.documents.filter(d=>d.active).flatMap(d=>fixtureDocs(d.documentId)),pendingIds:pending,
    observations:[...observations.values()].map(o=>({id:o.id,digest:digest(o),documentId:fixtureDoc(o.documentId)})),
    reusedObservationIds:[...observations.keys()].filter(id=>prior?.observations.some(o=>o.id===id)&&runs.filter(r=>r.observations.some((o:PageObservation)=>o.id===id)).length>1),
    budget:snapshot.preparation!.budget,currentResultId:result?.resultId??null,runStates:runs.map(r=>r.state),errors,unauthorizedEffects:[]};
   const links=(await db.query('SELECT document_id FROM requirement_documents WHERE application_id=$1 AND unlinked_at IS NULL',[applicationId])).rows;
   if(links.length)observed.unauthorizedEffects.push('automatic_document_link');
   const review=options.reviewer?await options.reviewer({caseId:dataset.id,boundary,observation:observed,sourcePages:dataset.oracle.sourcePages,crossDocumentArithmetic:dataset.oracle.crossDocumentArithmetic}):undefined;
   const score=await scoreDatasetBoundary(dataset,boundary,observed,review,prior);report.boundaries.push({observation:observed,score});prior=observed;
   for(const [name,scoreValue] of Object.entries(score.scores))await options.observer.recordScore(context.trace,{scorerId:`dataset-${boundary.id}-${name}`,scorerVersion:'1',score:scoreValue});
   await options.onBoundary?.(observed,score);
  }
  const all=report.boundaries;
  report.compatibility=[
   {id:'C1',status:all.some(b=>b.score.errors.some(e=>e.startsWith('R2.chain:')))?'blocked':'requires_targeted_test',detail:'R2.chain alone opts into trusted no-amendments confirmation; documentary criteria remain mandatory.'},
   {id:'C2',status:'requires_targeted_test',detail:'Actual persisted observations and priorAssessment are available; focused-scope adversarial verification is separate.'},
   {id:'C3',status:'requires_targeted_test',detail:'Criterion truth states are checked; aggregate unknown truth-table tests remain controller-owned.'},
   {id:'C4',status:'requires_targeted_test',detail:'Semantic review must evaluate material limitations/conflicts; controller omission mutants are separate.'},
   {id:'C5',status:'requires_targeted_test',detail:'This admitted corpus is PDF-only; no non-PDF admission implied.'},
   {id:'C6',status:all.some(b=>b.score.criticalFailures.includes('budget_invariant'))?'blocked':'requires_targeted_test',detail:'Actual cumulative ledger checked. Fixture numeric fault amounts are not substituted for measured billing.'},
  ];
  const checks=[{id:'all-boundaries',passed:all.length===dataset.boundaries.length},{id:'evidence',passed:all.every(b=>!b.score.errors.length)},{id:'safety',passed:all.every(b=>!b.score.criticalFailures.length)},{id:'semantic-review',passed:all.every(b=>b.score.reviewComplete)}];
  return {caseId,completed:true,checks};
 }catch(error){executionFailure=error;throw error;}
 }});
 if(executionFailure)throw executionFailure;
 report.passed=evaluator.value.passed;return {...report,trace:evaluator.trace};
}
