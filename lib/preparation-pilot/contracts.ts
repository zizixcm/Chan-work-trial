import { createHash } from 'node:crypto';

export const VERSION = 'preparation.v1' as const;
export type Readiness = 'not_ready' | 'undetermined' | 'appears_ready';
export type FindingState = 'met' | 'unmet' | 'unknown' | 'lender_pending' | 'later_stage';
export interface Source { id: string; sha256: string; active: boolean; historical: boolean; pages: Record<string, string> }
export interface Criterion { id: string; requestId: string; description: string; prerequisite: boolean; pendingAllowed: boolean }
export interface Snapshot {
  version: typeof VERSION; applicationId: string; stage: string; policyId: string | null;
  sources: Source[]; criteria: Criterion[]; pendingUploads: boolean;
}
export interface Citation { sourceId: string; page: number; quote: string }
export interface Finding { criterionId: string; state: FindingState; explanation: string; citations: Citation[] }
export interface Result { findings: Finding[]; questions: string[]; nextActions: string[] }
export type Action = { kind: 'read_pages'; sourceId: string; pages: number[] } | { kind: 'assess'; result: Result };
export interface Observation { actionId: string; sourceId: string; pages: number[]; sha256: string }
export function digest(value: unknown): string {
  const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
    ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k,x]) => [k,canonical(x)])) : v;
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
function assert(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }
function object(value: unknown, keys: string[]): Record<string, unknown> {
  assert(value && typeof value === 'object' && !Array.isArray(value), 'Expected object');
  assert(Object.keys(value).every(k => keys.includes(k)) && keys.every(k => k in value), 'Unexpected fields');
  return value as Record<string, unknown>;
}
function text(v: unknown): asserts v is string { assert(typeof v === 'string' && v.trim().length > 0 && v.length <= 10000, 'Invalid text'); }
export function validateSnapshot(s: Snapshot): void {
  assert(s.version === VERSION && s.applicationId && s.stage, 'Invalid snapshot');
  assert(new Set(s.sources.map(x => x.id)).size === s.sources.length, 'Duplicate source');
  assert(new Set(s.criteria.map(x => x.id)).size === s.criteria.length && s.criteria.length > 0, 'Invalid criteria');
  for (const source of s.sources) assert(/^[a-f0-9]{64}$/.test(source.sha256), 'Invalid source hash');
}
/** Shape and source authenticity only; interpreting a quote correctly needs independent evaluation. */
export function validateResult(value: unknown, snapshot: Snapshot, observations: Observation[]): Result {
  const r = object(value, ['findings','questions','nextActions']);
  assert(Array.isArray(r.findings) && r.findings.length === snapshot.criteria.length, 'Incomplete ledger');
  const seen = new Set<string>();
  for (const item of r.findings) {
    const f = object(item, ['criterionId','state','explanation','citations']);
    text(f.criterionId); text(f.explanation);
    const criterion = snapshot.criteria.find(c => c.id === f.criterionId);
    assert(criterion && !seen.has(f.criterionId), 'Unknown or duplicate criterion'); seen.add(f.criterionId);
    assert(['met','unmet','unknown','lender_pending','later_stage'].includes(String(f.state)), 'Invalid finding');
    assert(f.state !== 'later_stage' || !criterion.prerequisite, 'Required now');
    assert(f.state !== 'lender_pending' || criterion.pendingAllowed, 'Pending not permitted');
    assert(Array.isArray(f.citations), 'Invalid citations');
    assert(!['met','lender_pending'].includes(String(f.state)) || f.citations.length > 0, 'Support required');
    for (const item of f.citations) {
      const c = object(item, ['sourceId','page','quote']); text(c.sourceId); text(c.quote);
      assert(Number.isInteger(c.page) && Number(c.page) > 0, 'Invalid page');
      const source = snapshot.sources.find(s => s.id === c.sourceId && s.active);
      assert(source && source.pages[String(c.page)]?.includes(c.quote), 'Unsupported citation');
      assert(observations.some(o => o.sourceId === source.id && o.sha256 === source.sha256 && o.pages.includes(Number(c.page))), 'Uninspected citation');
    }
  }
  for (const list of [r.questions,r.nextActions]) { assert(Array.isArray(list), 'Invalid list'); for (const item of list) text(item); }
  return structuredClone(value) as Result;
}
export function validateAction(value: unknown, snapshot: Snapshot, observations: Observation[]): Action {
  const kind = (value as {kind?: unknown})?.kind;
  if (kind === 'assess') { const a = object(value, ['kind','result']); return {kind, result: validateResult(a.result,snapshot,observations)}; }
  const a = object(value, ['kind','sourceId','pages']);
  assert(kind === 'read_pages', 'Unsupported action'); text(a.sourceId);
  const source = snapshot.sources.find(s => s.id === a.sourceId && s.active);
  assert(source && Array.isArray(a.pages) && a.pages.length > 0 && a.pages.length <= 8, 'Invalid page selection');
  assert(new Set(a.pages).size === a.pages.length && a.pages.every(p => Number.isInteger(p) && p > 0 && String(p) in source.pages), 'Unknown page');
  return {kind, sourceId:a.sourceId, pages:a.pages as number[]};
}
export function readiness(snapshot: Snapshot, result: Result): Readiness {
  const required = result.findings.filter(f => snapshot.criteria.find(c => c.id === f.criterionId)?.prerequisite);
  if (required.some(f => f.state === 'unmet')) return 'not_ready';
  if (!snapshot.policyId || snapshot.pendingUploads || required.some(f => !['met','lender_pending'].includes(f.state))) return 'undetermined';
  return 'appears_ready';
}
