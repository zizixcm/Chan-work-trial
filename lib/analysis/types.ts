import type { JSONSchema7 } from 'json-schema';
/** Runtime-neutral contracts shared by web/worker code. No provider, DB or secrets. */
export const ANALYSIS_MODEL = 'google/gemini-2.5-flash';
export const ANALYSIS_VERSION = 'csv-review.v5';
export class AnalysisError extends Error {
  constructor(public readonly code: 'UNSUPPORTED_INPUT' | 'INVALID_OUTPUT' | 'INPUT_TOO_LARGE') { super(code); }
}
export type PreparedDocument = { id: string; sha256: string; records: string[][] };
export type Criterion = { id: string; description: string };
export type AnalysisRequirement = { id: string; title: string; subject: string; period: string; criteria: Criterion[] };
export type Evidence = { documentId: string; record: number; column: number; quote: string };
export type Check = { criterionId: string; state: 'met' | 'unmet' | 'unknown'; reason: string; evidence: Evidence[] };
export type Relevance = { state: 'relevant' | 'not_relevant' | 'ambiguous'; reason: string; evidence: Evidence[] };
export type MatchResult = {
  schemaVersion: 'match.v1';
  classification: { kind: 'rent_roll' | 'other_table' | 'unknown'; reason: string; evidence: Evidence[] };
  requirements: { requirementId: string; relevance: Relevance; checks: Check[] }[];
};
export type VerifyResult = {
  schemaVersion: 'verify.v1'; requirementId: string;
  assessment: 'appears_complete' | 'incomplete' | 'unknown';
  reportedAssessment?: 'appears_complete' | 'incomplete' | 'unknown';
  checks: Check[]; missingEvidence: string[]; conflicts: { reason: string; evidence: Evidence[] }[];
  limitations: string[];
};
export type AnalysisTask<T> = {
  task: 'match_document.v1' | 'verify_requirement.v1'; version: string;
  instructions: string; prompt: string; outputSchema?: JSONSchema7; validate: (raw: unknown) => T;
};
