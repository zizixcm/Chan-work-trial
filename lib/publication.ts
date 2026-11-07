import type { PoolClient } from 'pg';
import type { ApplicationSnapshot, Requirement } from './model';

export async function latestSubmission(db: PoolClient, applicationId: string) {
  return (await db.query('SELECT id,revision_number,submitted_at,source_content_revision::text,manifest FROM submissions WHERE application_id=$1 ORDER BY revision_number DESC LIMIT 1',[applicationId])).rows[0];
}
export function submissionDTO(row: any) {
  return row ? {id:row.id,revisionNumber:row.revision_number,submittedAt:new Date(row.submitted_at).toISOString()} : null;
}
/** Never fill frozen evidence fields from the live borrower draft. */
export async function publishedSnapshot(db: PoolClient, applicationId: string): Promise<ApplicationSnapshot> {
  const sent=await latestSubmission(db,applicationId);
  const app=(await db.query('SELECT id,borrower_name,property_name,address,transaction_type,requested_amount::float8,loi_reference,created_at FROM applications WHERE id=$1',[applicationId])).rows[0];
  if(!sent)return {application:{...app,created_at:new Date(app.created_at).toISOString()},requirements:[],documents:[],reviews:[],submission:null};
  const manifest=sent.manifest;
  const requirements:Requirement[]=manifest.requirements.map((r:any,index:number)=>({id:r.id,application_id:applicationId,title:r.title,category:r.category||'Other',purpose:r.purpose,period:r.period,owner:r.owner,applicability:r.applicability,sort_order:index,criteria:r.criteria||[],collection:r.collection||'borrower',stage:r.stage,condition:r.condition,evidence_revision:String(r.evidence_revision),definition_revision:String(r.definition_revision)}));
  const documents=(manifest.documents||[]).map((d:any)=>({id:d.id,application_id:applicationId,original_name:d.original_name,content_type:d.content_type,size_bytes:Number(d.size_bytes),sha256:d.sha256,uploaded_by:d.uploaded_by,created_at:d.created_at,requirement_ids:manifest.requirements.filter((r:any)=>r.document_ids.includes(d.id)).map((r:any)=>r.id)}));
  // Historical submission reviews stay visible. Legacy live reviews are exposed
  // only if the sent manifest included them and all their evidence was sent.
  const frozenReviewIds=(manifest.reviews||[]).filter((r:any)=>(r.document_ids||[]).every((id:string)=>manifest.document_ids.includes(id))).map((r:any)=>r.id);
  const reviews=(await db.query("SELECT id,application_id,requirement_id,decision,message,document_ids,reviewer,created_at,submission_id,evidence_revision::text,definition_revision::text FROM requirement_reviews WHERE application_id=$1 AND (submission_id IS NOT NULL OR id=ANY($2::text[])) ORDER BY sequence DESC,id DESC",[applicationId,frozenReviewIds])).rows.map(({submission_id,evidence_revision,definition_revision,...r})=>({...r,document_ids:JSON.parse(r.document_ids),created_at:new Date(r.created_at).toISOString(),is_current:submission_id===sent.id||(!submission_id&&requirements.some(q=>q.id===r.requirement_id&&q.evidence_revision===evidence_revision&&q.definition_revision===definition_revision))}));
  return {application:{...manifest.application,requested_amount:Number(manifest.application.requested_amount),created_at:new Date(app.created_at).toISOString()},requirements,documents,reviews,submission:submissionDTO(sent)};
}
