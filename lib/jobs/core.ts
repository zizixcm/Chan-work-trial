import { supportsAnalysis } from '../analysis/formats';
import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { Access, Role } from '../authorization';
import type { AnalysisSnapshot } from '../backend/prepare-analysis';
import type { TaskKind, Lane } from '../backend/contracts';
import { configuredModel } from '../backend/models';
import { ANALYSIS_VERSION } from '../analysis/types';
import { latestSubmission, publishedSnapshot } from '../publication';
import { UploadError } from '../validation';
import { deriveFulfillment } from '../analysis/fulfillment';
import type { VerifyResult } from '../analysis/types';

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
    return {version:ANALYSIS_VERSION,model:configuredModel(),
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
     ($2='verify_requirement.v1' AND NOT EXISTS(SELECT 1 FROM documents successor WHERE successor.replaces_document_id=d.id)
       AND EXISTS(SELECT 1 FROM requirement_documents rd WHERE rd.application_id=$1 AND rd.requirement_id=$3 AND rd.document_id=d.id AND rd.unlinked_at IS NULL))) ORDER BY d.id`, [applicationId,task,targetId])).rows;
  if (task==='match_document.v1' && !documents.length) throw new UploadError('Current document not found.',404);
  // Definition/evidence tokens invalidate changes without staling unrelated uploads.
  const mapping = task==='match_document.v1' ? (await db.query(`SELECT requirement_id,origin,extract(epoch from unlinked_at)::text AS unlinked_at FROM requirement_documents WHERE application_id=$1 AND document_id=$2 ORDER BY requirement_id`,[applicationId,targetId])).rows : [];
  const rejected = task==='match_document.v1' ? (await db.query('SELECT requirement_id FROM document_match_rejections WHERE application_id=$1 AND document_id=$2 ORDER BY requirement_id',[applicationId,targetId])).rows : [];
  const batches=task==='verify_requirement.v1'?(await db.query(`SELECT b.id,b.state,
    (SELECT count(*)::int FROM upload_batch_members m WHERE m.batch_id=b.id AND m.state<>'saved') missing
    FROM upload_batches b WHERE b.application_id=$1 AND (b.state='open' OR EXISTS(
      SELECT 1 FROM upload_batch_members missing WHERE missing.batch_id=b.id AND missing.requirement_id IS NULL AND missing.state<>'saved') OR EXISTS(
      SELECT 1 FROM upload_batch_members m WHERE m.batch_id=b.id AND (m.requirement_id=$2 OR EXISTS(
        SELECT 1 FROM requirement_documents rd WHERE rd.document_id=m.document_id AND rd.requirement_id=$2 AND rd.unlinked_at IS NULL)))) ORDER BY b.id`,[applicationId,targetId])).rows:[];
  const pendingMatches=task==='verify_requirement.v1'?(await db.query(`SELECT DISTINCT document_id FROM analysis_jobs WHERE application_id=$1
    AND task='match_document.v1' AND state IN ('queued','running','retry_wait','blocked') ORDER BY document_id`,[applicationId])).rows:[];
  const unresolvedMatches: Array<{id:string}> = [];
  if(task==='verify_requirement.v1') {
    // Resolve uncertainty per currently authorized actor, never by whichever
    // user's job happens to be newest. Old definitions/consent cannot resolve it.
    const matches=(await db.query(`SELECT DISTINCT ON (j.document_id,j.initiated_by)
      j.document_id,j.initiated_by,j.state,j.result,j.fingerprint,j.result_fingerprint,
      j.consent_epoch::text,p.epoch::text,
      EXISTS(SELECT 1 FROM requirement_documents rd WHERE rd.document_id=j.document_id
        AND rd.unlinked_at IS NULL) AS linked
      FROM analysis_jobs j JOIN application_memberships m ON m.application_id=j.application_id
        AND m.user_id=j.initiated_by AND m.active AND m.role='borrower'
      JOIN user_ai_preferences p ON p.user_id=j.initiated_by AND p.enabled
      WHERE j.application_id=$1 AND j.task='match_document.v1' AND j.consent_scope='borrower'
        AND NOT EXISTS(SELECT 1 FROM documents successor WHERE successor.replaces_document_id=j.document_id)
      ORDER BY j.document_id,j.initiated_by,j.created_at DESC,j.id DESC`,[applicationId])).rows;
    const inputs=new Map<string,PinnedSnapshot>();
    const unresolved=new Set<string>();
    for(const match of matches) {
      let input=inputs.get(match.document_id);
      if(!input){input=await snapshot(db,applicationId,'match_document.v1',match.document_id);inputs.set(match.document_id,input);}
      const current=match.consent_epoch===match.epoch &&
        analysisFingerprint(input,'match_document.v1','borrower',match.epoch,match.initiated_by)===(match.result_fingerprint||match.fingerprint);
      const ambiguous=match.state==='succeeded' && match.result?.requirements?.some(
        (candidate:{requirementId:string;relevance:{state:string}})=>candidate.requirementId===targetId && candidate.relevance.state==='ambiguous');
      if(!current || ambiguous || (!match.linked && ['failed','dead_letter','expired','cancelled','stale'].includes(match.state)))unresolved.add(match.document_id);
    }
    unresolvedMatches.push(...[...unresolved].sort().map(id=>({id})));
  }
  const processingLimitations:string[]=[];
  const replacedLinks=task==='verify_requirement.v1'?(await db.query(`SELECT rd.document_id FROM requirement_documents rd
    WHERE rd.application_id=$1 AND rd.requirement_id=$2 AND rd.unlinked_at IS NULL AND EXISTS(
      SELECT 1 FROM documents successor WHERE successor.replaces_document_id=rd.document_id) ORDER BY rd.document_id`,[applicationId,targetId])).rows:[];
  if(replacedLinks.length)processingLimitations.push('Some linked document versions have been replaced. Confirm the current document links before treating this assessment as complete.');
  if(batches.some(b=>b.state==='open'))processingLimitations.push('An upload batch is still open; additional documents may change this assessment.');
  if(batches.some(b=>b.missing>0))processingLimitations.push('An associated upload batch has files that were not saved. This assessment does not cover those files.');
  if(pendingMatches.length)processingLimitations.push('Document matching is still pending; the associated evidence set may be incomplete.');
  if(unresolvedMatches.length)processingLimitations.push('Some uploaded documents could not be confidently assigned. Resolve their links before treating this assessment as complete.');
  return {version: ANALYSIS_VERSION, model: configuredModel(),
    ...(task==='verify_requirement.v1'?{processingLimitations}:{}),
    documents: documents.map(d=>({id:d.id,sha256:d.sha256,contentType:d.content_type})),
    requirements: requirements.map(r=>({id:r.id,title:r.title,subject:r.subject,period:r.period,criteria:r.criteria.map((description:string,index:number)=>({id:`${r.id}:criterion:${index+1}`,description}))})),
    observed: {definitions:requirements.map(r=>({id:r.id,definition:r.definition_revision,evidence:task==='verify_requirement.v1'?r.evidence_revision:undefined,collection:r.collection,purpose:r.purpose})),versions:documents.map(d=>({id:d.id,series:d.series_id,version:d.version_number})),mapping,rejected,...(task==='verify_requirement.v1'?{batches,pendingMatches,unresolvedMatches,replacedLinks}:{})},
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
  if(task==='match_document.v1')await db.query(`INSERT INTO analysis_invalidations(application_id) VALUES($1)
    ON CONFLICT(application_id) DO UPDATE SET changed_at=clock_timestamp()`,[applicationId]);
  return id;
}
export async function enqueueForDocument(db:PoolClient, applicationId:string, userId:string, documentId:string) {
  const d = (await db.query('SELECT content_type FROM documents WHERE application_id=$1 AND id=$2',[applicationId,documentId])).rows[0];
  if (d?.content_type && supportsAnalysis(d.content_type)) return enqueue(db,applicationId,userId,'match_document.v1',documentId,'background');
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
  const result=row.state==='succeeded'?row.result:undefined;
  const presented=result?.schemaVersion==='verify.v1'?{...result,fulfillment:deriveFulfillment(result as VerifyResult)}:result;
  return {id:row.id,ownedByCurrentUser:owns,consentScope:row.consent_scope,task:row.task,targetId:row.target_id,documentId:row.document_id||undefined,requirementId:row.requirement_id||undefined,state:row.state,
    revision:String(row.revision),createdAt:row.created_at,updatedAt:row.updated_at,safeCode:row.safe_code||undefined,message:message[row.state],
    freshness:current?'current':'stale',result:presented,cancellationRequested:row.cancel_requested,
    canCancel:owns && liveStates.includes(row.state),canRetry:owns && ['failed','dead_letter','cancelled','stale','expired','blocked'].includes(row.state),pollAfterMs:2000};
}
