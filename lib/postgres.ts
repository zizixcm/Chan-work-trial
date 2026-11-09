import { processorMode } from './preparation/ownership';
import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from './db';
import { enqueueForDocument, enqueueForRequirement } from './jobs/core';
import { batchMember, resolveSavedBatchMembers, type BatchReference } from './jobs/batches';
import type { Access, Role } from './authorization';
import { UploadError } from './validation';
import type { DocumentRepository, ReviewRepository, DocumentRecord, ApplicationSnapshot, LenderSnapshot, RequirementReview } from './model';

import { latestSubmission, publishedSnapshot, submissionDTO } from './publication';
import { LocalBlobStorage } from './storage/local';

const iso = (value: string | Date) => value instanceof Date ? value.toISOString() : value;

export class PostgresRepository implements DocumentRepository, ReviewRepository {
  constructor(readonly access: Access, readonly uploadBatch?:BatchReference) {}
  private async tx<T>(roles: readonly Role[], work: (db: PoolClient) => Promise<T>): Promise<T> {
    const db = await pool().connect();
    try {
      await db.query('BEGIN');
      await db.query('SELECT id FROM applications WHERE id=$1 FOR UPDATE', [this.access.applicationId]);
      const membership = await db.query('SELECT role FROM application_memberships WHERE application_id=$1 AND user_id=$2 AND active FOR SHARE', [this.access.applicationId, this.access.userId]);
      if (!membership.rows.length) throw new UploadError('Application not found.', 404);
      if (!roles.includes(membership.rows[0].role)) throw new UploadError('Your account cannot perform this action.', 403);
      this.access.role=membership.rows[0].role;
      const result = await work(db);
      await db.query('COMMIT');
      return result;
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally { db.release(); }
  }
  private async audit(db: PoolClient, action: string, target: string) {
    await db.query("INSERT INTO audit_events(id,application_id,actor,action,target_id,created_at,actor_user_id,actor_kind,actor_role_at_event) VALUES($1,$2,$3,$4,$5,$6,$7,'user',$8)", [randomUUID(),this.access.applicationId,this.access.displayName,action,target,new Date().toISOString(),this.access.userId,this.access.role]);
  }
  private async readSnapshot(db: PoolClient): Promise<ApplicationSnapshot> {
    const id = this.access.applicationId;
    if(this.access.role==='lender')return publishedSnapshot(db,id);
    const application = (await db.query('SELECT id,borrower_name,property_name,address,transaction_type,requested_amount::float8,loi_reference,created_at FROM applications WHERE id=$1', [id])).rows[0];
    const requirements = (await db.query('SELECT id,application_id,title,category,purpose,period,owner,applicability,sort_order,criteria,collection,stage,condition,evidence_revision::text,definition_revision::text FROM requirements WHERE application_id=$1 AND lifecycle=\'active\' ORDER BY sort_order,id', [id])).rows;
    const docs = (await db.query('SELECT id,application_id,original_name,content_type,size_bytes::float8,sha256,uploaded_by,created_at FROM documents WHERE application_id=$1 AND NOT EXISTS(SELECT 1 FROM draft_document_removals removed WHERE removed.application_id=documents.application_id AND removed.document_id=documents.id AND removed.restored_at IS NULL) ORDER BY created_at DESC,id', [id])).rows;
    const links = (await db.query('SELECT requirement_id,document_id FROM requirement_documents WHERE application_id=$1 AND unlinked_at IS NULL', [id])).rows;
    const documents = docs.map(d => ({ ...d, created_at: iso(d.created_at), requirement_ids: links.filter(l => l.document_id === d.id).map(l => l.requirement_id) }));
    const reviews = (await db.query("SELECT v.id,v.application_id,v.requirement_id,v.decision,v.message,v.document_ids,v.reviewer,v.created_at,(v.evidence_revision=r.evidence_revision AND v.definition_revision=r.definition_revision) AS is_current FROM requirement_reviews v JOIN requirements r ON r.id=v.requirement_id AND r.application_id=v.application_id WHERE v.application_id=$1  ORDER BY v.sequence DESC,v.id DESC", [id])).rows.map(({reviewer_user_id: _user,...r})=>({...r,created_at:iso(r.created_at),document_ids:JSON.parse(r.document_ids)}));
    const sent=await latestSubmission(db,id);
    const revisions=(await db.query('SELECT revision::text,content_revision::text FROM applications WHERE id=$1',[id])).rows[0];
    return { application: {...application,created_at:iso(application.created_at)}, requirements, documents, reviews,submission:submissionDTO(sent),draft:{revision:revisions.revision,contentRevision:revisions.content_revision,hasUnsentChanges:!sent||sent.source_content_revision!==revisions.content_revision} };
  }
  async snapshot() { return this.tx(['borrower','lender'], db=>this.readSnapshot(db)); }
  async lenderSnapshot(): Promise<LenderSnapshot> {
    return this.tx(['lender'], async db=>({ ...await this.readSnapshot(db), note: await this.readNote(db) }));
  }
  private async readNote(db: PoolClient) {
    const row = (await db.query('SELECT body,updated_at FROM lender_notes WHERE application_id=$1',[this.access.applicationId])).rows[0];
    return row ? {body: row.body, updated_at: iso(row.updated_at)} : null;
  }
  async requirement(id: string) { return this.tx(['borrower','lender'], async db=>this.access.role==='lender'?(await publishedSnapshot(db,this.access.applicationId)).requirements.find(r=>r.id===id):(await db.query('SELECT * FROM requirements WHERE id=$1 AND application_id=$2',[id,this.access.applicationId])).rows[0]); }
  async document(id: string): Promise<DocumentRecord | undefined> { return this.tx(['borrower','lender'], async db=>{if(this.access.role==='borrower'&&(await db.query('SELECT 1 FROM draft_document_removals WHERE application_id=$1 AND document_id=$2 AND restored_at IS NULL',[this.access.applicationId,id])).rowCount)return undefined;if(this.access.role==='lender' && !(await publishedSnapshot(db,this.access.applicationId)).documents.some(d=>d.id===id))return undefined;return (await db.query('SELECT * FROM documents WHERE id=$1 AND application_id=$2',[id,this.access.applicationId])).rows[0];}); }
  async byChecksum(hash: string): Promise<DocumentRecord | undefined> { return this.tx(['borrower'], async db=>(await db.query('SELECT * FROM documents WHERE sha256=$1 AND application_id=$2',[hash,this.access.applicationId])).rows[0]); }
  async insert(d: DocumentRecord, requirementId: string) { return this.insertMany(d, requirementId ? [requirementId] : []); }
  async insertMany(d: DocumentRecord, requirementIds: string[]) {
    return this.tx(['borrower'], async db=>{
      if (d.application_id !== this.access.applicationId) throw new UploadError('Invalid application.',403);
      const member=this.uploadBatch?await batchMember(db,this.access,this.uploadBatch):null;
      if(member&&(member.sha256!==d.sha256||member.name!==d.original_name||JSON.stringify(requirementIds)!==JSON.stringify(member.requirement_id?[member.requirement_id]:[])))throw new UploadError('File does not match the upload manifest.',409);
      if(member?.document_id)throw new UploadError('This batch member is already saved.',409);
      for (const requirementId of requirementIds) {
        const r=(await db.query("SELECT collection FROM requirements WHERE application_id=$1 AND id=$2 AND lifecycle='active'",[this.access.applicationId,requirementId])).rows[0];
        if(!r)throw new UploadError('Request not found.',404);
        if(r.collection==='lender')throw new UploadError('Your lender supplies this document.',403);
      }
      await db.query('INSERT INTO documents(id,application_id,original_name,storage_key,content_type,size_bytes,sha256,uploaded_by,created_at,uploaded_by_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [d.id,d.application_id,d.original_name,d.storage_key,d.content_type,d.size_bytes,d.sha256,this.access.displayName,d.created_at,this.access.userId]);
      for(const requirementId of requirementIds) {
        await db.query("INSERT INTO requirement_documents(application_id,requirement_id,document_id,linked_by_user_id,origin) VALUES($1,$2,$3,$4,'human')",[this.access.applicationId,requirementId,d.id,this.access.userId]);
        await db.query("INSERT INTO document_match_events(id,application_id,document_id,requirement_id,action,origin,actor_user_id) VALUES($1,$2,$3,$4,'link','human',$5)",[randomUUID(),this.access.applicationId,d.id,requirementId,this.access.userId]);
      }
      await db.query('INSERT INTO draft_document_selections(application_id,document_id,included,updated_by_user_id) VALUES($1,$2,true,$3)',[this.access.applicationId,d.id,this.access.userId]);
      await this.audit(db,'document.uploaded',d.id);
      if(member)await db.query("UPDATE upload_batch_members SET state='saved',document_id=$3 WHERE batch_id=$1 AND id=$2",[this.uploadBatch!.batchId,this.uploadBatch!.memberId,d.id]);
      await resolveSavedBatchMembers(db,this.access,d.id,d.sha256);
      const job=await enqueueForDocument(db,this.access.applicationId,this.access.userId,d.id);
      if(!job&&(await processorMode(db,this.access.applicationId)).mode==='baseline')for(const requirementId of requirementIds)await enqueueForRequirement(db,this.access.applicationId,this.access.userId,requirementId);
    });
  }
  /** Change only this request's current mapping; never delete the file or history. */
  async setDocumentRequirement(documentId: string, requirementId: string, linked: boolean, expectedEvidenceRevision: string) {
    return this.tx(['borrower'], async db => {
      const app = this.access.applicationId;
      const requirement = (await db.query('SELECT evidence_revision::text,lifecycle,collection FROM requirements WHERE application_id=$1 AND id=$2', [app, requirementId])).rows[0];
      const document = (await db.query('SELECT id FROM documents WHERE application_id=$1 AND id=$2 AND NOT EXISTS(SELECT 1 FROM draft_document_removals removed WHERE removed.application_id=documents.application_id AND removed.document_id=documents.id AND removed.restored_at IS NULL)', [app, documentId])).rows[0];
      if (!requirement || !document) throw new UploadError('Document or request not found.', 404);
      if(requirement.collection==='lender')throw new UploadError('Your lender supplies this document.',403);
      if (requirement.lifecycle !== 'active') throw new UploadError('This request is no longer active. Refresh before changing its documents.', 409);
      const mapping = (await db.query('SELECT unlinked_at FROM requirement_documents WHERE application_id=$1 AND requirement_id=$2 AND document_id=$3', [app, requirementId, documentId])).rows[0];
      const active = !!mapping && mapping.unlinked_at === null;
      // A retry of an already-applied state is a no-op, even with its original token.
      if (active === linked) return { changed: false, snapshot: await this.readSnapshot(db) };
      if (requirement.evidence_revision !== expectedEvidenceRevision) throw new UploadError('The documents changed. Refresh this request before trying again.', 409);
      if (linked) {
        await db.query(`INSERT INTO requirement_documents(application_id,requirement_id,document_id,linked_by_user_id,origin)
          VALUES($1,$2,$3,$4,'human') ON CONFLICT(requirement_id,document_id)
          DO UPDATE SET linked_at=now(),linked_by_user_id=excluded.linked_by_user_id,unlinked_at=NULL,origin='human',analysis_job_id=NULL`, [app, requirementId, documentId, this.access.userId]);
      } else {
        await db.query('UPDATE requirement_documents SET unlinked_at=now() WHERE application_id=$1 AND requirement_id=$2 AND document_id=$3 AND unlinked_at IS NULL', [app, requirementId, documentId]);
      }
      if(linked)await db.query('DELETE FROM document_match_rejections WHERE application_id=$1 AND document_id=$2 AND requirement_id=$3',[app,documentId,requirementId]);
      else await db.query('INSERT INTO document_match_rejections(application_id,document_id,requirement_id,rejected_by) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[app,documentId,requirementId,this.access.userId]);
      await db.query("INSERT INTO document_match_events(id,application_id,document_id,requirement_id,action,origin,actor_user_id) VALUES($1,$2,$3,$4,$5,'human',$6)",[randomUUID(),app,documentId,requirementId,linked?'link':'unlink',this.access.userId]);
      await enqueueForRequirement(db,app,this.access.userId,requirementId);
      await db.query(`INSERT INTO audit_events(id,application_id,actor,action,target_id,created_at,actor_user_id,actor_kind,actor_role_at_event,target_type,details,visibility)
        VALUES($1,$2,$3,$4,$5,now(),$6,'user','borrower','requirement_document',$7,'borrower_visible')`,
        [randomUUID(),app,this.access.displayName,linked ? 'document.linked' : 'document.unlinked',documentId,this.access.userId,
          JSON.stringify({requirement_id:requirementId,document_id:documentId,previously_linked:active,linked})]);
      return { changed: true, snapshot: await this.readSnapshot(db) };
    });
  }
  /** Remove only the live draft; immutable bytes and published packages survive. */
  async removeDocument(documentId:string,expectedContentRevision:string) {
    return this.tx(['borrower'],async db=>{
      const app=this.access.applicationId;
      if(!(await db.query('SELECT 1 FROM documents WHERE application_id=$1 AND id=$2',[app,documentId])).rowCount)throw new UploadError('Document not found.',404);
      if((await db.query('SELECT 1 FROM draft_document_removals WHERE application_id=$1 AND document_id=$2 AND restored_at IS NULL',[app,documentId])).rowCount)return {changed:false,snapshot:await this.readSnapshot(db)};
      const current=(await db.query('SELECT content_revision::text FROM applications WHERE id=$1',[app])).rows[0];
      if(current.content_revision!==expectedContentRevision)throw new UploadError('The application changed. Refresh before removing this file.',409);
      const links=(await db.query('SELECT requirement_id FROM requirement_documents WHERE application_id=$1 AND document_id=$2 AND unlinked_at IS NULL',[app,documentId])).rows;
      await db.query('INSERT INTO draft_document_removals(application_id,document_id,removed_by) VALUES($1,$2,$3) ON CONFLICT(application_id,document_id) DO UPDATE SET removed_by=excluded.removed_by,removed_at=clock_timestamp(),restored_at=NULL,restored_by=NULL',[app,documentId,this.access.userId]);
      await db.query(`INSERT INTO draft_document_selections(application_id,document_id,included,updated_by_user_id) VALUES($1,$2,false,$3)
        ON CONFLICT(application_id,document_id) DO UPDATE SET included=false,updated_by_user_id=excluded.updated_by_user_id,updated_at=now()`,[app,documentId,this.access.userId]);
      await db.query('UPDATE requirement_documents SET unlinked_at=now() WHERE application_id=$1 AND document_id=$2 AND unlinked_at IS NULL',[app,documentId]);
      for(const link of links)await db.query('INSERT INTO document_match_rejections(application_id,document_id,requirement_id,rejected_by) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[app,documentId,link.requirement_id,this.access.userId]);
      await db.query(`UPDATE analysis_jobs SET state='cancelled',cancel_requested=true,token=token+1,slot=NULL,lease_expires_at=NULL,revision=revision+1,updated_at=now()
        WHERE application_id=$1 AND consent_scope='borrower' AND state IN ('queued','running','retry_wait','blocked')
          AND (document_id=$2 OR input->'documents' @> $3::jsonb)`,[app,documentId,JSON.stringify([{id:documentId}])]);
      for(const link of links) {
        const r=(await db.query("SELECT 1 FROM requirements WHERE application_id=$1 AND id=$2 AND lifecycle='active' AND collection='borrower'",[app,link.requirement_id])).rowCount;
        if(r)await enqueueForRequirement(db,app,this.access.userId,link.requirement_id);
      }
      await this.audit(db,'document.removed_from_draft',documentId);
      return {changed:true,snapshot:await this.readSnapshot(db)};
    });
  }
  async saveReview(requirementId: string, decision: RequirementReview['decision'], message: string, documentIds: string[], expectedReviewId: string | null, expectedSubmissionId?: string) {
    return this.tx(['lender'], async db=>{
      const snapshot = await this.readSnapshot(db);
      if(!snapshot.submission || snapshot.submission.id!==expectedSubmissionId)throw new UploadError('The submitted package changed. Refresh before saving.',409);
      if (!snapshot.requirements.some(r=>r.id===requirementId)) throw new UploadError('Request not found.',404);
      const latest = snapshot.reviews.find(r=>r.requirement_id===requirementId);
      if ((latest?.id || null)!==expectedReviewId) throw new UploadError('This review changed. Refresh before saving.',409);
      const actual=snapshot.documents.filter(d=>d.requirement_ids.includes(requirementId)).map(d=>d.id).sort();
      if (JSON.stringify(actual)!==JSON.stringify([...documentIds].sort())) throw new UploadError('The files changed. Refresh before saving.',409);
      if (decision==='accepted' && !actual.length) throw new UploadError('Upload evidence before accepting.');
      if (decision==='changes_requested' && !message.trim()) throw new UploadError('Explain the requested change.');
      const id=randomUUID();
      const requirement=snapshot.requirements.find(r=>r.id===requirementId)!;
      await db.query("INSERT INTO requirement_reviews(id,application_id,requirement_id,decision,message,document_ids,reviewer,created_at,reviewer_user_id,review_scope,submission_id,evidence_revision,definition_revision) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'submission',$10,$11,$12)",[id,this.access.applicationId,requirementId,decision,message.trim(),JSON.stringify(actual),this.access.displayName,new Date().toISOString(),this.access.userId,snapshot.submission.id,requirement.evidence_revision,requirement.definition_revision]);
      await this.audit(db,'requirement.'+decision,id);
    });
  }
  async submit(idempotencyKey:string,expectedRevision:string,expectedContentRevision:string) {
    return this.tx(['borrower'],async db=>{
      const app=this.access.applicationId;
      const prior=(await db.query('SELECT * FROM submissions WHERE application_id=$1 AND submitted_by_user_id=$2 AND idempotency_key=$3',[app,this.access.userId,idempotencyKey])).rows[0];
      if(prior){
        if(String(prior.source_application_revision)!==expectedRevision||String(prior.source_content_revision)!==expectedContentRevision)throw new UploadError('This send key was used for a different package.',409);
        return {submission:submissionDTO(prior),snapshot:await this.readSnapshot(db),reused:true};
      }
      const current=(await db.query('SELECT revision::text,content_revision::text FROM applications WHERE id=$1',[app])).rows[0];
      if(current.revision!==expectedRevision||current.content_revision!==expectedContentRevision)throw new UploadError('Your application changed. Refresh before sending for review.',409);
      const manifest=(await db.query('SELECT build_submission_manifest($1) manifest',[app])).rows[0].manifest;
      const storage=new LocalBlobStorage();
      for(const id of manifest.document_ids){
        const d=(await db.query('SELECT storage_key,sha256 FROM documents WHERE application_id=$1 AND id=$2',[app,id])).rows[0];
        let bytes;try{bytes=await storage.get(d.storage_key);}catch{throw new UploadError('A file is unavailable. Restore it before sending for review.',409);}
        if(createHash('sha256').update(bytes).digest('hex')!==d.sha256)throw new UploadError('A file failed its integrity check. Restore it before sending.',409);
      }
      const previous=await latestSubmission(db,app),id=randomUUID(),canonical=JSON.stringify(manifest);
      const sent=(await db.query(`INSERT INTO submissions(id,application_id,revision_number,source_application_revision,source_content_revision,submitted_by_user_id,submitted_by_label,manifest,canonical_manifest,manifest_sha256,idempotency_key,acknowledgment)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'[]'::jsonb) RETURNING *`,[id,app,(previous?.revision_number||0)+1,expectedRevision,expectedContentRevision,this.access.userId,this.access.displayName,manifest,canonical,createHash('sha256').update(canonical).digest('hex'),idempotencyKey])).rows[0];
      await this.audit(db,'application.sent_for_review',id);
      return {submission:submissionDTO(sent),snapshot:await this.readSnapshot(db),reused:false};
    });
  }
  async saveNote(body: string, expectedUpdatedAt: string|null) {
    return this.tx(['lender'], async db=>{
      const old=(await db.query('SELECT updated_at FROM lender_notes WHERE application_id=$1',[this.access.applicationId])).rows[0];
      if ((old ? iso(old.updated_at) : null)!==expectedUpdatedAt) throw new UploadError('This note changed. Refresh before saving.',409);
      await db.query('INSERT INTO lender_notes(application_id,body,updated_at,updated_by_user_id) VALUES($1,$2,$3,$4) ON CONFLICT(application_id) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at,updated_by_user_id=excluded.updated_by_user_id',[this.access.applicationId,body,new Date().toISOString(),this.access.userId]);
      await this.audit(db,'lender.note.updated',this.access.applicationId);
    });
  }
}
