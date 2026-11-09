import { isDeepStrictEqual } from 'node:util';
import { ANALYSIS_FORMATS } from '../analysis/formats';
import type { Pool } from 'pg';
import { analysisFingerprint, enqueue, preference, snapshot, transaction } from './core';
import type { TaskKind } from '../backend/contracts';

/** Mutation markers survive crashes; stale workers never schedule replacements.
 * Application-first locks serialize snapshot selection and marker removal. */
export async function reconcileAnalysis(database:Pool) {
  const expired=(await database.query("SELECT DISTINCT application_id FROM upload_batches WHERE state='open' AND deadline_at<=now() LIMIT 20")).rows;
  for(const row of expired)await transaction(database,async db=>{
    await db.query('SELECT id FROM applications WHERE id=$1 FOR UPDATE',[row.application_id]);
    await db.query(`UPDATE upload_batch_members SET state='failed' WHERE state='pending' AND batch_id IN
      (SELECT id FROM upload_batches WHERE application_id=$1 AND state='open' AND deadline_at<=now())`,[row.application_id]);
    await db.query("UPDATE upload_batches SET state='expired' WHERE application_id=$1 AND state='open' AND deadline_at<=now()",[row.application_id]);
  });
  const dirty=(await database.query('SELECT application_id FROM analysis_invalidations ORDER BY changed_at LIMIT 20')).rows;
  for(const {application_id:app} of dirty)await transaction(database,async db=>{
    await db.query('SELECT id FROM applications WHERE id=$1 FOR UPDATE',[app]);
    const change=(await db.query('SELECT changed_at FROM analysis_invalidations WHERE application_id=$1',[app])).rows[0];
    if(!change)return;
    // Deployment and preference changes alone must never dispatch old uploads.
    const users=(await db.query(`SELECT m.user_id FROM application_memberships m
      WHERE m.application_id=$1 AND m.active AND m.role='borrower' AND EXISTS(
        SELECT 1 FROM analysis_jobs j WHERE j.application_id=m.application_id AND j.initiated_by=m.user_id AND j.automatic)`,[app])).rows;
    const documents=(await db.query(`SELECT d.id FROM documents d WHERE d.application_id=$1 AND split_part(d.content_type,';',1)=ANY($2::text[])
      AND NOT EXISTS(SELECT 1 FROM draft_document_removals removed WHERE removed.application_id=d.application_id AND removed.document_id=d.id AND removed.restored_at IS NULL)
      AND NOT EXISTS(SELECT 1 FROM documents successor WHERE successor.replaces_document_id=d.id) ORDER BY d.id`,[app,ANALYSIS_FORMATS])).rows;
    const requirements=(await db.query("SELECT id FROM requirements WHERE application_id=$1 AND lifecycle='active' AND collection='borrower' ORDER BY id",[app])).rows;
    for(const {user_id:user} of users) {
      const pref=await preference(db,user);
      const ensure=async(task:TaskKind,target:string)=>{
        const input=await snapshot(db,app,task,target);
        if(task==='verify_requirement.v1') {
          // Intake uncertainty may stale every displayed assessment, but does not
          // justify paying to recheck requirements whose files did not change.
          const prior=(await db.query(`SELECT input FROM analysis_jobs WHERE application_id=$1 AND initiated_by=$2
            AND task=$3 AND target_id=$4 AND consent_scope='borrower' ORDER BY created_at DESC,id DESC LIMIT 1`,[app,user,task,target])).rows[0];
          if(!prior && (!input.documents.length || !(await db.query(`SELECT 1 FROM analysis_jobs WHERE application_id=$1
            AND initiated_by=$2 AND automatic AND document_id=ANY($3::text[]) LIMIT 1`,[app,user,input.documents.map(d=>d.id)])).rowCount))return;
          const batchIds=new Set((await db.query(`SELECT DISTINCT b.id FROM upload_batches b JOIN upload_batch_members m ON m.batch_id=b.id
            WHERE b.application_id=$1 AND (m.requirement_id=$2 OR EXISTS(SELECT 1 FROM requirement_documents rd
              WHERE rd.application_id=$1 AND rd.document_id=m.document_id AND rd.requirement_id=$2))`,[app,target])).rows.map(r=>r.id));
          const workKey=(value:typeof input)=>{
            const observed=value.observed as {definitions:unknown;versions:unknown;batches?:Array<{id:string}>;pendingMatches?:Array<{document_id:string}>;unresolvedMatches?:Array<{id:string}>;replacedLinks?:unknown};
            const ids=new Set(value.documents.map(d=>d.id));
            return {version:value.version,model:value.model,documents:value.documents,requirements:value.requirements,
              definitions:observed.definitions,versions:observed.versions,replacedLinks:observed.replacedLinks,
              batches:observed.batches?.filter(b=>batchIds.has(b.id)),
              pending:observed.pendingMatches?.filter(d=>ids.has(d.document_id)),
              unresolved:observed.unresolvedMatches?.filter(d=>ids.has(d.id))};
          };
          if(prior && isDeepStrictEqual(workKey(prior.input),workKey(input)))return;
        }
        const fingerprint=analysisFingerprint(input,task,'borrower',pref.epoch,user,true);
        // Do not reset retry budgets or undo cancellation for identical inputs.
        const known=(await db.query(`SELECT 1 FROM analysis_jobs WHERE application_id=$1 AND initiated_by=$2 AND task=$3
          AND consent_scope='borrower' AND (fingerprint=$4 OR result_fingerprint=$4) LIMIT 1`,[app,user,task,fingerprint])).rowCount;
        if(!known)await enqueue(db,app,user,task,target,'background');
      };
      for(const d of documents)if((await db.query('SELECT 1 FROM analysis_jobs WHERE application_id=$1 AND initiated_by=$2 AND (document_id=$3 OR document_id=(SELECT replaces_document_id FROM documents WHERE id=$3)) AND automatic LIMIT 1',[app,user,d.id])).rowCount)await ensure('match_document.v1',d.id);
      for(const r of requirements)await ensure('verify_requirement.v1',r.id);
    }
    // Keep the marker while matching is unfinished, including retries. Its
    // terminal outcome then releases assessments without a queue-to-app lock inversion.
    await db.query(`DELETE FROM analysis_invalidations WHERE application_id=$1 AND NOT EXISTS(
      SELECT 1 FROM analysis_jobs WHERE application_id=$1 AND task='match_document.v1'
      AND state IN ('queued','running','retry_wait','blocked'))`,[app]);
  });
}
