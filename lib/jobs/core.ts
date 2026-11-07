import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { Access, Role } from '../authorization';
import type { AnalysisSnapshot } from '../backend/prepare-analysis';
import type { TaskKind, Lane } from '../backend/contracts';
import { DEFAULT_ANALYSIS_MODEL } from '../backend/provider-executor';
import { ANALYSIS_VERSION } from '../analysis/types';
import { latestSubmission, publishedSnapshot } from '../publication';
import { UploadError } from '../validation';

export type ConsentScope = 'borrower' | 'lender';
export function analysisFingerprint(input: PinnedSnapshot, task: TaskKind, scope: ConsentScope, epoch: string, userId: string) {
  // Scope both cached results and live work to the initiating user.
  return digest(scope==='lender' ? {input,authority:'lender',userId,task} : {input,epoch,userId,task});
}
export const liveStates = ['queued','running','retry_wait','blocked'];
export interface PinnedSnapshot extends AnalysisSnapshot {
  version: string; model: string;
  observed: unknown;
}
export const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function transaction<T>(database: Pool, work: (db: PoolClient) => Promise<T>): Promise<T> {
  const db = await database.connect();
  try { await db.query('BEGIN'); const result = await work(db); await db.query('COMMIT'); return result; }
  catch (error) { await db.query('ROLLBACK').catch(()=>{}); throw error; }
  finally { db.release(); }
}
export async function authorize(db: PoolClient, access: Access, roles: readonly Role[] = ['borrower','lender']) {
  await db.query('SELECT id FROM applications WHERE id=$1 FOR UPDATE', [access.applicationId]);
  const member = (await db.query('SELECT role FROM application_memberships WHERE application_id=$1 AND user_id=$2 AND active FOR SHARE', [access.applicationId,access.userId])).rows[0];
  if (!member) throw new UploadError('Application not found.',404);
  if (!roles.includes(member.role)) throw new UploadError('Your account cannot perform this action.',403);
  return member.role as Role;
}
export async function preference(db: PoolClient, userId: string) {
  const row = (await db.query('SELECT enabled,epoch::text FROM user_ai_preferences WHERE user_id=$1',[userId])).rows[0];
  return row || {enabled:false,epoch:'0'};
}
export async function snapshot(db: PoolClient, applicationId: string, task: TaskKind, targetId: string, scope: ConsentScope = 'borrower'): Promise<PinnedSnapshot> {
  if(scope==='lender') {
    const sent=await latestSubmission(db,applicationId);
    if(!sent)throw new UploadError('Waiting for the borrower to send documents for review.',409);
    const view=await publishedSnapshot(db,applicationId),r=view.requirements.find(r=>r.id===targetId);
    if(task!=='verify_requirement.v1'||!r)throw new UploadError('Submitted request not found.',404);
    return {version:ANALYSIS_VERSION,model:DEFAULT_ANALYSIS_MODEL,
      documents:view.documents.filter(d=>d.requirement_ids.includes(targetId)).map(d=>({id:d.id,sha256:d.sha256,contentType:d.content_type})),
      requirements:[{id:r.id,title:r.title,subject:`Application property: ${view.application.property_name}; Borrower: ${view.application.borrower_name}`,period:r.period,criteria:(r.criteria||[]).map((description,index)=>({id:`${r.id}:criterion:${index+1}`,description}))}],
      observed:{submissionId:sent.id,definition:r.definition_revision,evidence:r.evidence_revision}};
  }
  const requirements = (await db.query(`SELECT r.id,r.title,r.purpose,r.period,r.criteria,r.collection,r.definition_revision::text,r.evidence_revision::text,
    coalesce(s.label,'Requirement subject not specified') || '; Application property: ' || a.property_name || '; Borrower: ' || a.borrower_name AS subject FROM requirements r JOIN applications a ON a.id=r.application_id LEFT JOIN application_subjects s ON s.id=r.subject_id AND s.application_id=r.application_id
    WHERE r.application_id=$1 AND r.lifecycle='active' AND ($2::text IS NULL OR r.id=$2) ORDER BY r.id`,
    [applicationId,task==='verify_requirement.v1'?targetId:null])).rows;
  if (task==='verify_requirement.v1' && !requirements.length) throw new UploadError('Request not found.',404);
  const documents = (await db.query(`SELECT d.id,d.sha256,d.content_type,d.series_id,d.version_number FROM documents d WHERE d.application_id=$1 AND
    (($2='match_document.v1' AND d.id=$3 AND NOT EXISTS(SELECT 1 FROM documents successor WHERE successor.replaces_document_id=d.id)) OR
     ($2='verify_requirement.v1' AND EXISTS(SELECT 1 FROM requirement_documents rd WHERE rd.application_id=$1 AND rd.requirement_id=$3 AND rd.document_id=d.id AND rd.unlinked_at IS NULL))) ORDER BY d.id`, [applicationId,task,targetId])).rows;
  if (task==='match_document.v1' && !documents.length) throw new UploadError('Current document not found.',404);
  // Definition/evidence tokens invalidate changes without staling unrelated uploads.
  const mapping = task==='match_document.v1' ? (await db.query(`SELECT requirement_id,origin,extract(epoch from unlinked_at)::text AS unlinked_at FROM requirement_documents WHERE application_id=$1 AND document_id=$2 ORDER BY requirement_id`,[applicationId,targetId])).rows : [];
  const rejected = task==='match_document.v1' ? (await db.query('SELECT requirement_id FROM document_match_rejections WHERE application_id=$1 AND document_id=$2 ORDER BY requirement_id',[applicationId,targetId])).rows : [];
  return {version: ANALYSIS_VERSION, model: DEFAULT_ANALYSIS_MODEL,
    documents: documents.map(d=>({id:d.id,sha256:d.sha256,contentType:d.content_type})),
    requirements: requirements.map(r=>({id:r.id,title:r.title,subject:r.subject,period:r.period,criteria:r.criteria.map((description:string,index:number)=>({id:`${r.id}:criterion:${index+1}`,description}))})),
    observed: {definitions:requirements.map(r=>({id:r.id,definition:r.definition_revision,evidence:task==='verify_requirement.v1'?r.evidence_revision:undefined,collection:r.collection,purpose:r.purpose})),versions:documents.map(d=>({id:d.id,series:d.series_id,version:d.version_number})),mapping,rejected},
  };
}
export async function enqueue(db: PoolClient, applicationId: string, userId: string, task: TaskKind, targetId: string, lane: Lane, retryOf?: string, scope: ConsentScope = 'borrower') {
  // Serialize snapshot selection and successor creation with application mutations.
  await db.query('SELECT id FROM applications WHERE id=$1 FOR UPDATE',[applicationId]);
  const member=(await db.query('SELECT role FROM application_memberships WHERE application_id=$1 AND user_id=$2 AND active FOR SHARE',[applicationId,userId])).rows[0];
  if(!member || member.role!==scope || (scope==='lender' && (task!=='verify_requirement.v1' || lane!=='interactive')))throw new UploadError('Your account cannot request this analysis.',403);
  const pref = await preference(db,userId);
  if (scope==='borrower' && !pref.enabled) return null;
  const input = await snapshot(db,applicationId,task,targetId,scope);
  const fingerprint = analysisFingerprint(input,task,scope,pref.epoch,userId);
  if(task==='verify_requirement.v1') {
    // Preserve immutable attempt inputs and history. Only pending obsolete work is
    // superseded; a running attempt is fenced by the normal freshness gate.
    const superseded=(await db.query(`UPDATE analysis_jobs SET state='stale',token=token+1,
      slot=NULL,lease_expires_at=NULL,updated_at=now(),revision=revision+1
      WHERE application_id=$1 AND initiated_by=$2 AND consent_scope=$3 AND task=$4
      AND target_id=$5 AND fingerprint<>$6 AND state IN ('queued','retry_wait','blocked')
      RETURNING id,token,lane`,[applicationId,userId,scope,task,targetId,fingerprint])).rows;
    for(const prior of superseded) {
      await db.query("INSERT INTO analysis_events(application_id,job_id,event,token) VALUES($1,$2,'stale',$3)",[applicationId,prior.id,prior.token]);
      if(prior.lane==='interactive')lane='interactive';
    }
  }
  const existing = (await db.query(`SELECT * FROM analysis_jobs WHERE application_id=$1 AND task=$2 AND fingerprint=$3 AND consent_scope=$5 AND state=ANY($4::text[]) ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,[applicationId,task,fingerprint,liveStates,scope])).rows[0];
  if (existing) {
    if (lane==='interactive' && existing.lane==='background') await db.query("UPDATE analysis_jobs SET lane='interactive',updated_at=now(),revision=revision+1 WHERE id=$1",[existing.id]);
    return existing.id as string;
  }
  if (!retryOf) {
    const cached = (await db.query("SELECT id FROM analysis_jobs WHERE application_id=$1 AND task=$2 AND result_fingerprint=$3 AND consent_scope=$4 AND state='succeeded' ORDER BY created_at DESC LIMIT 1",[applicationId,task,fingerprint,scope])).rows[0];
    if (cached) return cached.id as string;
  }
  const id = randomUUID();
  await db.query(`INSERT INTO analysis_jobs(id,application_id,initiated_by,task,target_id,document_id,requirement_id,lane,input,fingerprint,consent_epoch,retry_of,consent_scope)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,[id,applicationId,userId,task,targetId,task==='match_document.v1'?targetId:null,task==='verify_requirement.v1'?targetId:null,lane,JSON.stringify(input),fingerprint,scope==='lender'?'0':pref.epoch,retryOf||null,scope]);
  await db.query("INSERT INTO analysis_events(application_id,job_id,event,token) VALUES($1,$2,'queued',0)",[applicationId,id]);
  return id;
}
export async function enqueueForDocument(db:PoolClient, applicationId:string, userId:string, documentId:string) {
  const d = (await db.query('SELECT content_type FROM documents WHERE application_id=$1 AND id=$2',[applicationId,documentId])).rows[0];
  if (d?.content_type?.split(';')[0].trim()==='text/csv') return enqueue(db,applicationId,userId,'match_document.v1',documentId,'background');
  return null;
}
export async function enqueueForRequirement(db:PoolClient, applicationId:string,userId:string,requirementId:string) {
  return enqueue(db,applicationId,userId,'verify_requirement.v1',requirementId,'background');
}
export async function jobDTO(db:PoolClient, row:Record<string,any>, viewer:Access) {
  const owns = row.initiated_by===viewer.userId && row.consent_scope===viewer.role;
  let current = false;
  try {
    const pref=await preference(db,row.initiated_by);
    const input=await snapshot(db,row.application_id,row.task,row.target_id,row.consent_scope);
    current = (row.consent_scope==='lender' || (pref.enabled && pref.epoch===String(row.consent_epoch))) && analysisFingerprint(input,row.task,row.consent_scope,pref.epoch,row.initiated_by)===(row.result_fingerprint||row.fingerprint);
  } catch { current=false; }
  const message:Record<string,string> = {queued:'Waiting to check',running:'Checking documents',retry_wait:'Waiting to retry',blocked:'Checks unavailable; your documents are saved',succeeded:'Check complete',failed:'Check could not finish; continue manually or retry',dead_letter:'Check could not finish; retry when ready',cancelled:'Check cancelled',stale:'Documents changed; check again',expired:'Check expired; try again'};
  return {id:row.id,ownedByCurrentUser:owns,consentScope:row.consent_scope,task:row.task,targetId:row.target_id,documentId:row.document_id||undefined,requirementId:row.requirement_id||undefined,state:row.state,
    revision:String(row.revision),createdAt:row.created_at,updatedAt:row.updated_at,safeCode:row.safe_code||undefined,message:message[row.state],
    freshness:current?'current':'stale',result:row.state==='succeeded'?row.result:undefined,cancellationRequested:row.cancel_requested,
    canCancel:owns && liveStates.includes(row.state),canRetry:owns && ['failed','dead_letter','cancelled','stale','expired','blocked'].includes(row.state),pollAfterMs:2000};
}
