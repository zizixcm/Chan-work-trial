import type { Pool, PoolClient } from 'pg';
import { pool } from '../db';
import type { Access } from '../authorization';
import { UploadError } from '../validation';
import { authorize, digest, transaction } from './core';

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
  const row=(await db.query(`SELECT m.*,b.state batch_state FROM upload_batch_members m JOIN upload_batches b ON b.id=m.batch_id
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
    if(member.requirement_id&&!(await db.query('SELECT 1 FROM requirement_documents WHERE application_id=$1 AND document_id=$2 AND requirement_id=$3 AND unlinked_at IS NULL',[this.access.applicationId,documentId,member.requirement_id])).rowCount)throw new UploadError('This file is already saved. Link it to this request in Uploaded files.',409);
    if(member.document_id&&member.document_id!==documentId)throw new UploadError('Batch member is already saved.',409);
    await db.query("UPDATE upload_batch_members SET state='saved',document_id=$3 WHERE batch_id=$1 AND id=$2 AND state<>'saved'",[ref.batchId,ref.memberId,documentId]);
    await resolveSavedBatchMembers(db,this.access,documentId,sha256);
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
  async finalize(id:string) {return transaction(this.database,async db=>{
    await authorize(db,this.access,['borrower']);
    const row=(await db.query('SELECT * FROM upload_batches WHERE id=$1 AND application_id=$2 AND user_id=$3 FOR UPDATE',[id,this.access.applicationId,this.access.userId])).rows[0];
    if(!row)throw new UploadError('Batch not found.',404);
    await db.query("UPDATE upload_batch_members SET state='failed' WHERE batch_id=$1 AND state='pending'",[id]);
    await db.query("UPDATE upload_batches SET state='finalized' WHERE id=$1 AND state='open'",[id]);
    return {id,state:row.state==='expired'?'expired':'finalized'};
  });}
  async status(id:string) {return transaction(this.database,async db=>{
    await authorize(db,this.access,['borrower']);
    const b=(await db.query('SELECT id,state,deadline_at FROM upload_batches WHERE id=$1 AND application_id=$2 AND user_id=$3',[id,this.access.applicationId,this.access.userId])).rows[0];
    if(!b)throw new UploadError('Batch not found.',404);
    return {...b,members:(await db.query('SELECT id,name,state,document_id FROM upload_batch_members WHERE batch_id=$1 ORDER BY id',[id])).rows};
  });}
}
