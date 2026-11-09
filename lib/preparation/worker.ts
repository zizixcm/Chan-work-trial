import {EvidenceValidationError,validateMappingEvidence,validationDiagnostic,type ValidationDiagnostic} from './validation-diagnostics';
import {findingBaseline,priorFindings,mergeIncrementalFindings,type FindingBaseline} from './incremental-findings';
import {withToolActivity} from '../agents/activity';
import {AgentExecutionError} from '../agents/execution-error';
import {unresolvedEvidenceLimitations} from './evidence-limitations';
import {supportsAnalysis} from '../analysis/formats';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { digest } from '../preparation-pilot/contracts';
import { plannerActionSchema,type EvidenceTools,type PageObservation,type PreparationPlanner,type PlannerAction } from './actions';
import { parseCompletenessResult,processingQuestionSchema,evidenceCoverageSchema,type ProcessingResult } from './protocol';
import { deriveMappingActions } from './mapping';
import { processorMode } from './ownership';
import { PreparationService,type PreparationAccess,type PreparationInventory } from './service';

// Only fixed local validation messages become model feedback. Never expose raw
// database/provider exceptions or weaken the validator to accept a bad result.
const validationFeedback:Record<string,string>={
 'Invalid incremental criterion ledger':'Publish at most one changed finding per criterion, using exact inventory requirementId and criterionId values. Omitted criteria remain unchanged when safe, otherwise unknown.',
 'Invalid prior finding reference':'Reaffirm only IDs from reaffirmableCriterionIds, once each, and do not also supply a changed finding for that criterion.',
 'Positive finding needs source':'A met finding requires inspected documentary evidence with an observation ID, page and exact quote. Otherwise mark it unknown and provide a grounded gap.',
 'Unresolved finding needs grounded next action':'Every unknown or unmet finding requires a gap describing the missing evidence or clarification and the responsible borrower, lender or operator.',
 'Insufficient inspected coverage for absence':'Do not claim unmet from uninspected evidence. Read the remaining pages or use unknown with a gap explaining what remains unchecked.',
 'Evidence not inspected':'Cite only observation IDs and page numbers present in the supplied observations for an active document. Read the needed page first if absent.',
 'Fabricated text quote':'Cite an exact contiguous substring from the cited observation page text, preserving spaces, line breaks and punctuation. Prefer a short identifying excerpt; do not join distant passages or paraphrase them. If using visual evidence instead, cite its IMAGE observation ID with a faithful visual locator. If no source supports the judgment, publish unknown with evidence: [] and an explanatory gap.',
 'Low confidence OCR requires image verification':'Do not cite the low-confidence OCR observation, even after reading its image. Read the same page in image mode, then cite the IMAGE observation ID and page with a faithful visual description or locator. Reading an image does not upgrade the OCR observation. If visual evidence is unavailable or uncertain, publish unknown with evidence: [] and a gap explaining the limitation; unknown findings must not retain an unverified OCR citation.',
 'Inventory is not support':'Document structure, search hits and unavailable observations are not documentary support. Read the relevant page in text or image mode before citing it.',
 'Borrower confirmation is not authorized support for this criterion':'Borrower assertions support only a criterion explicitly configured with no_amendments confirmationPolicy, using its exact source message. Other criteria require documentary evidence or an unknown finding with a gap.',
 'Mapping target unavailable':'Use only active document IDs and borrower requirement IDs from the supplied inventory.',
 'Clear relevance needs identity, purpose, period and target support':'Clear mapping requires inspected support for identity, purpose, period and target, with no conflicts. Otherwise propose ambiguous relevance.',
 'Mapping support unavailable':'Mapping evidence must cite an inspected text, image or reliable OCR observation and exact page quote for the mapped document. Read the evidence first if needed.'
};
type Row=Record<string,any>;
export interface WorkerOptions {runLimitMicros:number;maxCalls:number;timeoutMs:number}
/** A bounded adaptive controller. Only planner-selected actions execute. No fixed read/match/verify sequence. */
export class PreparationWorker {
 constructor(private service:PreparationService,private planner:PreparationPlanner,private tools:EvidenceTools,private readBlob:(key:string)=>Promise<Uint8Array>,private options:WorkerOptions={runLimitMicros:100000,maxCalls:12,timeoutMs:30000}){
  if(planner.configurationDigest!==undefined&&!/^[a-f0-9]{64}$/.test(planner.configurationDigest))throw new Error('Invalid planner configuration digest');
  if(![options.runLimitMicros,options.maxCalls,options.timeoutMs,planner.maximumCallMicros].every(n=>Number.isSafeInteger(n)&&n>0))throw new Error('Invalid worker limits');
 }
 private async gate(db:PoolClient,access:PreparationAccess,runId:string,token?:string):Promise<Row>{
  const run=(await db.query('SELECT *,lease_until>now() AS lease_valid FROM preparation_runs WHERE id=$1 AND application_id=$2 AND user_id=$3 FOR UPDATE',[runId,access.applicationId,access.userId])).rows[0];
  const mode=await processorMode(db,access.applicationId);
  if(!run||mode.mode!=='adaptive'||String(run.execution_epoch)!==mode.epoch)throw new Error('Execution superseded');
  if(token&&(run.token!==token||!run.lease_valid||run.state!=='running'))throw new Error('Execution lease lost');
  const inventory=await this.service.inventory(db,access.applicationId);
  if(digest({inventory,actor:access.userId,epoch:mode.epoch,grant:run.request.authority.policyRevision})!==run.request.snapshot.inputFingerprint)throw new Error('Evidence changed');
  if(run.request.authority.policyRevision.startsWith('automatic:')){
   const pref=(await db.query('SELECT enabled,epoch::text FROM user_ai_preferences WHERE user_id=$1',[access.userId])).rows[0];
   if(!pref?.enabled||run.request.authority.policyRevision!==`automatic:${mode.epoch}:${pref.epoch}`)throw new Error('Automatic grant revoked');
  }
  return run;
 }
 async run(access:PreparationAccess,runId:string):Promise<void>{
  const token=randomUUID();
  // A configured generation must finish before another worker can reclaim its
  // lease. The overall five-minute execution deadline remains authoritative.
  const leaseMs=Math.max(90000,Math.min(this.options.timeoutMs,300000)+30000);
  await this.service.transaction(access,async db=>{
   const run=await this.gate(db,access,runId);
   if(!(run.state==='queued'||(run.state==='running'&&!run.lease_valid)))throw new Error('Run unavailable');
   if((await db.query("SELECT 1 FROM preparation_runs WHERE application_id=$1 AND id<>$2 AND state='running' AND lease_until>now()",[access.applicationId,runId])).rowCount)throw new Error('Application already executing');
   await db.query("UPDATE preparation_runs SET state='running',token=$2,lease_until=now()+($3*interval '1 millisecond'),revision=revision+1 WHERE id=$1",[runId,token,leaseMs]);
  });
  const started=Date.now();
  for(let call=0;call<this.options.maxCalls && Date.now()-started<300000;call++){
   const stepId=randomUUID();let context:Row;
   try{context=await this.service.transaction(access,async db=>{
    const run=await this.gate(db,access,runId,token),prep=(await db.query('SELECT * FROM borrower_preparations WHERE id=$1 FOR UPDATE',[run.preparation_id])).rows[0];
    const budget=prep.state.budget,reservation=this.planner.maximumCallMicros;
    const count=(await db.query('SELECT count(*)::int n FROM preparation_steps WHERE run_id=$1',[runId])).rows[0].n;
    if(count>=this.options.maxCalls)throw new Error('Execution limit reached');
    if(Number(run.spent_micros)+reservation>this.options.runLimitMicros||budget.knownMicros+budget.reservedMicros+reservation>budget.limitMicros)throw new Error('Budget exhausted');
    const assertions=(await db.query('SELECT id,payload,answer FROM preparation_questions WHERE preparation_id=$1 AND answer IS NOT NULL ORDER BY id',[prep.id])).rows.map(q=>({questionId:q.id,question:q.payload.prompt,answer:q.answer.text,attributedTo:q.answer.userId}));
    budget.reservedMicros+=reservation;
    await db.query('UPDATE borrower_preparations SET state=$2 WHERE id=$1',[prep.id,prep.state]);
    await db.query("INSERT INTO preparation_steps(run_id,id,input_hash,status,reserved_micros) VALUES($1,$2,$3,'reserved',$4)",[runId,stepId,digest({request:run.request,observations:run.observations,assertions}),reservation]);
    await db.query("UPDATE preparation_runs SET spent_micros=spent_micros+$2,lease_until=now()+($3*interval '1 millisecond') WHERE id=$1",[runId,reservation,leaseMs]);
    const mappingProposals=(await db.query('SELECT payload FROM preparation_mapping_proposals WHERE run_id=$1 ORDER BY id',[runId])).rows.map(p=>p.payload);
    const borrowerMessages=(await db.query('SELECT id,body AS text,sequence::text FROM borrower_conversation_messages WHERE application_id=$1 AND borrower_user_id=$2 ORDER BY sequence DESC LIMIT 40',[access.applicationId,access.userId])).rows.reverse();
    const priorAssessment=(await db.query("SELECT payload FROM preparation_stream WHERE application_id=$1 AND user_id=$2 AND payload->>'type'='run.result_committed' ORDER BY sequence DESC LIMIT 1",[access.applicationId,access.userId])).rows[0]?.payload;
    const priorResult=priorAssessment?(await db.query('SELECT payload FROM preparation_results WHERE id=$1 AND application_id=$2 AND user_id=$3',[priorAssessment.data.resultId,access.applicationId,access.userId])).rows[0]?.payload:undefined;
    const baseline=priorResult?(await db.query("SELECT s.output->'findingBaseline' AS baseline FROM preparation_steps s JOIN preparation_runs r ON r.id=s.run_id WHERE r.application_id=$1 AND r.user_id=$2 AND s.output->>'resultId'=$3 LIMIT 1",[access.applicationId,access.userId,priorResult.resultId])).rows[0]?.baseline:undefined;
    const candidates=priorFindings(run.inventory,priorResult,run.observations,borrowerMessages).map(f=>f.criterionId);
    const reusable=baseline&&digest(baseline)===digest(findingBaseline(run.inventory,borrowerMessages,this.planner.configurationDigest,run.observations))?candidates:[];
    const feedback=(await db.query("SELECT DISTINCT output->>'feedback' AS feedback FROM preparation_steps WHERE run_id=$1 AND output ? 'feedback'",[runId])).rows.map(row=>row.feedback).join(' ' );
    return {...run,findingBaseline:baseline,reusableCriterionIds:reusable,reaffirmableCriterionIds:candidates,actionFeedback:feedback||undefined,executionBudget:{callsRemaining:this.options.maxCalls-count,runRemainingMicros:this.options.runLimitMicros-Number(run.spent_micros),applicationRemainingMicros:budget.limitMicros-budget.knownMicros-budget.reservedMicros+reservation,timeRemainingMs:Math.max(0,300000-(Date.now()-started))},assertions,mappingProposals,borrowerMessages,priorAssessment:priorResult?{...priorResult,freshness:'historical'}:undefined};
   });}catch(error){
    if(error instanceof Error&&(error.message==='Budget exhausted'||error.message==='Execution limit reached')){await this.block(access,runId,token,error.message==='Budget exhausted'?'budget_exhausted':'execution_limit');return;}
    throw error;
   }
   let response:Awaited<ReturnType<PreparationPlanner['decide']>>;
   try{
    const inventory=context.inventory as PreparationInventory;
    response=await this.planner.decide({actionFeedback:context.actionFeedback,executionBudget:context.executionBudget,objective:context.request.objective,goal:context.delegation_goal??context.request.objective,scope:{requirementIds:context.request.requirements.map((r:{requirementId:string})=>r.requirementId),documentIds:context.request.documents.map((d:{documentId:string})=>d.documentId)},inventory:{application:inventory.application,documents:inventory.documents.map(({documentId,name,contentType,active})=>({documentId,name,contentType,active})),requirements:inventory.requirements.filter(r=>r.collection==='borrower'),pendingUploads:inventory.pendingUploads},priorAssessment:context.priorAssessment,reusableCriterionIds:context.reusableCriterionIds,reaffirmableCriterionIds:context.reaffirmableCriterionIds,borrowerMessages:context.borrowerMessages,observations:context.observations,mappingProposals:context.mappingProposals,assertions:context.assertions},AbortSignal.timeout(Math.max(1,Math.min(this.options.timeoutMs,300000-(Date.now()-started)))),action=>this.executeAction(access,runId,token,stepId,context,plannerActionSchema.parse(action)),{correlation:{applicationId:access.applicationId,userId:access.userId,investigationRunId:runId,stepId,configurationDigest:this.planner.configurationDigest,evidenceRevision:inventory.contentRevision},parent:context.parent_trace_ref??undefined,recordTrace:trace=>this.service.transaction(access,async db=>{await this.gate(db,access,runId,token);await db.query('UPDATE preparation_steps SET trace_ref=$3 WHERE run_id=$1 AND id=$2',[runId,stepId,trace]);})});
   }catch(error){
    await this.settleCost(access,context.preparation_id,runId,stepId,error instanceof AgentExecutionError?error.actualMicros:null);
    if(error instanceof AgentExecutionError&&error.reasonCode==='tool_or_validation_limit'&&error.actualMicros!==null&&await this.validationRetry(access,runId,token,stepId,error))continue;
    try{await this.block(access,runId,token,error instanceof AgentExecutionError?error.reasonCode:'provider_outcome_unknown');}catch{/* a native terminal tool may already have committed; retain its result and settled accounting */}return;
   }
   await this.settleCost(access,context.preparation_id,runId,stepId,response.actualMicros);
   let action:PlannerAction;try{action=plannerActionSchema.parse(response.action);}catch{await this.block(access,runId,token,'invalid_model_output');return;}
   if(response.executed){if(action.kind==='ask'||action.kind==='assess')return;continue;}
   try{const outcome=await this.executeAction(access,runId,token,stepId,context,action);if(outcome.terminal)return;}
   catch(error){if(response.actualMicros!==null&&await this.validationRetry(access,runId,token,stepId,error))continue;try{await this.block(access,runId,token,'tool_or_validation_limit');}catch{}return;}
  }
  await this.block(access,runId,token,'execution_limit');
 }
 private async validationRetry(access:PreparationAccess,runId:string,token:string,stepId:string,error:unknown):Promise<boolean>{
  const diagnostic=error instanceof Error?error.message:'',feedback=Object.hasOwn(validationFeedback,diagnostic)?validationFeedback[diagnostic]:undefined;
  if(!feedback)return false;
  return this.service.transaction(access,async db=>{
   await this.gate(db,access,runId,token);
   const count=(await db.query("SELECT count(*)::int n FROM preparation_steps WHERE run_id=$1 AND output->>'validationRejected'='true'",[runId])).rows[0].n;
   await db.query("UPDATE preparation_steps SET status='rejected',output=$3 WHERE run_id=$1 AND id=$2",[runId,stepId,{validationRejected:true,diagnostic,feedback,...(validationDiagnostic(error)?{validationDiagnostic:validationDiagnostic(error)}:{})}]);
   // Two correction opportunities per durable run, also bounded by its normal
   // call/time/money limits. A third invalid result is left blocked for review.
   return count<2;
  });
 }
 private async executeAction(access:PreparationAccess,runId:string,token:string,stepId:string,context:Row,action:PlannerAction){
  const documentName='documentId' in action?(context.inventory as PreparationInventory).documents.find(d=>d.documentId===action.documentId&&d.active)?.name:undefined;
  return withToolActivity(this.service,access,{actor:'investigation',runId,token,kind:action.kind,documentName},()=>this.executeTrackedAction(access,runId,token,stepId,context,action));
 }
 private async executeTrackedAction(access:PreparationAccess,runId:string,token:string,stepId:string,context:Row,action:PlannerAction){
    if(action.kind==='propose_mapping'){await this.proposeMapping(access,runId,token,stepId,action);return {terminal:false};}
    if(action.kind==='ask'){await this.ask(access,runId,token,stepId,action);return {terminal:true};}
    if(action.kind==='assess'){await this.assess(access,runId,token,stepId,action,context.borrowerMessages??[],context.priorAssessment,context.findingBaseline);return {terminal:true};}
    const document=(context.inventory as PreparationInventory).documents.find(d=>d.documentId===action.documentId&&d.active);
    if(!document)throw new Error('Document outside active inventory');
    await this.service.transaction(access,db=>this.gate(db,access,runId,token));
    // Reuse an unchanged observation before invoking the reader again. Older
    // inventory observations predate actionKey but are still safe to reuse.
    const prior=(context.observations as PageObservation[]).find(o=>o.documentId===document.documentId&&o.sha256===document.sha256&&(o.actionKey===digest(action)||(action.kind==='inspect_document'&&o.kind==='inventory')));
    let observation:PageObservation,reused=!!prior;
    if(prior)observation=prior;
    else try{
     if(!supportsAnalysis(document.contentType))throw Error('Unsupported document format');
     const bytes=await this.readBlob(document.storageKey);
     observation=action.kind==='inspect_document'?await this.tools.inspect(bytes,document.documentId,document.sha256,document.contentType):action.kind==='search_evidence'?await this.tools.search!(bytes,document.documentId,document.sha256,action.query,action.pages,document.contentType):await this.tools.read(bytes,document.documentId,document.sha256,action.pages,action.mode,document.contentType);
    }catch{
     observation={id:randomUUID(),documentId:document.documentId,sha256:document.sha256,kind:'unavailable',pageCount:0,pages:[],actionKey:digest(action),limitations:['This reader action could not inspect the evidence within its supported format/size/time bounds. Try another reading mode or request a supported, readable export; this is not proof of absence.']};
    }
    if(!prior)observation={...observation,actionKey:digest(action)};
    let feedback:string|undefined;
    await this.service.transaction(access,async db=>{
     const run=await this.gate(db,access,runId,token);
     const duplicate=(run.observations as PageObservation[]).find(o=>o.documentId===observation.documentId&&o.sha256===observation.sha256&&o.kind===observation.kind&&o.query===observation.query&&(o.kind!=='unavailable'||o.actionKey===observation.actionKey)&&digest(o.searchedPages??[])===digest(observation.searchedPages??[])&&digest(o.pages)===digest(observation.pages));
     if(duplicate){observation=duplicate;reused=true;}else run.observations.push(observation);
     if(reused)feedback=action.kind==='inspect_document'?'Document structure is already known; this existing observation was reused. Read relevant pages or search the document content next. Repeating inspection adds no evidence.':'This unchanged evidence was already read and the existing observation was reused. Choose a different page, query or reading mode if needed, or assess the evidence already available.';
     const updated=(await db.query('UPDATE preparation_runs SET observations=$2,revision=revision+1 WHERE id=$1 RETURNING revision::text',[runId,JSON.stringify(run.observations)])).rows[0];
     await db.query("UPDATE preparation_steps SET status='completed',output=$3 WHERE run_id=$1 AND id=$2",[runId,stepId,{kind:action.kind,observationId:observation.id,reused,...(feedback?{feedback}:{})}]);
     await this.service.appendEvent(db,access,{schemaVersion:'processing-event.v1',type:'run.progress',runId,runRevision:updated.revision,artifactId:run.request.origin.artifactId,state:'running',inputFingerprint:run.request.snapshot.inputFingerprint,data:{activityCode:'reviewing_evidence',intakeRef:null,affectedRequirementIds:[],inspectedCount:run.observations.length,limitations:observation.limitations,nextPollAfterMs:1000}});
    });
    return {terminal:false,activityFailed:observation.kind==='unavailable',observationId:observation.id,limitations:observation.limitations,reused,...(feedback?{feedback}:{})};
 }
 private async settleCost(access:PreparationAccess,prepId:string,runId:string,stepId:string,actual:number|null){
  await this.service.transaction(access,async db=>{
   const prep=(await db.query('SELECT state FROM borrower_preparations WHERE id=$1 FOR UPDATE',[prepId])).rows[0],step=(await db.query('SELECT * FROM preparation_steps WHERE run_id=$1 AND id=$2 FOR UPDATE',[runId,stepId])).rows[0];
   if(step.cost_settled)return;
   const budget=prep.state.budget;
   if(actual===null){budget.unknownCost=true;}else{if(!Number.isSafeInteger(actual)||actual<0||actual>Number(step.reserved_micros))throw new Error('Provider exceeded reservation');budget.reservedMicros-=Number(step.reserved_micros);budget.knownMicros+=actual;}
   if(actual!==null)await db.query('UPDATE preparation_runs SET spent_micros=spent_micros-$2+$3 WHERE id=$1',[runId,Number(step.reserved_micros),actual]);
   await db.query('UPDATE borrower_preparations SET state=$2 WHERE id=$1',[prepId,prep.state]);await db.query("UPDATE preparation_steps SET cost_settled=true,status=CASE WHEN status='reserved' THEN 'responded' ELSE status END WHERE run_id=$1 AND id=$2",[runId,stepId]);
  });
 }
 private async block(access:PreparationAccess,runId:string,token:string,reasonCode:string){await this.service.transaction(access,async db=>{
  const run=await this.gate(db,access,runId,token);const updated=(await db.query("UPDATE preparation_runs SET state='waiting_input',revision=revision+1,token=NULL,lease_until=NULL WHERE id=$1 RETURNING revision::text",[runId])).rows[0];
  const prep=(await db.query('SELECT state FROM borrower_preparations WHERE id=$1 FOR UPDATE',[run.preparation_id])).rows[0];prep.state.obligations.push({id:randomUUID(),owner:'operator',status:'open',resumeTrigger:reasonCode});await db.query('UPDATE borrower_preparations SET state=$2 WHERE id=$1',[run.preparation_id,prep.state]);
  await this.service.appendEvent(db,access,{schemaVersion:'processing-event.v1',type:'run.needs_input',runId,runRevision:updated.revision,artifactId:run.request.origin.artifactId,state:'waiting_input',inputFingerprint:run.request.snapshot.inputFingerprint,data:{reasonCode,requiredActor:'operator',question:null}});
 });}
 private async ask(access:PreparationAccess,runId:string,token:string,stepId:string,action:Extract<PlannerAction,{kind:'ask'}>){await this.service.transaction(access,async db=>{
  const run=await this.gate(db,access,runId,token);if(action.requirementIds.some(id=>!run.inventory.requirements.some((r:{requirementId:string})=>r.requirementId===id)))throw new Error('Question scope invalid');
  const id=randomUUID(),question=processingQuestionSchema.parse({schemaVersion:'processing-question.v1',questionId:id,questionRevision:'1',preparationId:run.preparation_id,dependencyFingerprint:run.request.snapshot.inputFingerprint,affectedRequirementIds:action.requirementIds,requiredActor:'borrower',blocking:true,prompt:action.prompt,answerSchema:{kind:'attributed_text',maxLength:4000},allowedActionIds:[id]});
  await db.query('INSERT INTO preparation_questions(id,application_id,user_id,preparation_id,run_id,payload) VALUES($1,$2,$3,$4,$5,$6)',[id,access.applicationId,access.userId,run.preparation_id,runId,question]);
  const prep=(await db.query('SELECT state FROM borrower_preparations WHERE id=$1 FOR UPDATE',[run.preparation_id])).rows[0];prep.state.questionRefs.push({id,revision:'1'});prep.state.obligations.push({id,owner:'borrower',status:'open',resumeTrigger:'question_answer'});await db.query('UPDATE borrower_preparations SET state=$2 WHERE id=$1',[run.preparation_id,prep.state]);
  const updated=(await db.query("UPDATE preparation_runs SET state='waiting_input',revision=revision+1,token=NULL,lease_until=NULL WHERE id=$1 RETURNING revision::text",[runId])).rows[0];
  await db.query("UPDATE preparation_steps SET status='completed',output=$3 WHERE run_id=$1 AND id=$2",[runId,stepId,{kind:'ask',questionId:id}]);
  await this.service.appendEvent(db,access,{schemaVersion:'processing-event.v1',type:'run.needs_input',runId,runRevision:updated.revision,artifactId:run.request.origin.artifactId,state:'waiting_input',inputFingerprint:run.request.snapshot.inputFingerprint,data:{reasonCode:'clarification_required',requiredActor:'borrower',question}});
 });}
 private async proposeMapping(access:PreparationAccess,runId:string,token:string,stepId:string,action:Extract<PlannerAction,{kind:'propose_mapping'}>){await this.service.transaction(access,async db=>{
  const run=await this.gate(db,access,runId,token),inventory=run.inventory as PreparationInventory;
  const document=inventory.documents.find(d=>d.documentId===action.documentId&&d.active),requirement=inventory.requirements.find(r=>r.requirementId===action.requirementId&&r.collection==='borrower');
  if(!document||!requirement)throw new Error('Mapping target unavailable');
  if(action.relevance==='clear'&&(action.conflicts.length||Object.values(action.basis).some(s=>!s.length)))throw new Error('Clear relevance needs identity, purpose, period and target support');
  for(const [basis,evidence] of Object.entries(action.basis))for(const [index,e] of evidence.entries()){
   validateMappingEvidence(run.observations as PageObservation[],document,e,basis as ValidationDiagnostic['basis'],index);
  }
  const id=randomUUID();await db.query('INSERT INTO preparation_mapping_proposals VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,access.applicationId,access.userId,runId,document.documentId,requirement.requirementId,run.request.snapshot.inputFingerprint,{...action,configurationDigest:this.planner.configurationDigest??null}]);
  await db.query("UPDATE preparation_steps SET status='completed',output=$3 WHERE run_id=$1 AND id=$2",[runId,stepId,{kind:'propose_mapping',proposalId:id}]);
 });}
 private async assess(access:PreparationAccess,runId:string,token:string,stepId:string,action:Extract<PlannerAction,{kind:'assess'}>,borrowerMessages:{id:string;text:string;sequence:string}[],priorAssessment?:ProcessingResult,baseline?:FindingBaseline){await this.service.transaction(access,async db=>{
  const run=await this.gate(db,access,runId,token),inventory=run.inventory as PreparationInventory,observations=run.observations as PageObservation[];
  const currentMessages=(await db.query('SELECT id,body AS text,sequence::text FROM borrower_conversation_messages WHERE application_id=$1 AND borrower_user_id=$2 ORDER BY sequence DESC LIMIT 40',[access.applicationId,access.userId])).rows.reverse();
  if(digest(currentMessages)!==digest(borrowerMessages))throw Error('Borrower context changed during investigation');
  const merged=mergeIncrementalFindings({action,inventory,prior:priorAssessment,observations,messages:borrowerMessages,baseline,configurationDigest:this.planner.configurationDigest});
  const findings=merged.findings;
  const limitations=[...new Set([...merged.limitations,...unresolvedEvidenceLimitations(observations)])];
  const coveragePayload=evidenceCoverageSchema.parse({schemaVersion:'evidence-coverage.v1',id:runId,revision:String(run.revision),applicationId:access.applicationId,preparationId:run.preparation_id,inventoryFingerprint:digest(inventory),completeInventory:true,pendingUploads:inventory.pendingUploads,documents:inventory.documents.map(d=>{
   const seen=observations.filter(o=>o.documentId===d.documentId&&o.sha256===d.sha256);return {documentId:d.documentId,sha256:d.sha256,active:d.active,pageCount:seen.find(o=>o.pageCount>0)?.pageCount??null,inspectedPages:[...new Set(seen.filter(o=>o.kind!=='inventory'&&o.kind!=='search').flatMap(o=>o.pages.map(p=>p.page)))],observationIds:seen.map(o=>o.id),limitations:seen.flatMap(o=>o.limitations)};
  }),limitations});
  // Conservative absence boundary: all active pages must have usable observations.
  // Future criterion-scoped coverage can reduce this only with an evaluated contract.
  const absenceSupported=!inventory.pendingUploads && coveragePayload.documents.filter(d=>d.active).every(d=>d.pageCount!==null&&d.inspectedPages.length===d.pageCount&&Array.from({length:d.pageCount},(_,i)=>i+1).every(page=>observations.some(o=>o.kind!=='search'&&o.kind!=='inventory'&&o.documentId===d.documentId&&o.pages.some(p=>p.page===page&&(o.kind==='image'||(p.text.trim().length>0&&(p.confidence===undefined||p.confidence>=80)))))));
  const citations:ProcessingResult['citations']=[],coverage={id:coveragePayload.id,revision:coveragePayload.revision};
  const requirementResults=inventory.requirements.filter(r=>r.collection==='borrower').map(r=>{
   const requirementFindings=findings.filter(f=>f.requirementId===r.requirementId);
   const checks=requirementFindings.map(f=>{
    if(f.state==='met'&&!f.evidence.length&&!f.assertionEvidence?.length)throw new Error('Positive finding needs source');
    if(f.state!=='met'&&!f.gap)throw new Error('Unresolved finding needs grounded next action');
    if(f.state==='unmet'&&!absenceSupported)throw new EvidenceValidationError('Insufficient inspected coverage for absence',{code:'absence_coverage_incomplete',pendingUploads:inventory.pendingUploads,activeDocuments:coveragePayload.documents.filter(d=>d.active).length,unknownPageCounts:coveragePayload.documents.filter(d=>d.active&&d.pageCount===null).length});
    const citationIds=f.evidence.map(e=>{
     const observation=observations.find(o=>o.id===e.observationId),page=observation?.pages.find(p=>p.page===e.page);
     if(!observation||!page||!inventory.documents.some(d=>d.documentId===observation.documentId&&d.sha256===observation.sha256&&d.active))throw new Error('Evidence not inspected');
     // Visual quotations are model observations, not independently extracted text.
     // Use a bounded page locator, retaining the exact rendered image artifact for review.
     if(observation.kind==='ocr'&&(page.confidence??0)<80)throw new Error('Low confidence OCR requires image verification');
     if((observation.kind==='text'||observation.kind==='ocr')&&!page.text.includes(e.quote))throw new Error('Fabricated text quote');
     if((observation.kind==='inventory'||observation.kind==='search'||observation.kind==='unavailable'))throw new Error('Inventory is not support');
     const id=randomUUID();citations.push({kind:'artifact',citationId:id,documentId:observation.documentId,sha256:observation.sha256,evidenceArtifactId:observation.id,artifactDigest:digest(observation),page:e.page,quote:e.quote,...(page.location?{sourceLocation:page.location}:{})});return id;
    });
    for(const assertion of f.assertionEvidence??[]){
     const criterion=r.criteria.find(c=>c.id===f.criterionId),source=borrowerMessages.find(m=>m.id===assertion.messageId);
     if(criterion?.confirmationPolicy!=='no_amendments'||assertion.claim!=='no_amendments'||!source||!source.text.includes(assertion.quote)||f.gap?.kind==='conflict')throw Error('Borrower confirmation is not authorized support for this criterion');
     const citationId=randomUUID();citations.push({kind:'structured_record',citationId,recordId:source.id,recordRevision:digest(source.text),field:'borrower_confirmation:no_amendments'});citationIds.push(citationId);
    }
    return {criterionId:f.criterionId,state:f.state,reasonCode:f.reasonCode,explanation:f.explanation,citationIds};
   });
   return {requirementId:r.requirementId,definitionRevision:r.definitionRevision,evidenceRevision:r.evidenceRevision,assessment:checks.some(c=>c.state==='unknown')?'unknown' as const:checks.some(c=>c.state==='unmet')?'incomplete' as const:'appears_complete' as const,checks,gaps:requirementFindings.filter(f=>f.gap).map(f=>({criterionId:f.criterionId,...f.gap!,coverageRef:coverage}))};
  });
  // Recovery/accounting bookkeeping can advance preparation revision without
  // changing evidence. gate above still fences the immutable request snapshot.
  const prep=(await db.query('SELECT state,revision FROM borrower_preparations WHERE id=$1 FOR UPDATE',[run.preparation_id])).rows[0];
  const id=randomUUID(),result=parseCompletenessResult({schemaVersion:'processing-result.v1',applicationId:access.applicationId,resultId:id,resultRevision:'1',preparationId:run.preparation_id,preparationRevision:String(prep.revision),assessmentScope:run.request.assessmentScope,inputFingerprint:digest({inventory,observations,configurationDigest:this.planner.configurationDigest??null}),dependencyFingerprint:digest({inventory,observations,configurationDigest:this.planner.configurationDigest??null}),freshness:'current',documents:inventory.documents.filter(d=>d.active).map(({documentId,sha256})=>({documentId,sha256})),requirements:requirementResults,coverageRef:coverage,citations,limitations:limitations.map(detail=>({requirementId:null,criterionId:null,reasonCode:'inspection_limit',detail,citationIds:[],coverageRef:coverage,owner:'operator'})),conflicts:findings.filter(f=>f.gap?.kind==='conflict').map(f=>({requirementId:f.requirementId,criterionId:f.criterionId,reasonCode:'evidence_conflict',detail:f.gap!.description,citationIds:requirementResults.find(r=>r.requirementId===f.requirementId)!.checks.find(c=>c.criterionId===f.criterionId)!.citationIds,coverageRef:coverage,owner:f.gap!.owner})),allowedNextActions:[]});
  result.allowedNextActions=await deriveMappingActions(db,result,runId);
  await db.query('INSERT INTO preparation_coverage VALUES($1,$2,$3,$4,$5)',[coveragePayload.id,coveragePayload.revision,access.applicationId,access.userId,coveragePayload]);
  await db.query('INSERT INTO preparation_results VALUES($1,1,$2,$3,$4,$5)',[id,access.applicationId,access.userId,run.preparation_id,result]);
  prep.state.currentResultRef={id,revision:'1'};
  prep.state.obligations=findings.filter(f=>f.gap).map(f=>({id:`${run.preparation_id}:${f.criterionId}`,owner:f.gap!.owner,status:'open',resumeTrigger:f.gap!.kind}));
  await db.query('UPDATE borrower_preparations SET state=$2 WHERE id=$1',[run.preparation_id,prep.state]);
  const state=findings.some(f=>f.state==='unknown')?'partial':'succeeded';const updated=(await db.query('UPDATE preparation_runs SET state=$2,revision=revision+1,token=NULL,lease_until=NULL WHERE id=$1 RETURNING revision::text',[runId,state])).rows[0];
  await db.query("UPDATE preparation_steps SET status='completed',output=$3 WHERE run_id=$1 AND id=$2",[runId,stepId,{kind:'assess',resultId:id,resultRevision:'1',findingBaseline:findingBaseline(inventory,borrowerMessages,this.planner.configurationDigest,observations),changedCriterionIds:action.findings.map(f=>f.criterionId),retainedCriterionIds:merged.retainedCriterionIds}]);
  await this.service.appendEvent(db,access,{schemaVersion:'processing-event.v1',type:'run.result_committed',runId,runRevision:updated.revision,artifactId:run.request.origin.artifactId,state,inputFingerprint:result.dependencyFingerprint,data:{terminal:true,resultId:id,resultRevision:'1',coverageRef:coverage}});
 });}
}
