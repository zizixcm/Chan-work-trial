import type { PoolClient } from 'pg';
import type { Access } from '../authorization';
import { supportsAnalysis } from '../analysis/formats';
import { jobDTO, liveStates } from './core';

export type BatchJob = Awaited<ReturnType<typeof jobDTO>>;
export type BatchValidity = {state:'waiting'|'checking'|'passed'|'failed'|'unknown';message:string};
export type BatchProcessingStatus = {
  stage:'uploading'|'processing_documents'|'checking_requirements'|'complete'|'attention_required';
  documentsSettled:boolean;
  needsReview:boolean;
  requirements:Array<{id:string;title:string;documentIds:string[];job:BatchJob|null}>;
  pollAfterMs:number;
};
export type BatchStatusMember = {
  id:string;name:string;state:string;document_id:string|null;updated:boolean;
  validity:BatchValidity;
  matching:{state:string;job:BatchJob|null};
};

/** Read only. Progress comes from durable uploads, fenced worker events and
 * current results; polling never schedules work or invents an extraction pass. */
export async function batchProcessingStatus(db:PoolClient,access:Access,batch:{id:string;state:string}) {
  const rows=(await db.query(`SELECT m.id,m.name,m.state,m.document_id,d.content_type,
    EXISTS(SELECT 1 FROM analysis_jobs history JOIN analysis_events e ON e.job_id=history.id
      WHERE history.application_id=d.application_id AND history.document_id=d.id
      AND history.initiated_by=$2 AND history.consent_scope='borrower' AND history.task='match_document.v1'
      AND history.input->'documents' @> jsonb_build_array(jsonb_build_object('id',d.id,'sha256',d.sha256,'contentType',d.content_type))
      AND e.event='prepared') AS previously_read,
    coalesce(d.created_at>=b.created_at OR removed.restored_at>=b.created_at,false) AS updated,
    (removed.document_id IS NOT NULL AND removed.restored_at IS NULL) AS removed
    FROM upload_batch_members m JOIN upload_batches b ON b.id=m.batch_id
    LEFT JOIN documents d ON d.application_id=m.application_id AND d.id=m.document_id
    LEFT JOIN draft_document_removals removed ON removed.application_id=m.application_id AND removed.document_id=m.document_id
    WHERE m.batch_id=$1 ORDER BY m.id`,[batch.id,access.userId])).rows;
  const members:BatchStatusMember[]=[];
  let pending=false,attention=false,needsReview=false;
  for(const row of rows) {
    const raw=row.document_id?(await db.query(`SELECT j.*,
      EXISTS(SELECT 1 FROM analysis_events e WHERE e.job_id=j.id AND e.token=j.token AND e.event='prepared') AS prepared
      FROM analysis_jobs j WHERE j.application_id=$1 AND j.initiated_by=$2 AND j.consent_scope='borrower'
      AND j.task='match_document.v1' AND j.document_id=$3 ORDER BY j.created_at DESC,j.id DESC LIMIT 1`,[access.applicationId,access.userId,row.document_id])).rows[0]:null;
    const job=raw&&!row.removed?await jobDTO(db,raw,access):null;
    let validity:BatchValidity={state:'unknown',message:'Readability has not been confirmed.'};
    let matchingState=job?.state||'not_requested';
    if(row.removed){matchingState='removed';validity={state:'unknown',message:'Removed from this draft.'};attention=true;}
    else if(row.state!=='saved') {
      matchingState=row.state==='pending'?'waiting_for_upload':'not_saved';
      validity={state:row.state==='pending'?'waiting':'unknown',message:row.state==='pending'?'Waiting for upload.':'File was not saved; readability was not checked.'};
      if(row.state==='pending')pending=true;else attention=true;
    } else if(!supportsAnalysis(row.content_type)) {
      matchingState='unsupported';validity={state:'failed',message:'This format cannot be processed automatically.'};attention=true;
    } else if(job) {
      // Reading is a property of these immutable bytes. A requirement change,
      // retry, or missing phase event on a later attempt cannot erase that fact.
      if(row.previously_read)validity={state:'passed',message:'The file was read and prepared for analysis. This is not a content approval.'};
      else if(job.freshness==='stale')validity={state:'unknown',message:'The document or analysis context changed; a current check is needed.'};
      else if(raw.safe_code==='unsupported_input')validity={state:'failed',message:'This file could not be read or processed within the supported limits.'};
      else if(job.state==='running')validity={state:'checking',message:'Reading and preparing the file.'};
      else if(['queued','retry_wait','blocked'].includes(job.state))validity={state:'waiting',message:'Waiting for the file reader.'};
      if(liveStates.includes(job.state))pending=true;
      if(job.state==='blocked'||(!liveStates.includes(job.state)&&(job.state!=='succeeded'||job.freshness!=='current')))attention=true;
    } else {attention=true;}
    if(row.state==='saved'&&validity.state==='unknown')attention=true;
    if(job?.state==='succeeded'&&job.freshness==='current') {
      const candidates=job.result?.requirements as Array<{relevance:{state:string}}> | undefined;
      if(!candidates?.some(r=>r.relevance.state==='relevant')||candidates.some(r=>r.relevance.state==='ambiguous'))needsReview=true;
    }
    members.push({id:row.id,name:row.name,state:row.state,document_id:row.document_id,updated:row.updated,validity,matching:{state:matchingState,job}});
  }
  // Include formerly linked requirements changed by removal/replacement after
  // this batch began. An unchanged duplicate still owns no completeness work.
  const updatedIds=rows.filter(r=>r.updated&&r.state==='saved').map(r=>r.document_id);
  const affected=(await db.query(`SELECT r.id,r.title,array_agg(DISTINCT d.id ORDER BY d.id) AS document_ids
    FROM documents d JOIN upload_batches b ON b.id=$3
    JOIN requirement_documents rd ON rd.application_id=d.application_id AND (rd.document_id=d.id OR rd.document_id=d.replaces_document_id)
    JOIN requirements r ON r.application_id=rd.application_id AND r.id=rd.requirement_id
    WHERE r.application_id=$1 AND r.lifecycle='active' AND r.collection='borrower'
    AND (rd.unlinked_at IS NULL OR rd.unlinked_at>=b.created_at)
    AND d.id=ANY($2::text[]) GROUP BY r.id,r.title ORDER BY r.id`,[access.applicationId,updatedIds,batch.id])).rows;
  const requirements:BatchProcessingStatus['requirements']=[];
  let checksPending=false;
  for(const r of affected) {
    const raw=(await db.query(`SELECT * FROM analysis_jobs WHERE application_id=$1 AND initiated_by=$2 AND consent_scope='borrower'
      AND task='verify_requirement.v1' AND requirement_id=$3 ORDER BY created_at DESC,id DESC LIMIT 1`,[access.applicationId,access.userId,r.id])).rows[0];
    const job=raw?await jobDTO(db,raw,access):null;
    if(!job||liveStates.includes(job.state)||job.freshness==='stale')checksPending=true;
    if(job&&(job.state==='blocked'||(!liveStates.includes(job.state)&&job.state!=='succeeded')))attention=true;
    if(job?.state==='succeeded'&&job.freshness==='current'&&job.result?.fulfillment!=='fulfilled')needsReview=true;
    requirements.push({id:r.id,title:r.title,documentIds:r.document_ids,job});
  }
  const documentsSettled=batch.state!=='open'&&!pending;
  const stage:BatchProcessingStatus['stage']=attention?'attention_required':batch.state==='open'?'uploading':!documentsSettled?'processing_documents':checksPending?'checking_requirements':'complete';
  return {members,processing:{stage,documentsSettled,needsReview:attention||needsReview,requirements,pollAfterMs:2000} satisfies BatchProcessingStatus};
}
