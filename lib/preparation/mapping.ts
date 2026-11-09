import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import { digest } from '../preparation-pilot/contracts';
import type { ProcessingResult } from './protocol';
import type { PreparationAccess,PreparationService } from './service';
import { processorMode,routeAdaptiveObligation } from './ownership';
/** Proposal only: a positive criterion cites an inspected active source. Accuracy is evaluated separately. */
export async function deriveMappingActions(db:PoolClient,result:ProcessingResult,runId:string):Promise<ProcessingResult['allowedNextActions']>{
 const actions:ProcessingResult['allowedNextActions']=[];
 const proposals=(await db.query('SELECT * FROM preparation_mapping_proposals WHERE run_id=$1',[runId])).rows;
 for(const requirement of result.requirements){
  const ids=new Set(requirement.checks.filter(c=>c.state==='met').flatMap(c=>c.citationIds));
  const documents=new Set(result.citations.filter(c=>ids.has(c.citationId)&&c.kind!=='structured_record').map(c=>'documentId' in c?c.documentId:''));
  for(const p of proposals.filter(p=>p.requirement_id===requirement.requirementId))documents.add(p.document_id);
  for(const documentId of documents){
   if(!(await db.query("SELECT 1 FROM requirements WHERE application_id=$1 AND id=$2 AND collection='borrower' AND lifecycle='active'",[result.applicationId,requirement.requirementId])).rowCount)continue;
   const existing=await db.query('SELECT 1 FROM requirement_documents WHERE application_id=$1 AND requirement_id=$2 AND document_id=$3 AND unlinked_at IS NULL',[result.applicationId,requirement.requirementId,documentId]);
   const rejected=await db.query('SELECT 1 FROM document_match_rejections WHERE application_id=$1 AND requirement_id=$2 AND document_id=$3',[result.applicationId,requirement.requirementId,documentId]);
   if(existing.rowCount||rejected.rowCount)continue;
   const proposal=proposals.find(p=>p.document_id===documentId&&p.requirement_id===requirement.requirementId);
   actions.push({...(proposal?{mappingProposalId:proposal.id}:{}),automaticEligibility:proposal?.payload.relevance==='clear'&&proposal.payload.conflicts.length===0&&/^[a-f0-9]{64}$/.test(proposal.payload.configurationDigest??'')?'clear_supported':'confirmation_only',actionId:randomUUID(),kind:'confirm_link',owner:'borrower',expectedRevision:result.resultRevision,documentId,requirementId:requirement.requirementId,expectedEvidenceRevision:requirement.evidenceRevision});
  }
 }
 return actions;
}
const inputSchema=z.strictObject({resultId:z.string().min(1),resultRevision:z.string().regex(/^[1-9][0-9]*$/),actionId:z.string().min(1),idempotencyKey:z.string().min(1)});
/** Explicit confirmation or operator-owned evaluated automatic gate. No remove/replace/unlink capability. */
export async function confirmPreparationMapping(service:PreparationService,access:PreparationAccess,value:unknown,automatic?:{evaluationId:string;configurationDigest:string}){
 const input=inputSchema.parse(value),hash=digest({input,automatic:automatic??null});
 return service.transaction(access,async db=>{
  const previous=(await db.query('SELECT * FROM preparation_mapping_commands WHERE application_id=$1 AND user_id=$2 AND idempotency_key=$3',[access.applicationId,access.userId,input.idempotencyKey])).rows[0];
  if(previous){if(previous.payload_hash!==hash)throw new Error('Mapping replay conflict');return previous.outcome;}
  const result=await service.readResult(db,access,input.resultId,input.resultRevision);if(result.freshness!=='current')throw new Error('Mapping proposal outdated');
  const action=result.allowedNextActions.find(a=>a.actionId===input.actionId&&a.kind==='confirm_link');if(!action?.documentId||!action.requirementId||!action.expectedEvidenceRevision)throw new Error('Mapping proposal unavailable');
  const mode=await processorMode(db,access.applicationId);if(mode.mode!=='adaptive')throw new Error('Processing mode changed');
  if(automatic){if(action.automaticEligibility!=='clear_supported'||!action.mappingProposalId)throw new Error('Mapping requires borrower confirmation');const proposal=(await db.query('SELECT * FROM preparation_mapping_proposals WHERE id=$1 AND application_id=$2 AND user_id=$3',[action.mappingProposalId,access.applicationId,access.userId])).rows[0];if(!proposal||proposal.payload.relevance!=='clear'||proposal.payload.conflicts.length||Object.values(proposal.payload.basis as Record<string,unknown[]>).some(e=>!e.length))throw new Error('Mapping requires borrower confirmation');const pref=(await db.query('SELECT enabled FROM user_ai_preferences WHERE user_id=$1',[access.userId])).rows[0];if(!pref?.enabled)throw new Error('Automatic grant revoked');const gate=(await db.query('SELECT * FROM preparation_mapping_gates WHERE application_id=$1 AND enabled',[access.applicationId])).rows[0];if(!gate||gate.evaluation_id!==automatic.evaluationId||gate.configuration_digest!==automatic.configurationDigest||gate.configuration_digest!==proposal.payload.configurationDigest)throw new Error('Mapping quality gate is closed');}
  const requirement=(await db.query("SELECT evidence_revision::text FROM requirements WHERE application_id=$1 AND id=$2 AND lifecycle='active' AND collection='borrower'",[access.applicationId,action.requirementId])).rows[0];
  const inventory=await service.inventory(db,access.applicationId);if(!requirement||requirement.evidence_revision!==action.expectedEvidenceRevision||!inventory.documents.some(d=>d.documentId===action.documentId&&d.active))throw new Error('Mapping dependencies changed');
  if((await db.query('SELECT 1 FROM document_match_rejections WHERE application_id=$1 AND requirement_id=$2 AND document_id=$3',[access.applicationId,action.requirementId,action.documentId])).rowCount)throw new Error('Human correction takes precedence');
  const linked=(await db.query('SELECT 1 FROM requirement_documents WHERE application_id=$1 AND requirement_id=$2 AND document_id=$3 AND unlinked_at IS NULL',[access.applicationId,action.requirementId,action.documentId])).rowCount;
  if(linked)throw new Error('Mapping already changed; refresh');
  const run=(await db.query('SELECT id FROM preparation_runs WHERE id=$1 AND preparation_id=$2 AND application_id=$3 AND user_id=$4',[result.coverageRef.id,result.preparationId,access.applicationId,access.userId])).rows[0];if(!run)throw new Error('Mapping provenance unavailable');
  await db.query("INSERT INTO requirement_documents(application_id,requirement_id,document_id,linked_by_user_id,origin,preparation_run_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(requirement_id,document_id) DO UPDATE SET linked_at=now(),unlinked_at=NULL,linked_by_user_id=excluded.linked_by_user_id,origin=excluded.origin,analysis_job_id=NULL,preparation_run_id=excluded.preparation_run_id",[access.applicationId,action.requirementId,action.documentId,automatic?null:access.userId,automatic?'model':'human',run.id]);
  await db.query("INSERT INTO document_match_events(id,application_id,document_id,requirement_id,action,origin,actor_user_id,preparation_run_id,evidence,reason) VALUES($1,$2,$3,$4,'link',$5,$6,$7,$8,$9)",[randomUUID(),access.applicationId,action.documentId,action.requirementId,automatic?'model':'human',automatic?null:access.userId,run.id,JSON.stringify(result.citations),'Confirmed preparation evidence association']);
  const revision=(await db.query('SELECT content_revision::text FROM applications WHERE id=$1',[access.applicationId])).rows[0].content_revision;await routeAdaptiveObligation(db,access.applicationId,access.userId,`verify_requirement.v1:${action.requirementId}:${revision}`);
  const outcome={changed:true,documentId:action.documentId,requirementId:action.requirementId,origin:automatic?'model':'human'};
  await db.query('INSERT INTO preparation_mapping_commands VALUES($1,$2,$3,$4,$5)',[access.applicationId,access.userId,input.idempotencyKey,hash,outcome]);return outcome;
 });
}
