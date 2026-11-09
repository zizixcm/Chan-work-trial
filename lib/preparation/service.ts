import {packageCompleteness} from './completeness';
import { randomUUID } from 'node:crypto';
import type { Pool,PoolClient } from 'pg';
import { z } from 'zod';
import { digest } from '../preparation-pilot/contracts';
import { processorMode } from './ownership';
import { applicationEventSchema,parseCompletenessRequest,parseCompletenessResult,preparationSnapshotSchema,processingQuestionSchema,evidenceCoverageSchema,type ProcessingRequest } from './protocol';
export interface PreparationAccess {applicationId:string;userId:string}
const identifier=z.string().min(1).max(256);
export const preparationIntentSchema=z.strictObject({commandId:identifier,idempotencyKey:identifier,objective:z.enum(['understand_and_assess','resolve_gap']),goal:z.string().trim().min(1).max(2000).optional(),assessmentScope:z.enum(['affected_requirements','application']),documentIds:z.array(identifier),requirementIds:z.array(identifier),origin:z.strictObject({kind:z.enum(['borrower_request','chat_upload','portal_upload','question_answer']),conversationId:identifier.nullable(),artifactId:identifier.nullable(),domainEventId:identifier}),uploadBatchId:identifier.nullable(),expectedContentRevision:identifier,retryOf:identifier.nullable()});
export type PreparationIntent=z.infer<typeof preparationIntentSchema>;
export interface InventoryDocument {documentId:string;seriesId:string;version:number;sha256:string;name:string;contentType:string;active:boolean;storageKey:string}
export interface PreparationInventory {application:{borrowerName:string;propertyName:string;address:string;transactionType:string};contentRevision:string;documents:InventoryDocument[];requirements:{requirementId:string;definitionRevision:string;evidenceRevision:string;title:string;owner:string;period:string;purpose:string;applicability:string;collection:string;stage:string|null;subject:string|null;criteria:{id:string;description:string;confirmationPolicy?:'no_amendments'}[]}[];pendingUploads:boolean}
export interface PreparationReceipt {runId:string;runRevision:string;artifactId:string|null;acceptedAt:string;state:string;inputFingerprint:string}
export class PreparationService {
 constructor(readonly database:Pool){}
 async transaction<T>(access:PreparationAccess,work:(db:PoolClient)=>Promise<T>):Promise<T>{
  const db=await this.database.connect();try{await db.query('BEGIN');await db.query('SELECT id FROM applications WHERE id=$1 FOR UPDATE',[access.applicationId]);
   if(!(await db.query("SELECT 1 FROM application_memberships WHERE application_id=$1 AND user_id=$2 AND active AND role='borrower' FOR SHARE",[access.applicationId,access.userId])).rowCount)throw new Error('Application unavailable');
   const value=await work(db);await db.query('COMMIT');return value;
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
 }
 async inventory(db:PoolClient,applicationId:string):Promise<PreparationInventory>{
  const app=(await db.query('SELECT content_revision::text,borrower_name,property_name,address,transaction_type FROM applications WHERE id=$1',[applicationId])).rows[0];
  const documents=(await db.query(`SELECT d.*,NOT EXISTS(SELECT 1 FROM draft_document_removals x WHERE x.application_id=d.application_id AND x.document_id=d.id AND x.restored_at IS NULL) AND NOT EXISTS(SELECT 1 FROM documents x WHERE x.application_id=d.application_id AND x.replaces_document_id=d.id) AS active FROM documents d WHERE d.application_id=$1 ORDER BY d.id`,[applicationId])).rows.map(d=>({documentId:d.id,seriesId:d.series_id,version:d.version_number,sha256:d.sha256,name:d.original_name,contentType:d.content_type,active:d.active,storageKey:d.storage_key}));
  const requirements=(await db.query("SELECT r.id,r.title,r.owner,r.period,r.purpose,r.applicability,r.collection,r.stage,s.label AS subject,r.criteria,r.criterion_confirmation_policy,r.definition_revision::text,r.evidence_revision::text FROM requirements r LEFT JOIN application_subjects s ON s.id=r.subject_id AND s.application_id=r.application_id WHERE r.application_id=$1 AND r.lifecycle='active' ORDER BY r.id",[applicationId])).rows.map(r=>({requirementId:r.id,title:r.title,owner:r.owner,period:r.period,purpose:r.purpose,applicability:r.applicability,collection:r.collection,stage:r.stage,subject:r.subject,definitionRevision:r.definition_revision,evidenceRevision:r.evidence_revision,criteria:(r.criteria as string[]).map((description,index)=>({id:`${r.id}:criterion:${index+1}`,description,...(r.criterion_confirmation_policy?.[`${r.id}:criterion:${index+1}`]==='no_amendments'?{confirmationPolicy:'no_amendments' as const}:{})}))}));
  const pending=(await db.query("SELECT 1 FROM upload_batches b WHERE b.application_id=$1 AND (b.state='open' OR EXISTS(SELECT 1 FROM upload_batch_members m WHERE m.batch_id=b.id AND m.state<>'saved')) LIMIT 1",[applicationId])).rowCount;
  return {application:{borrowerName:app.borrower_name,propertyName:app.property_name,address:app.address,transactionType:app.transaction_type},contentRevision:app.content_revision,documents,requirements,pendingUploads:!!pending};
 }
 async accept(access:PreparationAccess,value:unknown):Promise<PreparationReceipt>{
  const input=preparationIntentSchema.parse(value),payloadHash=digest(input);
  return this.transaction(access,async db=>{
   const prior=(await db.query('SELECT payload_hash,run_id FROM preparation_commands WHERE application_id=$1 AND user_id=$2 AND idempotency_key=$3',[access.applicationId,access.userId,input.idempotencyKey])).rows[0];
   if(prior){if(prior.payload_hash!==payloadHash)throw new Error('Idempotency conflict');return this.receipt(db,access,prior.run_id);}
   const mode=await processorMode(db,access.applicationId);if(mode.mode!=='adaptive')throw new Error('Adaptive processing is not enabled');
   const automatic=['chat_upload','portal_upload'].includes(input.origin.kind);
   const pref=(await db.query('SELECT enabled,epoch::text FROM user_ai_preferences WHERE user_id=$1',[access.userId])).rows[0];
   if(automatic && !pref?.enabled)throw new Error('Automatic processing disabled');
   const grant=automatic?`automatic:${mode.epoch}:${pref.epoch}`:`explicit:${mode.epoch}`;
   const inventory=await this.inventory(db,access.applicationId);if(inventory.contentRevision!==input.expectedContentRevision)throw new Error('Evidence changed; refresh before retry');
   if(input.documentIds.some(id=>!inventory.documents.some(d=>d.documentId===id))||input.requirementIds.some(id=>!inventory.requirements.some(r=>r.requirementId===id)))throw new Error('Input unavailable');
   if(input.origin.conversationId && !(await db.query('SELECT 1 FROM borrower_conversations WHERE id=$1 AND application_id=$2 AND borrower_user_id=$3',[input.origin.conversationId,access.applicationId,access.userId])).rowCount)throw new Error('Origin unavailable');
   if(input.uploadBatchId && !(await db.query('SELECT 1 FROM upload_batches WHERE id=$1 AND application_id=$2 AND user_id=$3',[input.uploadBatchId,access.applicationId,access.userId])).rowCount)throw new Error('Upload unavailable');
   // Request/answer/card ownership is validated by the trusted chat adapter before this internal call.
   let prep=(await db.query('SELECT * FROM borrower_preparations WHERE application_id=$1 AND user_id=$2 FOR UPDATE',[access.applicationId,access.userId])).rows[0];
   const projectionFingerprint=digest({inventory,actor:access.userId,epoch:mode.epoch}),fingerprint=digest({inventory,actor:access.userId,epoch:mode.epoch,grant});
   if(!prep){
    const id=randomUUID();const state={currentResultRef:null,obligations:[],questionRefs:[],budget:{limitMicros:0,knownMicros:0,reservedMicros:0,unknownCost:false}};
    prep=(await db.query('INSERT INTO borrower_preparations(id,application_id,user_id,fingerprint,state) VALUES($1,$2,$3,$4,$5) RETURNING *',[id,access.applicationId,access.userId,projectionFingerprint,state])).rows[0];
   }
   if(prep.fingerprint && prep.fingerprint!==projectionFingerprint){
    const affected=prep.state.currentResultRef?[prep.state.currentResultRef]:[];
    prep.state.currentResultRef=null;prep.revision=String(BigInt(prep.revision)+1n);
    await db.query('UPDATE borrower_preparations SET revision=$2,state=$3 WHERE id=$1',[prep.id,prep.revision,prep.state]);
    await this.appendEvent(db,access,{schemaVersion:'preparation-invalidation.v1',type:'application.preparation_invalidated',preparationId:prep.id,preparationRevision:prep.revision,affectedResultRefs:affected,affectedRequirementIds:[],reasonCode:'dependencies_changed'});
   }
   const request:ProcessingRequest=parseCompletenessRequest({schemaVersion:'processing-request.v1',commandId:input.commandId,idempotencyKey:input.idempotencyKey,applicationId:access.applicationId,authority:{actorUserId:access.userId,scope:'borrower',policyRevision:grant},origin:input.origin,objective:input.objective,assessmentScope:input.assessmentScope,preparationId:prep.id,uploadBatchId:input.uploadBatchId,documents:inventory.documents.filter(d=>input.documentIds.includes(d.documentId)).map(({documentId,seriesId,version,sha256})=>({documentId,seriesId,version,sha256})),requirements:inventory.requirements.filter(r=>input.requirementIds.includes(r.requirementId)).map(({requirementId,definitionRevision,evidenceRevision})=>({requirementId,definitionRevision,evidenceRevision})),snapshot:{contentRevision:inventory.contentRevision,inputFingerprint:fingerprint,preparationRevision:String(prep.revision),submissionStage:null,reviewDate:new Date().toISOString().slice(0,10),submissionPolicyRevision:null,requestInventoryRevision:digest(inventory.requirements),evidenceInventoryRevision:digest(inventory.documents)},retryOf:input.retryOf});
   if(input.retryOf && !(await db.query('SELECT 1 FROM preparation_runs WHERE id=$1 AND preparation_id=$2',[input.retryOf,prep.id])).rowCount)throw new Error('Retry unavailable');
   const equivalent=(await db.query("SELECT id FROM preparation_runs WHERE preparation_id=$1 AND state IN ('queued','running','waiting_input') AND request->'snapshot'->>'inputFingerprint'=$2 AND request->>'objective'=$3 AND request->>'assessmentScope'=$4 AND request->'authority'->>'policyRevision'=$5 AND request->'origin'->>'artifactId' IS NOT DISTINCT FROM $6 AND delegation_goal IS NOT DISTINCT FROM $7 ORDER BY created_at LIMIT 1",[prep.id,fingerprint,input.objective,input.assessmentScope,grant,input.origin.artifactId,input.goal??null])).rows[0];
   if(equivalent){await db.query('INSERT INTO preparation_commands VALUES($1,$2,$3,$4,$5)',[access.applicationId,access.userId,input.idempotencyKey,payloadHash,equivalent.id]);return this.receipt(db,access,equivalent.id);}
   const runId=randomUUID();
   await db.query("INSERT INTO preparation_runs(id,preparation_id,application_id,user_id,execution_epoch,state,request,inventory,delegation_goal) VALUES($1,$2,$3,$4,$5,'queued',$6,$7,$8)",[runId,prep.id,access.applicationId,access.userId,mode.epoch,request,inventory,input.goal??null]);
   const previous=(await db.query('SELECT observations FROM preparation_runs WHERE preparation_id=$1 AND id<>$2 ORDER BY created_at DESC LIMIT 20',[prep.id,runId])).rows;
   const seen=new Set<string>(),observations:unknown[]=[];
   for(const row of previous)for(const observation of row.observations){
    if(!seen.has(observation.id)&&inventory.documents.some(d=>d.active&&d.documentId===observation.documentId&&d.sha256===observation.sha256)){seen.add(observation.id);observations.push(observation);}
   }
   if(observations.length)await db.query('UPDATE preparation_runs SET observations=$2 WHERE id=$1',[runId,JSON.stringify(observations)]);
   await db.query('INSERT INTO preparation_commands VALUES($1,$2,$3,$4,$5)',[access.applicationId,access.userId,input.idempotencyKey,payloadHash,runId]);
   await db.query('UPDATE borrower_preparations SET fingerprint=$2 WHERE id=$1',[prep.id,projectionFingerprint]);
   await this.appendEvent(db,access,{schemaVersion:'processing-event.v1',type:'run.accepted',runId,runRevision:'1',artifactId:request.origin.artifactId,state:'queued',inputFingerprint:fingerprint,data:{preparationId:prep.id,preparationRevision:String(prep.revision)}});
   return this.receipt(db,access,runId);
  });
 }
 async receipt(db:PoolClient,access:PreparationAccess,id:string):Promise<PreparationReceipt>{const row=(await db.query('SELECT * FROM preparation_runs WHERE id=$1 AND application_id=$2 AND user_id=$3',[id,access.applicationId,access.userId])).rows[0];if(!row)throw new Error('Run unavailable');return {runId:row.id,runRevision:String(row.revision),artifactId:row.request.origin.artifactId,acceptedAt:new Date(row.created_at).toISOString(),state:row.state,inputFingerprint:row.request.snapshot.inputFingerprint};}
 async appendEvent(db:PoolClient,access:PreparationAccess,event:Record<string,unknown>){
  const id=randomUUID(),cursor=randomUUID();const payload=applicationEventSchema.parse({...event,eventId:id,applicationId:access.applicationId,cursor,occurredAt:new Date().toISOString()});
  await db.query('INSERT INTO preparation_stream(id,application_id,user_id,payload) VALUES($1,$2,$3,$4)',[id,access.applicationId,access.userId,payload]);return payload;
 }
 async snapshot(access:PreparationAccess){return this.transaction(access,async db=>{
  const prep=(await db.query('SELECT * FROM borrower_preparations WHERE application_id=$1 AND user_id=$2',[access.applicationId,access.userId])).rows[0];
  const last=(await db.query('SELECT payload FROM preparation_stream WHERE application_id=$1 AND user_id=$2 ORDER BY sequence DESC LIMIT 1',[access.applicationId,access.userId])).rows[0];
  if(!prep)return {preparation:null,activeRuns:[],currentResult:null,pendingQuestions:[],cursor:last?.payload.cursor??'start'};
  const inventory=await this.inventory(db,access.applicationId),mode=await processorMode(db,access.applicationId),fresh=prep.fingerprint===digest({inventory,actor:access.userId,epoch:mode.epoch});
  const state=prep.state,ref=fresh?state.currentResultRef:null;
  const pendingQuestions=(await db.query("SELECT q.payload FROM preparation_questions q JOIN preparation_runs r ON r.id=q.run_id WHERE q.preparation_id=$1 AND q.answer IS NULL AND r.state='waiting_input' ORDER BY q.id",[prep.id])).rows.map(r=>processingQuestionSchema.parse(r.payload));
  const preparation=preparationSnapshotSchema.parse({schemaVersion:'preparation-snapshot.v1',applicationId:access.applicationId,preparationId:prep.id,preparationRevision:String(prep.revision),cursor:last?.payload.cursor??'start',currentResultRef:ref,currentReadinessRef:null,obligations:state.obligations,questionRefs:pendingQuestions.map(q=>({id:q.questionId,revision:q.questionRevision})),budget:state.budget});
  const rows=(await db.query("SELECT id FROM preparation_runs WHERE preparation_id=$1 AND state IN ('queued','running','waiting_input') ORDER BY created_at",[prep.id])).rows;
  const activeRuns=await Promise.all(rows.map(r=>this.receipt(db,access,r.id)));
  const currentResult=ref?await this.readResult(db,access,ref.id,ref.revision):null;
  return {preparation,activeRuns,currentResult,pendingQuestions,cursor:preparation.cursor,packageCompleteness:packageCompleteness(inventory,currentResult)};
 });}
 async events(access:PreparationAccess,after:string){return this.transaction(access,async db=>{
  const cursor=after==='start'?{sequence:'0'}:(await db.query("SELECT sequence FROM preparation_stream WHERE application_id=$1 AND user_id=$2 AND payload->>'cursor'=$3",[access.applicationId,access.userId,after])).rows[0];
  if(!cursor)return {resyncRequired:true,events:[],cursor:after};
  const rows=(await db.query('SELECT payload FROM preparation_stream WHERE application_id=$1 AND user_id=$2 AND sequence>$3 ORDER BY sequence LIMIT 100',[access.applicationId,access.userId,cursor.sequence])).rows;
  const events=rows.map(r=>applicationEventSchema.parse(r.payload));return {resyncRequired:false,events,cursor:events.at(-1)?.cursor??after};
 });}
 async readResult(db:PoolClient,access:PreparationAccess,id:string,revision:string){const row=(await db.query('SELECT payload FROM preparation_results WHERE id=$1 AND revision=$2 AND application_id=$3 AND user_id=$4',[id,revision,access.applicationId,access.userId])).rows[0];if(!row)throw new Error('Result unavailable');const prep=(await db.query('SELECT state,fingerprint FROM borrower_preparations WHERE id=$1',[row.payload.preparationId])).rows[0];const current=prep?.state.currentResultRef;const inventory=await this.inventory(db,access.applicationId),mode=await processorMode(db,access.applicationId),fresh=prep?.fingerprint===digest({inventory,actor:access.userId,epoch:mode.epoch});return parseCompletenessResult({...row.payload,freshness:fresh&&current?.id===id&&current?.revision===revision?'current':'historical'});}
 async answer(access:PreparationAccess,value:unknown){
  const input=z.strictObject({questionId:identifier,expectedQuestionRevision:z.string().regex(/^[1-9][0-9]*$/),idempotencyKey:identifier,text:z.string().trim().min(1).max(4000)}).parse(value);
  return this.transaction(access,async db=>{
   const q=(await db.query('SELECT * FROM preparation_questions WHERE id=$1 AND application_id=$2 AND user_id=$3 FOR UPDATE',[input.questionId,access.applicationId,access.userId])).rows[0];if(!q)throw new Error('Question unavailable');
   const hash=digest(input);if(q.answer){if(q.answer_key!==input.idempotencyKey||q.answer_hash!==hash)throw new Error('Answer conflict');return this.receipt(db,access,q.run_id);}
   const run=(await db.query('SELECT * FROM preparation_runs WHERE id=$1 FOR UPDATE',[q.run_id])).rows[0],mode=await processorMode(db,access.applicationId),inventory=await this.inventory(db,access.applicationId);
   if(String(q.revision)!==input.expectedQuestionRevision||run.state!=='waiting_input'||mode.mode!=='adaptive'||String(run.execution_epoch)!==mode.epoch||digest({inventory,actor:access.userId,epoch:mode.epoch,grant:run.request.authority.policyRevision})!==q.payload.dependencyFingerprint)throw new Error('Question is outdated');
   if(run.request.authority.policyRevision.startsWith('automatic:')){const pref=(await db.query('SELECT enabled,epoch::text FROM user_ai_preferences WHERE user_id=$1',[access.userId])).rows[0];if(!pref?.enabled||run.request.authority.policyRevision!==`automatic:${mode.epoch}:${pref.epoch}`)throw new Error('Automatic grant revoked');}
   await db.query('UPDATE preparation_questions SET answer=$2,answer_key=$3,answer_hash=$4,revision=revision+1 WHERE id=$1',[q.id,{text:input.text,userId:access.userId,at:new Date().toISOString()},input.idempotencyKey,hash]);
   const prep=(await db.query('SELECT state FROM borrower_preparations WHERE id=$1 FOR UPDATE',[q.preparation_id])).rows[0];prep.state.questionRefs=prep.state.questionRefs.filter((r:{id:string})=>r.id!==q.id);for(const obligation of prep.state.obligations)if(obligation.id===q.id)obligation.status='resolved';
   await db.query('UPDATE borrower_preparations SET state=$2 WHERE id=$1',[q.preparation_id,prep.state]);
   const changed=(await db.query("UPDATE preparation_runs SET state='queued',revision=revision+1 WHERE id=$1 RETURNING revision::text",[q.run_id])).rows[0];
   await this.appendEvent(db,access,{schemaVersion:'processing-event.v1',type:'run.progress',runId:q.run_id,runRevision:changed.revision,artifactId:run.request.origin.artifactId,state:'queued',inputFingerprint:run.request.snapshot.inputFingerprint,data:{activityCode:'clarification_received',intakeRef:null,affectedRequirementIds:q.payload.affectedRequirementIds,inspectedCount:run.observations.length,limitations:[],nextPollAfterMs:1000}});
   return this.receipt(db,access,q.run_id);
  });
 }
 async cancel(access:PreparationAccess,value:unknown){
  const input=z.strictObject({runId:identifier,expectedRunRevision:z.string().regex(/^[1-9][0-9]*$/),idempotencyKey:identifier}).parse(value);
  return this.transaction(access,async db=>{
   const key=`cancel:${input.idempotencyKey}`,hash=digest(input),prior=(await db.query('SELECT * FROM preparation_commands WHERE application_id=$1 AND user_id=$2 AND idempotency_key=$3',[access.applicationId,access.userId,key])).rows[0];
   if(prior){if(prior.payload_hash!==hash)throw new Error('Idempotency conflict');return this.receipt(db,access,prior.run_id);}
   const run=(await db.query('SELECT * FROM preparation_runs WHERE id=$1 AND application_id=$2 AND user_id=$3 FOR UPDATE',[input.runId,access.applicationId,access.userId])).rows[0];
   if(!run||String(run.revision)!==input.expectedRunRevision)throw new Error('Run revision conflict');
   if(!['queued','running','waiting_input'].includes(run.state))throw new Error('Run is terminal');
   const changed=(await db.query("UPDATE preparation_runs SET state='canceled',revision=revision+1,token=NULL,lease_until=NULL WHERE id=$1 RETURNING revision::text",[run.id])).rows[0];
   await db.query('INSERT INTO preparation_commands VALUES($1,$2,$3,$4,$5)',[access.applicationId,access.userId,key,hash,run.id]);
   await this.appendEvent(db,access,{schemaVersion:'processing-event.v1',type:'run.cancelled',runId:run.id,runRevision:changed.revision,artifactId:run.request.origin.artifactId,state:'canceled',inputFingerprint:run.request.snapshot.inputFingerprint,data:{reasonCode:'borrower_cancelled'}});
   return this.receipt(db,access,run.id);
  });
 }
 coverage(access:PreparationAccess,id:string,revision:string){return this.transaction(access,async db=>{const row=(await db.query('SELECT payload FROM preparation_coverage WHERE id=$1 AND revision=$2 AND application_id=$3 AND user_id=$4',[id,revision,access.applicationId,access.userId])).rows[0];if(!row)throw new Error('Coverage unavailable');return evidenceCoverageSchema.parse(row.payload);});}
 evidenceArtifact(access:PreparationAccess,id:string){return this.transaction(access,async db=>{const row=(await db.query("SELECT o AS observation FROM preparation_runs r CROSS JOIN LATERAL jsonb_array_elements(r.observations) o WHERE r.application_id=$1 AND r.user_id=$2 AND o->>'id'=$3 LIMIT 1",[access.applicationId,access.userId,id])).rows[0];if(!row)throw new Error('Evidence artifact unavailable');return row.observation;});}
 result(access:PreparationAccess,id:string,revision:string){return this.transaction(access,db=>this.readResult(db,access,id,revision));}
}
