import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { pool } from '../db';
import { LocalBlobStorage } from '../storage/local';
import type { JobRepository, JobLease, Slot, DispatchBudget, DispatchReservation, ProviderResult, ProviderUsage, FailureDisposition } from '../backend/contracts';
import type { AnalysisSnapshot } from '../backend/prepare-analysis';
import { AnalysisFailure } from '../backend/failures';
import { DEFAULT_ANALYSIS_MODEL } from '../backend/provider-executor';
import { selectSharedLane } from '../backend/scheduler';
import type { MatchResult } from '../analysis/types';
import { analysisFingerprint, enqueueForRequirement, preference, snapshot, transaction } from './core';

type Row=Record<string,any>;
const numberEnv=(name:string,fallback:number)=>{const n=Number(process.env[name]??fallback);return Number.isFinite(n)&&n>0?n:fallback;};
export class PostgresJobRepository implements JobRepository<AnalysisSnapshot> {
  constructor(private database:Pool=pool(), private storage=new LocalBlobStorage()) {}
  private lease(row:Row):JobLease<AnalysisSnapshot> { return {id:row.id,applicationId:row.application_id,task:row.task,lane:row.lane,token:String(row.token),attempt:row.attempt,providerAttempts:row.provider_attempts,deadlineAt:new Date(row.attempt_deadline).toISOString(),input:row.input}; }
  private async event(db:PoolClient,row:Row,event:string,code?:string) {await db.query('INSERT INTO analysis_events(application_id,job_id,event,token,safe_code) VALUES($1,$2,$3,$4,$5)',[row.application_id,row.id,event,row.token,code||null]);}
  private async state(db:PoolClient,row:Row,state:string,code?:string,availableAt?:string) {
    await db.query(`UPDATE analysis_jobs SET state=$2,safe_code=$3,attempt=CASE WHEN $2='blocked' THEN greatest(0,attempt-1) ELSE attempt END,available_at=coalesce($4::timestamptz,available_at),lease_expires_at=NULL,slot=NULL,updated_at=now(),revision=revision+1 WHERE id=$1`,[row.id,state,code||null,availableAt||null]);
    await this.event(db,row,state,code);
  }
  /** Application-first ordering matches all web mutations; queue-only claims use SKIP LOCKED. */
  private async gated(db:PoolClient,job:JobLease<AnalysisSnapshot>):Promise<Row|null> {
    await db.query('SELECT id FROM applications WHERE id=$1 FOR UPDATE',[job.applicationId]);
    const row=(await db.query(`SELECT *,lease_expires_at>now() AND attempt_deadline>now() AND expires_at>now() AS lease_valid FROM analysis_jobs WHERE application_id=$1 AND id=$2 FOR UPDATE`,[job.applicationId,job.id])).rows[0];
    if (!row || row.state!=='running' || String(row.token)!==job.token || !row.lease_valid) return null;
    if(row.cancel_requested){await this.state(db,row,'cancelled','cancelled');return null;}
    const membership=(await db.query('SELECT role FROM application_memberships WHERE application_id=$1 AND user_id=$2 AND active FOR SHARE',[row.application_id,row.initiated_by])).rows[0];
    const pref=await preference(db,row.initiated_by);
    let current=false;
    try {current=analysisFingerprint(await snapshot(db,row.application_id,row.task,row.target_id,row.consent_scope),row.task,row.consent_scope,pref.epoch,row.initiated_by)===row.fingerprint;} catch {current=false;}
    if(!membership || membership.role!==row.consent_scope || (row.consent_scope==='lender' && row.task!=='verify_requirement.v1') || (row.consent_scope==='borrower' && (!pref.enabled || String(row.consent_epoch)!==pref.epoch)) || !current){await this.state(db,row,'stale');return null;}
    return row;
  }
  async claim(slot:Slot,owner:string) {
    return transaction(this.database,async db=>{
      const schedule=(await db.query('SELECT * FROM analysis_scheduler WHERE id=1 FOR UPDATE')).rows[0];
      if((await db.query("SELECT 1 FROM analysis_jobs WHERE slot=$1 AND state='running' AND lease_expires_at>now() LIMIT 1",[slot])).rowCount) return null;
      const available=(await db.query(`SELECT lane,min(created_at) oldest FROM analysis_jobs WHERE state IN ('queued','retry_wait','blocked') AND available_at<=now() AND expires_at>now() AND attempt<5 AND provider_attempts<3 GROUP BY lane`)).rows;
      let lane='interactive';
      if(slot==='shared') {
        const background=available.find(r=>r.lane==='background');
        lane=selectSharedLane({interactiveReady:available.some(r=>r.lane==='interactive'),backgroundReady:!!background,consecutiveInteractive:schedule.interactive_streak,oldestBackgroundWaitMs:background?Date.now()-new Date(background.oldest).getTime():0})||'';
      }
      if(!lane)return null;
      const row=(await db.query(`SELECT j.* FROM analysis_jobs j WHERE j.lane=$1 AND j.state IN ('queued','retry_wait','blocked') AND j.available_at<=now() AND j.expires_at>now() AND j.attempt<5 AND j.provider_attempts<3
        AND (SELECT count(*) FROM analysis_jobs active WHERE active.application_id=j.application_id AND active.state='running' AND active.lease_expires_at>now())<2
        ORDER BY (j.application_id IS NOT DISTINCT FROM $2),j.created_at,j.id FOR UPDATE SKIP LOCKED LIMIT 1`,[lane,schedule.last_application])).rows[0];
      if(!row)return null;
      const claimed=(await db.query(`UPDATE analysis_jobs SET state='running',attempt=attempt+1,token=token+1,lease_owner=$2,slot=$3,lease_expires_at=now()+interval '45 seconds',attempt_deadline=now()+interval '90 seconds',updated_at=now(),revision=revision+1 WHERE id=$1 RETURNING *`,[row.id,owner,slot])).rows[0];
      await db.query('UPDATE analysis_scheduler SET last_application=$1,interactive_streak=CASE WHEN $2=\'shared\' THEN CASE WHEN $3=\'interactive\' THEN interactive_streak+1 ELSE 0 END ELSE interactive_streak END WHERE id=1',[row.application_id,slot,lane]);
      await this.event(db,claimed,'running');return this.lease(claimed);
    });
  }
  async heartbeat(job:JobLease<AnalysisSnapshot>) {
    const result=await this.database.query(`UPDATE analysis_jobs SET lease_expires_at=least(now()+interval '45 seconds',attempt_deadline) WHERE application_id=$1 AND id=$2 AND token=$3 AND state='running' AND NOT cancel_requested AND lease_expires_at>now() AND attempt_deadline>now()`,[job.applicationId,job.id,job.token]);
    return !!result.rowCount;
  }
  async authorizePreparation(job:JobLease<AnalysisSnapshot>) {return transaction(this.database,async db=>!!await this.gated(db,job));}
  async readEvidence(job:JobLease<AnalysisSnapshot>,documentId:string,signal:AbortSignal) {
    const document=await transaction(this.database,async db=>{
      const row=await this.gated(db,job);if(!row || signal.aborted)throw new AnalysisFailure('cancelled');
      if(!row.input.documents.some((d:{id:string})=>d.id===documentId))throw new AnalysisFailure('unsupported_input');
      return (await db.query('SELECT storage_key,size_bytes FROM documents WHERE application_id=$1 AND id=$2',[job.applicationId,documentId])).rows[0];
    });
    if(!document)throw new AnalysisFailure('unsupported_input');
    const bytes=await this.storage.get(document.storage_key);
    if(bytes.length!==Number(document.size_bytes))throw new AnalysisFailure('unsupported_input');
    return bytes;
  }
  async admitDispatch(job:JobLease<AnalysisSnapshot>,budget:DispatchBudget):Promise<DispatchReservation|null> {
    return transaction(this.database,async db=>{
      const row=await this.gated(db,job);if(!row)return null;
      if(!process.env.OPENROUTER_API_KEY?.trim() || budget.model!==DEFAULT_ANALYSIS_MODEL){await this.state(db,row,'blocked','configuration_required',new Date(Date.now()+60_000).toISOString());return null;}
      const schedule=(await db.query('SELECT * FROM analysis_scheduler WHERE id=1 FOR UPDATE')).rows[0];
      const stats=(await db.query(`SELECT count(*) FILTER(WHERE active_until>now() AND NOT finished)::int active,
        count(*) FILTER(WHERE created_at>now()-interval '1 minute')::int recent,
        coalesce(sum(coalesce(accounted_usd,reserved_usd)) FILTER(WHERE created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'),0)::float8 daily,
        coalesce(sum(coalesce(accounted_usd,reserved_usd)) FILTER(WHERE application_id=$1 AND created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'),0)::float8 app_daily
        FROM analysis_reservations`,[row.application_id])).rows[0];
      // Pin prices to this one cheap model. Unsupported custom models fail closed
      // until their explicit accounting config is implemented.
      const cost=(budget.maxInputTokens*0.10+budget.maxOutputTokens*0.40)/1_000_000;
      const daily=numberEnv('AI_DAILY_BUDGET_USD',0.10),perApp=numberEnv('AI_APPLICATION_DAILY_BUDGET_USD',0.05);
      const rpm=Math.max(2,Math.floor(numberEnv('AI_REQUESTS_PER_MINUTE',20)));
      const budgetBlocked=stats.daily+cost>daily || stats.app_daily+cost>perApp;
      if(budgetBlocked || stats.active>=2 || stats.recent>=(row.lane==='background'?rpm-1:rpm) || new Date(schedule.cooldown_until).getTime()>Date.now()) {
        await this.state(db,row,'blocked',budgetBlocked?'budget_exhausted':'rate_limited',new Date(Date.now()+30_000).toISOString());return null;
      }
      const id=randomUUID();
      await db.query(`INSERT INTO analysis_reservations(id,application_id,job_id,token,active_until,model,input_limit,output_limit,reserved_usd) VALUES($1,$2,$3,$4,now()+($5::integer+10000)*interval '1 millisecond',$6,$7,$8,$9)`,[id,row.application_id,row.id,row.token,budget.timeoutMs,budget.model,budget.maxInputTokens,budget.maxOutputTokens,cost]);
      await db.query('UPDATE analysis_jobs SET provider_attempts=provider_attempts+1 WHERE id=$1',[row.id]);
      await this.event(db,row,'dispatch');return {id};
    });
  }
  async finishReservation(reservation:DispatchReservation,usage:ProviderUsage|null) {
    const known=usage?.inputTokens!==undefined && usage.outputTokens!==undefined;
    const cost=known?(usage.inputTokens!*0.10+usage.outputTokens!*0.40)/1_000_000:null;
    await this.database.query(`UPDATE analysis_reservations SET finished=$5,input_tokens=$2,output_tokens=$3,accounted_usd=$4 WHERE id=$1 AND NOT finished`,[reservation.id,usage?.inputTokens??null,usage?.outputTokens??null,cost,known]);
  }
  async commit(job:JobLease<AnalysisSnapshot>,result:ProviderResult) {
    return transaction(this.database,async db=>{
      const row=await this.gated(db,job);if(!row)return false;
      if(result.model!==row.input.model)throw new AnalysisFailure('invalid_output');
      const affected=new Set<string>();
      if(row.task==='match_document.v1') {
        const value=result.value as MatchResult;
        if(value.schemaVersion!=='match.v1' || !Array.isArray(value.requirements))throw new AnalysisFailure('invalid_output');
        for(const match of value.requirements) {
          if(!row.input.requirements.some((r:{id:string})=>r.id===match.requirementId))throw new AnalysisFailure('invalid_output');
          if(match.relevance.state!=='relevant')continue;
          const requirement=(await db.query("SELECT id FROM requirements WHERE application_id=$1 AND id=$2 AND lifecycle='active' AND collection='borrower'",[row.application_id,match.requirementId])).rows[0];
          if(!requirement)continue;
          const rejected=(await db.query('SELECT 1 FROM document_match_rejections WHERE application_id=$1 AND document_id=$2 AND requirement_id=$3',[row.application_id,row.document_id,match.requirementId])).rowCount;
          if(rejected)continue;
          const active=(await db.query('SELECT 1 FROM requirement_documents WHERE application_id=$1 AND document_id=$2 AND requirement_id=$3 AND unlinked_at IS NULL',[row.application_id,row.document_id,match.requirementId])).rowCount;
          if(!active) {
            await db.query(`INSERT INTO requirement_documents(application_id,requirement_id,document_id,origin,analysis_job_id) VALUES($1,$2,$3,'model',$4)
              ON CONFLICT(requirement_id,document_id) DO UPDATE SET unlinked_at=NULL,linked_at=now(),linked_by_user_id=NULL,origin='model',analysis_job_id=excluded.analysis_job_id`,[row.application_id,match.requirementId,row.document_id,row.id]);
            await db.query(`INSERT INTO document_match_events(id,application_id,document_id,requirement_id,action,origin,job_id,evidence,reason) VALUES($1,$2,$3,$4,'link','model',$5,$6,$7)`,[randomUUID(),row.application_id,row.document_id,match.requirementId,row.id,JSON.stringify(match.relevance.evidence),match.relevance.reason]);
          }
          affected.add(match.requirementId);
        }
        // Include manually-linked requests even if this model could not match them.
        const linked=(await db.query('SELECT requirement_id FROM requirement_documents WHERE application_id=$1 AND document_id=$2 AND unlinked_at IS NULL',[row.application_id,row.document_id])).rows;
        for(const link of linked)affected.add(link.requirement_id);
      } else if((result.value as {schemaVersion?:string})?.schemaVersion!=='verify.v1')throw new AnalysisFailure('invalid_output');
      const pref=await preference(db,row.initiated_by);
      const after=await snapshot(db,row.application_id,row.task,row.target_id,row.consent_scope);
      await db.query(`UPDATE analysis_jobs SET state='succeeded',result=$2,result_fingerprint=$3,slot=NULL,lease_expires_at=NULL,updated_at=now(),revision=revision+1 WHERE id=$1`,[row.id,JSON.stringify(result.value),analysisFingerprint(after,row.task,row.consent_scope,pref.epoch,row.initiated_by)]);
      await this.event(db,row,'succeeded');
      await db.query(`INSERT INTO audit_events(id,application_id,actor,action,target_id,created_at,actor_kind,target_type,details,visibility) VALUES($1,$2,'AI assistant','analysis.completed',$3,now(),'system','analysis_job',$4,'borrower_visible')`,[randomUUID(),row.application_id,row.id,JSON.stringify({task:row.task,target_id:row.target_id})]);
      for(const id of affected)await enqueueForRequirement(db,row.application_id,row.initiated_by,id);
      return true;
    });
  }
  async settleFailure(job:JobLease<AnalysisSnapshot>,failure:FailureDisposition) {
    await transaction(this.database,async db=>{
      const row=await this.gated(db,job);if(!row)return;
      await this.state(db,row,failure.state,failure.code,failure.availableAt||(failure.state==='blocked'?new Date(Date.now()+60_000).toISOString():undefined));
      if(failure.code==='rate_limited' && failure.availableAt)await db.query('UPDATE analysis_scheduler SET cooldown_until=greatest(cooldown_until,$1::timestamptz) WHERE id=1',[failure.availableAt]);
    });
  }
  async recover() {
    await transaction(this.database,async db=>{
      // Queue-only recovery never acquires application locks. No external call.
      const rows=(await db.query(`SELECT * FROM analysis_jobs WHERE state IN ('queued','retry_wait','blocked','running') AND
        (expires_at<=now() OR cancel_requested OR (state<>'running' AND (attempt>=5 OR provider_attempts>=3)) OR (state='running' AND (lease_expires_at<=now() OR attempt_deadline<=now()))) FOR UPDATE SKIP LOCKED LIMIT 100`)).rows;
      for(const row of rows) {
        const state=row.cancel_requested?'cancelled':new Date(row.expires_at).getTime()<=Date.now()?'expired':row.attempt>=5||row.provider_attempts>=3?'dead_letter':'retry_wait';
        await db.query('UPDATE analysis_jobs SET token=token+1 WHERE id=$1',[row.id]);
        await this.state(db,row,state,state==='retry_wait'?'lease_lost':undefined,new Date(Date.now()+2000).toISOString());
      }
    });
  }
}
