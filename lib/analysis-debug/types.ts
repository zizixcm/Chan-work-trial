export type CapturedText = { text: string; bytes: number; truncated: boolean; redacted: boolean };
export type DebugMetadata = {
  jobId: string; applicationId: string; attempt: number; task: string;
  model: string; promptVersion: string; schemaVersion: string;
};
export type DebugRun = DebugMetadata & {
  id: string; createdAt: string; updatedAt: string; expiresAt: string;
  state: 'prepared' | 'responded' | 'validated' | 'invalid' | 'applied' | 'discarded' | 'failed' | 'interrupted';
  input?: { instructions: CapturedText; prompt: CapturedText; schema?: CapturedText };
  response?: CapturedText; parsed?: CapturedText; validated?: CapturedText;
  validation?: { status: 'passed' | 'invalid_json' | 'invalid_schema' | 'response_too_large'; message: string };
  usage?: { inputTokens?: number; outputTokens?: number };
  durationMs?: number; code?: string; appliedChanges?: CapturedText;
};
export type DebugSummary = Omit<DebugRun, 'input' | 'response' | 'parsed' | 'validated' | 'appliedChanges'>;
export interface DebugStore {
  save(run: DebugRun): Promise<void>;
  list(): Promise<DebugSummary[]>;
  get(id: string): Promise<DebugRun | null>;
}
