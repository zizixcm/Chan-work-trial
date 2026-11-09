import { UploadError } from '../validation';

export type SourceReference =
  | { kind: 'requirement'; requirementId: string; definitionRevision: string; evidenceRevision: string }
  | { kind: 'document'; documentVersionId: string; sha256: string }
  | { kind: 'assessment'; assessmentId: string; requirementId: string; definitionRevision: string; evidenceRevision: string };
export type Citation = {
  documentVersionId: string; sha256: string; record: number; column: number; quote: string;
  sourceLocation?: string;
};
export type AssessmentState = 'not_assessed' | 'checking' | 'unavailable' | 'outdated' |
  'appears_complete' | 'incomplete' | 'indeterminate';
export interface Assessment {
  state: AssessmentState;
  jobId: string | null;
  freshness: 'current' | 'stale' | 'not_assessed';
  source: Extract<SourceReference, {kind: 'assessment'}> | null;
  checks: { criterionId: string; state: 'met' | 'unmet' | 'unknown'; reason: string; citations: Citation[] }[];
  missingEvidence: string[];
  conflicts: { reason: string; citations: Citation[] }[];
  limitations: string[];
}
export interface ContextDocument {
  id: string; name: string; contentType: string; sizeBytes: number; sha256: string;
  seriesId: string; version: number; createdAt: string; requirementIds: string[];
  source: Extract<SourceReference, {kind: 'document'}>;
}
export interface ContextRequirement {
  id: string; title: string; purpose: string; period: string; owner: string;
  applicability: string; condition: string | null; stage: string | null;
  collection: 'borrower' | 'lender'; criteria: string[];
  definitionRevision: string; evidenceRevision: string; documentIds: string[];
  evidencePresence: 'present' | 'absent';
  source: Extract<SourceReference, {kind: 'requirement'}>;
  assessment: Assessment;
  lenderReview: {id: string; decision: string; message: string; current: boolean; createdAt: string} | null;
}
export interface GroundedContext {
  schemaVersion: 'borrower-context.v1';
  revision: string;
  application: {id: string; borrowerName: string; propertyName: string; address: string;
    transactionType: string; requestedAmount: string; lifecycle: null;
    revision: string; contentRevision: string};
  loi: {reference: string; state: 'available' | 'unavailable'; document: ContextDocument | null};
  submission: {id: string; revisionNumber: number; submittedAt: string} | null;
  hasUnsentChanges: boolean;
  requirements: ContextRequirement[];
  documents: ContextDocument[];
  inventory: {complete: true; total: number};
  counts: {filesSaved: number; borrowerRequests: number; requestsWithFiles: number;
    checking: number; appearsComplete: number; incomplete: number; indeterminate: number; outdated: number};
  intake: {openBatches: number; unsavedMembers: number; pendingMatches: number};
}
export interface Conversation {
  id: string; applicationId: string; lastSequence: string; createdAt: string; updatedAt: string;
}
export interface ConversationMessage {
  id: string; conversationId: string; sequence: string; clientMessageId: string;
  role: 'borrower'; text: string; createdAt: string;
  responseState: 'not_requested' | 'available';
  answerId?: string;
}
export interface MessageInput { clientMessageId: string; text: string }
export interface MessagePage {after: string; limit: number}

/** Reject client-supplied identity/role/source fields instead of trusting them. */
export function parseMessageInput(value: unknown): MessageInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new UploadError('Invalid message.');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !['clientMessageId', 'text'].includes(key)) ||
      typeof input.clientMessageId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(input.clientMessageId) ||
      typeof input.text !== 'string' || !input.text.trim() || input.text.includes('\0') ||
      Buffer.byteLength(input.text, 'utf8') > 16000) throw new UploadError('Provide a message up to 16 KB and a valid client message ID.');
  return {clientMessageId: input.clientMessageId, text: input.text};
}
export function parseMessagePage(params: URLSearchParams): MessagePage {
  const after = params.get('after') ?? '0';
  const limit = params.get('limit') ?? '50';
  if (!/^(0|[1-9][0-9]{0,18})$/.test(after) || BigInt(after) > 9223372036854775807n ||
      !/^[1-9][0-9]{0,2}$/.test(limit) || Number(limit) > 100) throw new UploadError('Invalid message page.');
  return {after, limit: Number(limit)};
}
