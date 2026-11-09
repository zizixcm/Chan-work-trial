import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { Access } from '../authorization';
import { pool } from '../db';
import { jobDTO } from '../jobs/core';
import { latestSubmission, submissionDTO } from '../publication';
import { borrowerTransaction } from './transaction';
import type { Assessment, Citation, ContextDocument, ContextRequirement, GroundedContext } from './contracts';

type Job = Awaited<ReturnType<typeof jobDTO>>;
type RequirementInput = Omit<ContextRequirement, 'assessment' | 'source' | 'evidencePresence'>;
const iso = (value: Date | string) => new Date(value).toISOString();
const textList = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 100 && value.every(x => typeof x === 'string' && x.length <= 16000);
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Only validated current verify results can inform completeness. Match findings,
 * stale results and file presence alone cannot promote a requirement. */
export function projectAssessment(requirement: Pick<ContextRequirement, 'id' | 'criteria' | 'definitionRevision' | 'evidenceRevision' | 'documentIds'>,
  documents: ContextDocument[], job: Job | undefined, intakeUnresolved: boolean): Assessment {
  const base: Assessment = {state: 'not_assessed', jobId: job?.id ?? null,
    freshness: job ? (job.freshness === 'current' ? 'current' : 'stale') : 'not_assessed',
    source: null, checks: [], missingEvidence: [], conflicts: [], limitations: []};
  if (!job) return base;
  if (job.freshness !== 'current') return {...base, state: 'outdated'};
  if (['queued', 'running', 'retry_wait'].includes(job.state)) return {...base, state: 'checking'};
  if (job.state !== 'succeeded') return {...base, state: 'unavailable'};
  const invalid = (): Assessment => ({...base, state: 'indeterminate', limitations: ['The current assessment could not be safely projected.']});
  const result = job.result;
  if (job.task !== 'verify_requirement.v1' || job.requirementId !== requirement.id ||
      !result || result.schemaVersion !== 'verify.v1' || result.requirementId !== requirement.id ||
      !Array.isArray(result.checks) || !Array.isArray(result.conflicts) || result.conflicts.length > 100 ||
      !textList(result.missingEvidence) || !textList(result.limitations)) return invalid();
  const docs = new Map(documents.filter(d => requirement.documentIds.includes(d.id)).map(d => [d.id, d]));
  function citations(value: unknown): Citation[] {
    if (!Array.isArray(value) || value.length > 8) throw new Error('Invalid citations');
    return value.map(c => {
      if (!c || typeof c !== 'object' || !docs.has(c.documentId) || !Number.isSafeInteger(c.record) || c.record < 1 ||
          !Number.isSafeInteger(c.column) || c.column < 1 || typeof c.quote !== 'string' || !c.quote || c.quote.length > 16000 ||
          (c.sourceLocation !== undefined && (typeof c.sourceLocation !== 'string' || c.sourceLocation.length > 2000))) throw new Error('Invalid citation');
      return {documentVersionId: c.documentId, sha256: docs.get(c.documentId)!.sha256,
        record: c.record, column: c.column, quote: c.quote,
        ...(c.sourceLocation ? {sourceLocation: c.sourceLocation} : {})};
    });
  }
  try {
    const expected = new Set(requirement.criteria.map((_, i) => `${requirement.id}:criterion:${i + 1}`));
    if (result.checks.length !== expected.size) return invalid();
    const checks: Assessment['checks'] = result.checks.map((c: any) => {
      if (!c || !expected.delete(c.criterionId) || !['met', 'unmet', 'unknown'].includes(c.state) ||
          typeof c.reason !== 'string' || c.reason.length > 16000) throw new Error('Invalid check');
      const sources = citations(c.evidence);
      if (c.state === 'met' && !sources.length) throw new Error('Unsupported positive');
      return {criterionId: c.criterionId, state: c.state, reason: c.reason, citations: sources};
    });
    const conflicts: Assessment['conflicts'] = result.conflicts.map((c: any) => {
      if (!c || typeof c.reason !== 'string' || c.reason.length > 16000) throw new Error('Invalid conflict');
      return {reason: c.reason, citations: citations(c.evidence)};
    });
    const limitations = [...result.limitations];
    if (intakeUnresolved) limitations.push('Upload intake or document matching is unresolved; this assessment may not cover all evidence.');
    // Same conservative semantics as deriveFulfillment; do not trust the model's
    // summary field when it contradicts checks or material limitations.
    const unknown = !checks.length || limitations.length > 0 || conflicts.length > 0 || checks.some(c => c.state === 'unknown');
    const state = unknown ? 'indeterminate' : checks.some(c => c.state === 'unmet') ? 'incomplete' :
      result.missingEvidence.length ? 'indeterminate' : 'appears_complete';
    return {...base, state, checks, conflicts, missingEvidence: [...result.missingEvidence], limitations,
      source: {kind: 'assessment', assessmentId: job.id, requirementId: requirement.id,
        definitionRevision: requirement.definitionRevision, evidenceRevision: requirement.evidenceRevision}};
  } catch { return invalid(); }
}

export class BorrowerContextService {
  constructor(private readonly access: Access, private readonly database: Pool = pool()) {}
  async read(): Promise<GroundedContext> {
    return borrowerTransaction(this.database, this.access, db => this.readInTransaction(db));
  }
  /** Caller must hold an authorized borrowerTransaction; never opens nested transactions. */
  async readInTransaction(db: PoolClient): Promise<GroundedContext> {
      const appId = this.access.applicationId;
      const app = (await db.query(`SELECT id,borrower_name,property_name,address,transaction_type,requested_amount::text,
        loi_reference,revision::text,content_revision::text FROM applications WHERE id=$1`, [appId])).rows[0];
      const rawRequirements = (await db.query(`SELECT id,title,purpose,period,owner,applicability,condition,stage,collection,
        criteria,definition_revision::text,evidence_revision::text FROM requirements
        WHERE application_id=$1 AND lifecycle='active' ORDER BY sort_order,id`, [appId])).rows;
      const rows = (await db.query(`SELECT d.id,d.original_name,d.content_type,d.size_bytes::float8,d.sha256,
        d.series_id,d.version_number,d.created_at FROM documents d WHERE d.application_id=$1
        AND NOT EXISTS(SELECT 1 FROM documents successor WHERE successor.application_id=d.application_id AND successor.replaces_document_id=d.id)
        AND NOT EXISTS(SELECT 1 FROM draft_document_removals removed WHERE removed.application_id=d.application_id AND removed.document_id=d.id AND removed.restored_at IS NULL)
        ORDER BY d.created_at,d.id`, [appId])).rows;
      const links = (await db.query(`SELECT rd.document_id,rd.requirement_id,rd.origin FROM requirement_documents rd
        JOIN requirements r ON r.application_id=rd.application_id AND r.id=rd.requirement_id
        WHERE rd.application_id=$1 AND rd.unlinked_at IS NULL AND r.lifecycle='active' ORDER BY rd.document_id,rd.requirement_id`, [appId])).rows;
      function document(d: Record<string, any>): ContextDocument {
        return {id: d.id, name: d.original_name, contentType: d.content_type, sizeBytes: d.size_bytes,
          sha256: d.sha256, seriesId: d.series_id, version: d.version_number, createdAt: iso(d.created_at),
          requirementIds: links.filter(l => l.document_id === d.id).map(l => l.requirement_id),
          source: {kind: 'document', documentVersionId: d.id, sha256: d.sha256}};
      }
      const documents = rows.map(document);
      // This relation pins the provided LOI; do not guess by filename or redirect
      // to a later version. Removed bytes remain unavailable through the portal.
      const loiRow = (await db.query(`SELECT d.id,d.original_name,d.content_type,d.size_bytes::float8,d.sha256,
        d.series_id,d.version_number,d.created_at FROM application_loi_documents l
        JOIN documents d ON d.application_id=l.application_id AND d.id=l.document_id WHERE l.application_id=$1
        AND NOT EXISTS(SELECT 1 FROM draft_document_removals removed WHERE removed.application_id=d.application_id AND removed.document_id=d.id AND removed.restored_at IS NULL)`, [appId])).rows[0];
      const batchRows = (await db.query(`SELECT b.id,b.state,m.id AS member_id,m.state AS member_state,m.document_id
        FROM upload_batches b LEFT JOIN upload_batch_members m ON m.batch_id=b.id AND m.application_id=b.application_id
        WHERE b.application_id=$1 AND b.user_id=$2 ORDER BY b.id,m.id`, [appId, this.access.userId])).rows;
      const jobs = (await db.query(`SELECT DISTINCT ON(task,target_id) * FROM analysis_jobs
        WHERE application_id=$1 AND initiated_by=$2 AND consent_scope='borrower'
        ORDER BY task,target_id,created_at DESC,id DESC`, [appId, this.access.userId])).rows;
      const currentDocIds = new Set(documents.map(d => d.id));
      const intake = {
        openBatches: new Set(batchRows.filter(r => r.state === 'open').map(r => r.id)).size,
        unsavedMembers: batchRows.filter(r => r.member_id && r.member_state !== 'saved').length,
        pendingMatches: jobs.filter(j => j.task === 'match_document.v1' && currentDocIds.has(j.document_id) && ['queued','running','retry_wait','blocked'].includes(j.state)).length,
      };
      const reviews = (await db.query(`SELECT DISTINCT ON(requirement_id) id,requirement_id,decision,message,created_at,
        evidence_revision::text,definition_revision::text,document_ids FROM requirement_reviews WHERE application_id=$1
        ORDER BY requirement_id,sequence DESC,id DESC`, [appId])).rows;
      const requirements: ContextRequirement[] = [];
      const jobRevisions: unknown[] = [];
      for (const r of rawRequirements) {
        const raw = jobs.find(j => j.task === 'verify_requirement.v1' && j.requirement_id === r.id);
        const job = raw ? await jobDTO(db, raw, {...this.access, role: 'borrower'}) : undefined;
        const documentIds = documents.filter(d => d.requirementIds.includes(r.id)).map(d => d.id);
        const review = reviews.find(v => v.requirement_id === r.id);
        const input: RequirementInput = {id: r.id, title: r.title, purpose: r.purpose, period: r.period, owner: r.owner,
          applicability: r.applicability, condition: r.condition || null, stage: r.stage || null,
          collection: r.collection, criteria: r.criteria, definitionRevision: r.definition_revision, evidenceRevision: r.evidence_revision,
          documentIds, lenderReview: review ? {id: review.id, decision: review.decision, message: review.message,
            createdAt: iso(review.created_at), current: review.definition_revision === r.definition_revision &&
              review.evidence_revision === r.evidence_revision &&
              JSON.stringify([...JSON.parse(review.document_ids)].sort()) === JSON.stringify([...documentIds].sort())} : null};
        requirements.push({...input, evidencePresence: documentIds.length ? 'present' : 'absent',
          source: {kind: 'requirement', requirementId: r.id, definitionRevision: r.definition_revision, evidenceRevision: r.evidence_revision},
          assessment: projectAssessment(input, documents, job, Object.values(intake).some(n => n > 0))});
        if (job) jobRevisions.push({id: job.id, revision: job.revision, freshness: job.freshness});
      }
      const sent = await latestSubmission(db, appId);
      const borrowerRequirements = requirements.filter(r => r.collection === 'borrower');
      const count = (state: Assessment['state']) => borrowerRequirements.filter(r => r.assessment.state === state).length;
      const context: Omit<GroundedContext, 'revision'> = {
        schemaVersion: 'borrower-context.v1',
        application: {id: app.id, borrowerName: app.borrower_name, propertyName: app.property_name, address: app.address,
          transactionType: app.transaction_type, requestedAmount: app.requested_amount, lifecycle: null,
          revision: app.revision, contentRevision: app.content_revision},
        loi: {reference: app.loi_reference, state: loiRow ? 'available' : 'unavailable', document: loiRow ? document(loiRow) : null},
        submission: submissionDTO(sent), hasUnsentChanges: !sent || sent.source_content_revision !== app.content_revision,
        requirements, documents, inventory: {complete: true, total: documents.length}, intake,
        counts: {filesSaved: documents.length, borrowerRequests: borrowerRequirements.length,
          requestsWithFiles: borrowerRequirements.filter(r => r.documentIds.length > 0).length,
          checking: count('checking'), appearsComplete: count('appears_complete'), incomplete: count('incomplete'),
          indeterminate: count('indeterminate'), outdated: count('outdated')},
      };
      // Include job revisions and unresolved intake identities even when their
      // public count is unchanged. This is a context token, not a worker fence.
      return {...context, revision: digest({context, jobRevisions, batchRows,
        matching: jobs.filter(j => j.task === 'match_document.v1').map(j => ({id:j.id,revision:String(j.revision),state:j.state})), links})};
  }
}
