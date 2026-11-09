import { processorMode } from '../preparation/ownership';
import {randomUUID} from 'node:crypto';
import {admitInventoryEvents} from '../agents/upload-admission';
import {PreparationService} from '../preparation/service';
import { batchProcessingStatus, type BatchStatusMember, type BatchProcessingStatus } from './batch-status';
import type { Pool, PoolClient } from 'pg';
import { pool } from '../db';
import type { Access } from '../authorization';
import { UploadError } from '../validation';
import { authorize, digest, enqueueForDocument, enqueueForRequirement, transaction } from './core';

export type BatchMember = {id:string;name:string;sha256:string;requirementId?:string};
export type BatchReference = {batchId:string;memberId:string};

/** A reselected exact file can resolve an abandoned manifest without recovering
 * unsent browser bytes. Never invent a missing requirement relationship. */
export async function resolveSavedBatchMembers(db:PoolClient,access:Access,documentId:string,sha256:string) {
  await db.query(`UPDATE upload_batch_members m SET state='saved',document_id=$3 FROM upload_batches b
    WHERE b.id=m.batch_id AND b.application_id=$1 AND b.user_id=$2 AND m.sha256=$4 AND m.state<>'saved'
    AND (m.requirement_id IS NULL OR EXISTS(SELECT 1 FROM requirement_documents rd WHERE rd.application_id=$1
      AND rd.document_id=$3 AND rd.requirement_id=m.requirement_id AND rd.unlinked_at IS NULL))`,[access.applicationId,access.userId,documentId,sha256]);
}

/** Called under the application's mutation lock, including upload commit. */
export async function batchMember(db:PoolClient,access:Access,ref:BatchReference) {
  const row=(await db.query(`SELECT m.*,b.state batch_state,b.created_at batch_created_at FROM upload_batch_members m JOIN upload_batches b ON b.id=m.batch_id
    WHERE b.application_id=$1 AND b.user_id=$2 AND b.id=$3 AND m.id=$4 FOR UPDATE OF b,m`,
    [access.applicationId,access.userId,ref.batchId,ref.memberId])).rows[0];
  if(!row)throw new UploadError('Upload batch not found.',404);
  return row;
}

export class UploadBatchService {
  constructor(private access:Access,private database:Pool=pool()){}
  async attachExisting(ref:BatchReference,documentId:string,sha256:string,name:string,requirements:string[]) {return transaction(this.database,async db=>{
    await authorize(db,this.access,['borrower']);
    const member=await batchMember(db,this.access,ref);
    if(member.sha256!==sha256||member.name!==name||JSON.stringify(requirements)!==JSON.stringify(member.requirement_id?[member.requirement_id]:[]))throw new UploadError('File does not match the upload manifest.',409);
    const doc=(await db.query('SELECT id FROM documents WHERE application_id=$1 AND id=$2 AND sha256=$3',[this.access.applicationId,documentId,sha256])).rows[0];
    if(!doc)throw new UploadError('Document not found.',404);
    const removed=(await db.query('SELECT *,removed_at<(SELECT created_at FROM upload_batches WHERE id=$3) AS fresh_selection FROM draft_document_removals WHERE application_id=$1 AND document_id=$2 AND restored_at IS NULL',[this.access.applicationId,documentId,ref.batchId])).rows[0];
    if(removed) {
      // The server-created manifest predates old upload retries and provides the
      // explicit user-action boundary. Never restore from saved/old receipts.
      if(!removed.fresh_selection||member.document_id||member.batch_state!=='open')throw new UploadError('This file was removed. Choose it again in a new upload batch to add it back.',409);
      if(member.requirement_id && !(await db.query("SELECT 1 FROM requirements WHERE application_id=$1 AND id=$2 AND lifecycle='active' AND collection='borrower'",[this.access.applicationId,member.requirement_id])).rowCount)throw new UploadError('Request not found.',404);
      await db.query('UPDATE draft_document_removals SET restored_at=clock_timestamp(),restored_by=$3 WHERE application_id=$1 AND document_id=$2',[this.access.applicationId,documentId,this.access.userId]);
      await db.query('UPDATE draft_document_selections SET included=true,updated_by_user_id=$3,updated_at=now() WHERE application_id=$1 AND document_id=$2',[this.access.applicationId,documentId,this.access.userId]);
      if(member.requirement_id) {
        await db.query(`INSERT INTO requirement_documents(application_id,requirement_id,document_id,linked_by_user_id,origin) VALUES($1,$2,$3,$4,'human')
          ON CONFLICT(requirement_id,document_id) DO UPDATE SET unlinked_at=NULL,linked_at=now(),linked_by_user_id=excluded.linked_by_user_id,origin='human',analysis_job_id=NULL`,[this.access.applicationId,member.requirement_id,documentId,this.access.userId]);
        await db.query('DELETE FROM document_match_rejections WHERE application_id=$1 AND document_id=$2 AND requirement_id=$3',[this.access.applicationId,documentId,member.requirement_id]);
      }
      await db.query(`INSERT INTO audit_events(id,application_id,actor,action,target_id,created_at,actor_user_id,actor_kind,actor_role_at_event,target_type,visibility)
        VALUES(gen_random_uuid()::text,$1,$2,'document.restored_to_draft',$3,now(),$4,'user','borrower','document','borrower_visible')`,[this.access.applicationId,this.access.displayName,documentId,this.access.userId]);
      const job=await enqueueForDocument(db,this.access.applicationId,this.access.userId,documentId);
      if(!job&&member.requirement_id&&(await processorMode(db,this.access.applicationId)).mode==='baseline')await enqueueForRequirement(db,this.access.applicationId,this.access.userId,member.requirement_id);
    }

    if(member.requirement_id&&!(await db.query('SELECT 1 FROM requirement_documents WHERE application_id=$1 AND document_id=$2 AND requirement_id=$3 AND unlinked_at IS NULL',[this.access.applicationId,documentId,member.requirement_id])).rowCount)throw new UploadError('This file is already saved. Link it to this request in Uploaded files.',409);
    if(member.document_id&&member.document_id!==documentId)throw new UploadError('Batch member is already saved.',409);
    await db.query("UPDATE upload_batch_members SET state='saved',document_id=$3 WHERE batch_id=$1 AND id=$2 AND state<>'saved'",[ref.batchId,ref.memberId,documentId]);
    await resolveSavedBatchMembers(db,this.access,documentId,sha256);
    // Explicit reselection is the boundary for checking a legacy saved file.
    // Reuse any recorded outcome (including failure/cancellation); duplicates
    // must not consume retry budgets or start another paid check.
    if(!(await db.query(`SELECT 1 FROM analysis_jobs WHERE application_id=$1 AND initiated_by=$2
      AND consent_scope='borrower' AND task='match_document.v1' AND document_id=$3 LIMIT 1`,
      [this.access.applicationId,this.access.userId,documentId])).rowCount) {
      await enqueueForDocument(db,this.access.applicationId,this.access.userId,documentId);
    }
    return documentId;
  });}
  async create(id:string,members:BatchMember[]) {return transaction(this.database,async db=>{
    await authorize(db,this.access,['borrower']);
    if(!/^[a-zA-Z0-9-]{1,80}$/.test(id)||!Array.isArray(members)||!members.length||members.length>50)throw new UploadError('Choose between 1 and 50 files.');
    for(const m of members) {
      if(!m||typeof m.id!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(m.id)||typeof m.name!=='string'||!m.name.trim()||m.name.length>200||typeof m.sha256!=='string'||!/^[a-f0-9]{64}$/.test(m.sha256))throw new UploadError('Invalid upload manifest.');
      if(m.requirementId) {
        const r=(await db.query("SELECT id FROM requirements WHERE application_id=$1 AND id=$2 AND lifecycle='active' AND collection='borrower'",[this.access.applicationId,m.requirementId])).rows[0];
        if(!r)throw new UploadError('Request not found.',404);
      }
    }
    if(new Set(members.map(m=>m.id)).size!==members.length)throw new UploadError('Duplicate batch member.');
    const manifestHash=digest(members.map(m=>({id:m.id,name:m.name,sha256:m.sha256,requirementId:m.requirementId||null})).sort((a,b)=>a.id.localeCompare(b.id)));
    const prior=(await db.query('SELECT * FROM upload_batches WHERE id=$1',[id])).rows[0];
    if(prior) {
      if(prior.application_id!==this.access.applicationId||prior.user_id!==this.access.userId)throw new UploadError('Batch not found.',404);
      if(prior.manifest_hash!==manifestHash)throw new UploadError('Batch already exists with a different file list.',409);
      return {id,state:prior.state};
    }
    const count=(await db.query("SELECT count(*)::int n FROM upload_batches WHERE user_id=$1 AND state='open'",[this.access.userId])).rows[0].n;
    if(count>=10)throw new UploadError('Finish an existing upload batch before starting another.',429);
    await db.query('INSERT INTO upload_batches(id,application_id,user_id,manifest_hash) VALUES($1,$2,$3,$4)',[id,this.access.applicationId,this.access.userId,manifestHash]);
    for(const m of members)await db.query('INSERT INTO upload_batch_members(batch_id,id,application_id,name,sha256,requirement_id) VALUES($1,$2,$3,$4,$5,$6)',[id,m.id,this.access.applicationId,m.name,m.sha256,m.requirementId||null]);
    return {id,state:'open'};
  });}
  async finalize(id:string,requestProcessing=false) {return transaction(this.database,async db=>{
    await authorize(db,this.access,['borrower']);
    const row=(await db.query('SELECT * FROM upload_batches WHERE id=$1 AND application_id=$2 AND user_id=$3 FOR UPDATE',[id,this.access.applicationId,this.access.userId])).rows[0];
    if(!row)throw new UploadError('Batch not found.',404);
    await db.query("UPDATE upload_batch_members SET state='failed' WHERE batch_id=$1 AND state='pending'",[id]);
    await db.query("UPDATE upload_batches SET state='finalized' WHERE id=$1 AND state='open'",[id]);
    if(requestProcessing){
      const mode=await processorMode(db,this.access.applicationId);
      await db.query('UPDATE upload_batches SET processing_requested_at=COALESCE(processing_requested_at,now()),processing_request_epoch=COALESCE(processing_request_epoch,$2) WHERE id=$1 AND processing_requested_at IS NULL',[id,String(mode.epoch)]);
      if(mode.mode==='adaptive'){
        // Commit the upload and its agent message atomically. The worker consumes
        // this turn without requiring a chat message or discovering file changes.
        await db.query('INSERT INTO borrower_conversations(id,application_id,borrower_user_id) VALUES($1,$2,$3) ON CONFLICT(application_id,borrower_user_id) DO NOTHING',[randomUUID(),this.access.applicationId,this.access.userId]);
        const conversation=(await db.query('SELECT id FROM borrower_conversations WHERE application_id=$1 AND borrower_user_id=$2',[this.access.applicationId,this.access.userId])).rows[0];
        const inventory=await new PreparationService(this.database).inventory(db,this.access.applicationId);
        await admitInventoryEvents(db,this.access,conversation.id,inventory,{modeEpoch:String(mode.epoch),preferenceEpoch:'0',automaticEnabled:false},id);
      }
    }
    return {id,state:row.state==='expired'?'expired':'finalized'};
  });}
  async status(id:string):Promise<{id:string;state:string;deadline_at:Date;members:BatchStatusMember[];processing:BatchProcessingStatus}> {return transaction(this.database,async db=>{
    await authorize(db,this.access,['borrower']);
    const b=(await db.query('SELECT id,state,deadline_at FROM upload_batches WHERE id=$1 AND application_id=$2 AND user_id=$3',[id,this.access.applicationId,this.access.userId])).rows[0];
    if(!b)throw new UploadError('Batch not found.',404);
    return {...b,...await batchProcessingStatus(db,this.access,b)};
  });}
  async latest() {return transaction(this.database,async db=>{
    await authorize(db,this.access,['borrower']);
    const b=(await db.query(`SELECT id,state,deadline_at FROM upload_batches
      WHERE application_id=$1 AND user_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1`,
      [this.access.applicationId,this.access.userId])).rows[0];
    return b?{...b,...await batchProcessingStatus(db,this.access,b)}:null;
  });}
}
