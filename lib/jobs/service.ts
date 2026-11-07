import { latestSubmission, publishedSnapshot } from '../publication';
import type { Pool } from 'pg';
import type { Access } from '../authorization';
import { pool } from '../db';
import { UploadError } from '../validation';
import type { TaskKind } from '../backend/contracts';
import { authorize, digest, enqueue, jobDTO, liveStates, preference, transaction } from './core';

export class AnalysisService {
 constructor(private access:Access,private database:Pool=pool()){}
 async status() {return transaction(this.database,async db=>{
   const role=await authorize(db,this.access);
   const rows=(await db.query('SELECT * FROM analysis_jobs WHERE application_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100',[this.access.applicationId])).rows;
   const sent=role==='lender'?await latestSubmission(db,this.access.applicationId):null;
   const visible=role==='lender'?rows.filter(row=>row.consent_scope==='lender'&&sent&&row.input?.observed?.submissionId===sent.id):rows;
   const jobs=[];for(const row of visible)jobs.push(await jobDTO(db,row,{...this.access,role}));
   const links=(await db.query(`SELECT document_id AS "documentId",requirement_id AS "requirementId",origin,analysis_job_id AS "jobId" FROM requirement_documents WHERE application_id=$1 AND unlinked_at IS NULL`,[this.access.applicationId])).rows;
   const visibleLinks=role==='lender'?(await publishedSnapshot(db,this.access.applicationId)).documents.flatMap(d=>d.requirement_ids.map(requirementId=>({documentId:d.id,requirementId,origin:'submitted',jobId:null}))):links;
   return {preference:await preference(db,this.access.userId),jobs,links:visibleLinks};
 });}
 async setPreference(enabled:boolean,expectedEpoch:string) {return transaction(this.database,async db=>{
   const role=await authorize(db,this.access);
   await db.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE',[this.access.userId]);
   const pref=await preference(db,this.access.userId);
   if(pref.epoch!==expectedEpoch)throw new UploadError('AI preference changed. Refresh before trying again.',409);
   if(pref.enabled!==enabled) {
     await db.query(`INSERT INTO user_ai_preferences(user_id,enabled,epoch) VALUES($1,$2,1) ON CONFLICT(user_id) DO UPDATE SET enabled=excluded.enabled,epoch=user_ai_preferences.epoch+1,updated_at=now()`,[this.access.userId,enabled]);
     if(!enabled)await db.query(`UPDATE analysis_jobs SET cancel_requested=true,state='cancelled',token=token+1,slot=NULL,lease_expires_at=NULL,revision=revision+1,updated_at=now() WHERE initiated_by=$1 AND consent_scope='borrower' AND state=ANY($2::text[])`,[this.access.userId,liveStates]);
     await db.query(`INSERT INTO audit_events(id,application_id,actor,action,target_id,created_at,actor_user_id,actor_kind,actor_role_at_event,target_type,details,visibility) VALUES(gen_random_uuid()::text,$1,$2,'ai.preference.changed',$1,now(),$3,'user',$5,'ai_preference',$4,'borrower_visible')`,[this.access.applicationId,this.access.displayName,this.access.userId,JSON.stringify({enabled,consent_text_version:'personal-ai.v1'}),role]);
   }
   return preference(db,this.access.userId);
 });}
 async request(task:TaskKind,targetId:string,idempotencyKey:string,expected?:{definition?:string;evidence?:string;submissionId?:string},retryOf?:string) {return transaction(this.database,async db=>{
   const role=await authorize(db,this.access,task==='match_document.v1'?['borrower']:['borrower','lender']);
   const operation='analysis.enqueue';const requestHash=digest({task,targetId,expected:expected||{},retryOf:retryOf||null,...(role==='lender'?{consentScope:role}:{})});
   const receipt=(await db.query('SELECT request_hash,result FROM mutation_receipts WHERE application_id=$1 AND actor_user_id=$2 AND operation=$3 AND idempotency_key=$4',[this.access.applicationId,this.access.userId,operation,idempotencyKey])).rows[0];
   if(receipt){if(receipt.request_hash!==requestHash)throw new UploadError('This request key was already used for a different action.',409);return {id:receipt.result.id,reused:true};}
   if(role==='borrower' && !(await preference(db,this.access.userId)).enabled)throw new UploadError('AI assistance is off. Enable your personal AI preference to request this check.',403);
   if(expected && task==='verify_requirement.v1') {
     const view=role==='lender'?await publishedSnapshot(db,this.access.applicationId):null;
     if(role==='lender'&&(!view?.submission||expected.submissionId!==view.submission.id))throw new UploadError('The submitted package changed. Refresh before checking.',409);
     const r=view?view.requirements.find(r=>r.id===targetId):(await db.query('SELECT definition_revision::text,evidence_revision::text FROM requirements WHERE application_id=$1 AND id=$2',[this.access.applicationId,targetId])).rows[0];
     if(!r)throw new UploadError('Request not found.',404);
     if((expected.definition!==undefined&&expected.definition!==r.definition_revision)||(expected.evidence!==undefined&&expected.evidence!==r.evidence_revision))throw new UploadError('The request changed. Refresh and check again.',409);
   }
   if(task==='match_document.v1') {
     const d=(await db.query('SELECT content_type FROM documents WHERE application_id=$1 AND id=$2',[this.access.applicationId,targetId])).rows[0];
     if(!d)throw new UploadError('Document not found.',404);
     if(d.content_type.split(';')[0].trim()!=='text/csv')throw new UploadError('AI analysis currently supports CSV documents. You can link this file manually.',422);
   }
   if(retryOf) {
     const prior=(await db.query('SELECT * FROM analysis_jobs WHERE application_id=$1 AND id=$2 FOR UPDATE',[this.access.applicationId,retryOf])).rows[0];
     if(!prior||prior.initiated_by!==this.access.userId||prior.consent_scope!==role)throw new UploadError('Job not found.',404);
     if(prior.state==='blocked')await db.query("UPDATE analysis_jobs SET state='cancelled',cancel_requested=true,token=token+1,slot=NULL,lease_expires_at=NULL,revision=revision+1,updated_at=now() WHERE id=$1",[prior.id]);
     else if(liveStates.includes(prior.state))throw new UploadError('This check is still active. Cancel it before retrying.',409);
   }
   const recent=(await db.query("SELECT count(*)::int count FROM analysis_jobs WHERE application_id=$1 AND initiated_by=$2 AND created_at>now()-interval '1 minute'",[this.access.applicationId,this.access.userId])).rows[0].count;
   if(recent>=20)throw new UploadError('Too many checks requested. Wait a minute before trying again.',429);
   const id=await enqueue(db,this.access.applicationId,this.access.userId,task,targetId,'interactive',retryOf,role);
   await db.query('INSERT INTO mutation_receipts(application_id,actor_user_id,operation,idempotency_key,request_hash,result) VALUES($1,$2,$3,$4,$5,$6)',[this.access.applicationId,this.access.userId,operation,idempotencyKey,requestHash,JSON.stringify({id})]);
   return {id,reused:false};
 });}
 async get(id:string) {return transaction(this.database,async db=>{
   const role=await authorize(db,this.access);
   const row=(await db.query('SELECT * FROM analysis_jobs WHERE application_id=$1 AND id=$2',[this.access.applicationId,id])).rows[0];
   if(!row)throw new UploadError('Job not found.',404);
   if(role==='lender'){const sent=await latestSubmission(db,this.access.applicationId);if(row.consent_scope!=='lender'||!sent||row.input?.observed?.submissionId!==sent.id)throw new UploadError('Job not found.',404);}
   return jobDTO(db,row,{...this.access,role});
 });}
 async cancel(id:string) {return transaction(this.database,async db=>{
   const role=await authorize(db,this.access);
   const row=(await db.query('SELECT * FROM analysis_jobs WHERE application_id=$1 AND id=$2 FOR UPDATE',[this.access.applicationId,id])).rows[0];
   if(!row)throw new UploadError('Job not found.',404);
   if(row.initiated_by!==this.access.userId||row.consent_scope!==role)throw new UploadError('Only the person who requested this check can cancel it.',403);
   if(row.state==='succeeded')throw new UploadError('This check has already completed.',409);
   if(liveStates.includes(row.state))await db.query("UPDATE analysis_jobs SET state='cancelled',cancel_requested=true,token=token+1,slot=NULL,lease_expires_at=NULL,updated_at=now(),revision=revision+1 WHERE id=$1",[id]);
   return {id,state:liveStates.includes(row.state)?'cancelled':row.state};
 });}
 async retry(id:string,key:string) {
   const previous=await this.get(id);
   return this.request(previous.task,previous.targetId,key,undefined,id);
 }
}
