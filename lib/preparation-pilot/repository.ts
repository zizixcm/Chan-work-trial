import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { digest, readiness, validateAction, validateSnapshot, type Action, type Observation, type Result, type Snapshot } from './contracts';

export interface Actor { applicationId: string; userId: string }
export interface Limits { totalMicros: number; runMicros: number; totalActions: number }
interface Run {
  id: string; userId: string; key: string; requestHash: string; revision: number;
  status: 'queued' | 'running' | 'completed' | 'cancelled' | 'stale';
  token?: string; expiresAt?: number; spentMicros: number;
  actions: Record<string, { hash: string; action: Action }>; observations: Observation[];
}
export interface Preparation {
  revision: number; snapshot: Snapshot; fingerprint: string; limits: Limits;
  spentMicros: number; actionCount: number; runs: Run[];
  result: { revision: number; result: Result; readiness: ReturnType<typeof readiness> } | null;
}
/** Harness-only durable aggregate. No timers, queue, provider, or application route.
 * Borrower membership is checked afresh for every operation, including replay/read.
 * Application-first locking matches existing job admission; caller supplies a scoped pool.
 */
export class PreparationRepository {
  constructor(private readonly database: Pool) {}
  private async transaction<T>(actor: Actor, work: (state: Preparation | null, now: number) => { state: Preparation; value: T } | { value: T }): Promise<T> {
    const db = await this.database.connect();
    try {
      await db.query('BEGIN');
      await db.query('SELECT id FROM applications WHERE id=$1 FOR UPDATE', [actor.applicationId]);
      const member = await db.query("SELECT 1 FROM application_memberships WHERE application_id=$1 AND user_id=$2 AND active AND role='borrower' FOR SHARE", [actor.applicationId,actor.userId]);
      if (!member.rowCount) throw new Error('Application unavailable');
      const row = await db.query('SELECT state FROM preparation_pilot WHERE application_id=$1 AND user_id=$2 FOR UPDATE', [actor.applicationId,actor.userId]);
      const clock = await db.query('SELECT extract(epoch FROM clock_timestamp()) * 1000 AS now');
      const outcome = work(row.rows[0]?.state ?? null, Number(clock.rows[0].now));
      if ('state' in outcome) await db.query('INSERT INTO preparation_pilot(application_id,user_id,state) VALUES($1,$2,$3) ON CONFLICT(application_id,user_id) DO UPDATE SET state=excluded.state', [actor.applicationId,actor.userId,JSON.stringify(outcome.state)]);
      await db.query('COMMIT'); return structuredClone(outcome.value);
    } catch (error) { await db.query('ROLLBACK'); throw error; } finally { db.release(); }
  }
  read(actor: Actor) { return this.transaction(actor, state => ({value:state})); }
  initialize(actor: Actor, snapshot: Snapshot, limits: Limits) {
    validateSnapshot(snapshot);
    if (snapshot.applicationId !== actor.applicationId) throw new Error('Wrong application');
    if (!Object.values(limits).every(n => Number.isSafeInteger(n) && n > 0)) throw new Error('Invalid limits');
    return this.transaction(actor, current => {
      if (current) throw new Error('Already initialized');
      const state: Preparation = {revision:1,snapshot,fingerprint:digest(snapshot),limits,spentMicros:0,actionCount:0,runs:[],result:null};
      return {state,value:state};
    });
  }
  updateSnapshot(actor: Actor, expectedRevision: number, snapshot: Snapshot) {
    validateSnapshot(snapshot);
    if (snapshot.applicationId !== actor.applicationId) throw new Error('Wrong application');
    return this.transaction(actor, current => {
      const state = requireState(current);
      if (state.revision !== expectedRevision) throw new Error('Stale revision');
      if (state.fingerprint !== digest(snapshot)) {
        state.revision++; state.snapshot = snapshot; state.fingerprint = digest(snapshot); state.result = null;
        for (const run of state.runs) if (['queued','running'].includes(run.status)) run.status = 'stale';
      }
      return {state,value:state};
    });
  }
  delegate(actor: Actor, key: string, expectedRevision: number, objective: string) {
    if (!key.trim() || key.length > 200 || !objective.trim() || objective.length > 10000) throw new Error('Invalid command');
    return this.transaction(actor, current => {
      const state = requireState(current), requestHash = digest({expectedRevision,objective});
      const previous = state.runs.find(r => r.key === key && r.userId === actor.userId);
      if (previous) { if (previous.requestHash !== requestHash) throw new Error('Replay conflict'); return {value:previous}; }
      if (state.revision !== expectedRevision) throw new Error('Stale revision');
      if (state.runs.some(r => ['queued','running'].includes(r.status))) throw new Error('Preparation already running');
      if (state.spentMicros >= state.limits.totalMicros || state.actionCount >= state.limits.totalActions) throw new Error('Budget exhausted');
      const run: Run = {id:randomUUID(),userId:actor.userId,key,requestHash,revision:state.revision,status:'queued',spentMicros:0,actions:{},observations:[]};
      state.runs.push(run); return {state,value:run};
    });
  }
  claim(actor: Actor, runId: string) {
    return this.transaction(actor, (current,now) => {
      const state = requireState(current), run = findRun(state,actor,runId);
      if (run.revision !== state.revision || !(run.status === 'queued' || (run.status === 'running' && (run.expiresAt ?? 0) <= now))) throw new Error('Run unavailable');
      run.status = 'running'; run.token = randomUUID(); run.expiresAt = now + 30000;
      return {state,value:{token:run.token,expiresAt:run.expiresAt}};
    });
  }
  /** Costs are harness-authored conservative reservations, not model supplied usage.
   * Atomic simulated dispatch + checkpoint; real external tool intents belong to Package B. */
  executeSimulated(actor: Actor, runId: string, token: string, actionId: string, input: unknown, reservedMicros: number) {
    if (!actionId.trim() || !Number.isSafeInteger(reservedMicros) || reservedMicros < 0) throw new Error('Invalid action');
    return this.transaction(actor, (current,now) => {
      const state = requireState(current), run = findRun(state,actor,runId);
      const hash = digest({input,reservedMicros});
      if (run.revision !== state.revision || run.token !== token || (run.expiresAt ?? 0) <= now || !['running','completed'].includes(run.status)) throw new Error('Stale execution');
      const prior = Object.hasOwn(run.actions,actionId) ? run.actions[actionId] : undefined;
      if (prior) { if (prior.hash !== hash) throw new Error('Action replay conflict'); return {value:state}; }
      if (run.status !== 'running') throw new Error('Run completed');
      if (state.spentMicros + reservedMicros > state.limits.totalMicros || run.spentMicros + reservedMicros > state.limits.runMicros || state.actionCount >= state.limits.totalActions) throw new Error('Budget exhausted');
      const action = validateAction(input,state.snapshot,run.observations);
      if (action.kind === 'read_pages') {
        const source = state.snapshot.sources.find(s => s.id === action.sourceId)!;
        run.observations.push({actionId,sourceId:source.id,pages:action.pages,sha256:source.sha256});
      } else {
        state.result = {revision:state.revision,result:action.result,readiness:readiness(state.snapshot,action.result)};
        run.status = 'completed';
      }
      run.actions[actionId] = {hash,action}; run.spentMicros += reservedMicros; state.spentMicros += reservedMicros; state.actionCount++;
      return {state,value:state};
    });
  }
  cancel(actor: Actor, runId: string) {
    return this.transaction(actor,current => {
      const state = requireState(current), run = findRun(state,actor,runId);
      if (['queued','running'].includes(run.status)) {run.status = 'cancelled'; delete run.token;}
      return {state,value:run};
    });
  }
}
function requireState(state: Preparation | null): Preparation { if (!state) throw new Error('Preparation unavailable'); return state; }
function findRun(state: Preparation, actor: Actor, id: string): Run {
  const run = state.runs.find(r => r.id === id && r.userId === actor.userId);
  if (!run) throw new Error('Run unavailable'); return run;
}
