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
    // A preference change alone never schedules old uploads.
    const users=(await db.query(`SELECT m.user_id FROM application_memberships m JOIN user_ai_preferences p ON p.user_id=m.user_id
      WHERE m.application_id=$1 AND m.active AND m.role='borrower' AND p.enabled
      AND p.updated_at<=(SELECT changed_at FROM analysis_invalidations WHERE application_id=$1)`,[app])).rows;
    const documents=(await db.query(`SELECT d.id FROM documents d WHERE d.application_id=$1 AND split_part(d.content_type,';',1)='text/csv'
      AND NOT EXISTS(SELECT 1 FROM documents successor WHERE successor.replaces_document_id=d.id) ORDER BY d.id`,[app])).rows;
    const requirements=(await db.query("SELECT id FROM requirements WHERE application_id=$1 AND lifecycle='active' AND collection='borrower' ORDER BY id",[app])).rows;
    for(const {user_id:user} of users) {
      const pref=await preference(db,user);
      const ensure=async(task:TaskKind,target:string)=>{
        const input=await snapshot(db,app,task,target);
        const fingerprint=analysisFingerprint(input,task,'borrower',pref.epoch,user);
        // Do not reset retry budgets or undo cancellation for identical inputs.
        const known=(await db.query(`SELECT 1 FROM analysis_jobs WHERE application_id=$1 AND initiated_by=$2 AND task=$3
          AND consent_scope='borrower' AND (fingerprint=$4 OR result_fingerprint=$4) LIMIT 1`,[app,user,task,fingerprint])).rowCount;
        if(!known)await enqueue(db,app,user,task,target,'background');
      };
      for(const d of documents)await ensure('match_document.v1',d.id);
      for(const r of requirements)await ensure('verify_requirement.v1',r.id);
    }
    // Keep the marker while matching is unfinished, including retries. Its
    // terminal outcome then releases assessments without a queue-to-app lock inversion.
    await db.query(`DELETE FROM analysis_invalidations WHERE application_id=$1 AND NOT EXISTS(
      SELECT 1 FROM analysis_jobs WHERE application_id=$1 AND task='match_document.v1'
      AND state IN ('queued','running','retry_wait','blocked'))`,[app]);
  });
}
