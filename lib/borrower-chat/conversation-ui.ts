import type {ReactNode} from 'react';
import type {ProcessingProjection} from './processing-projection';
import type {GroundedAnswer,RetrievalIntent} from './retrieval';
import type {citationSchema} from '../preparation/protocol';

/** UI dependency injection, not another processing wire protocol. Production
 * implementation must call authorized server endpoints; tests use explicit mocks. */
export type ConversationUiIntent=RetrievalIntent|'investigate_gap'|'review_documents';
export type ConversationUiTurn={id:string;clientMessageId:string;role:'borrower'|'assistant';text:string;
  files?:{id:string;name:string;documentId?:string}[];uploadBatchId?:string;createdAt:string;freshness:'current'|'outdated';answer?:GroundedAnswer};
export type ConversationActivity={id:string;runId:string;label:string;status:'running'|'completed'|'failed';startedAt:string;completedAt?:string};
export type ConversationReplyDraft={turnId:string;sourceMessageId:string|null;clientMessageId:string|null;text:string;status:'streaming'|'completed'|'interrupted';createdAt:string};
export type ConversationStreamState={uploadPending?:boolean;drafts:ConversationReplyDraft[];pending:boolean;activity:ConversationActivity[]};
export type ConversationUiSnapshot={activity?:ConversationActivity[];agentEnabled?:boolean;agentPending?:boolean;agentActivity?:'queued'|'running';agentBlocked?:boolean;documents?:{id:string;name:string}[];uploads?:import('./uploads').ConversationUploadPage['cards'];contextRevision?:string;pendingRequests?:import('./delegation').DelegationCard[];conversationId:string;turns:ConversationUiTurn[];processing:ProcessingProjection|null;
  requirements:{id:string;title:string}[];pollAfterMs:number;executionLabel:'not_connected'|'simulated'|'live'};
export type ConversationUiAdapter={
  listen?(signal:AbortSignal,onState:(state:ConversationStreamState)=>void):Promise<void>;
  read(signal:AbortSignal):Promise<ConversationUiSnapshot>;
  send(input:{clientMessageId:string;text:string;intent:ConversationUiIntent;requirementId?:string},signal:AbortSignal):Promise<void>;
  answer(input:{clientActionId:string;questionId:string;expectedQuestionRevision:string;actionId:string;answer:string|boolean},signal:AbortSignal):Promise<void>;
  confirmMapping?(input:{resultId:string;resultRevision:string;actionId:string;idempotencyKey:string},signal:AbortSignal):Promise<void>;
  source(input:{resultId:string;resultRevision:string;citationId:string},signal:AbortSignal):Promise<ReturnType<typeof citationSchema.parse>>;
};
export type ConversationUiProps={uploadCommit?:{receipts:{batchId:string;files:{id:string;name:string;documentId?:string}[]}[];complete:boolean;sequence:number;createdAt:string};workspaceTitle?:string;documents?:import('../model').PublicDocument[];applicationId?:string;adapter?:ConversationUiAdapter;uploadSlot?:ReactNode;onUpdated?:()=>Promise<unknown>;initialSnapshot?:ConversationUiSnapshot};

/** Adapter normalizes HTTP authorization/conflict failures for draft recovery. */
export class ConversationUiError extends Error {
  constructor(message:string,readonly kind:'denied'|'conflict'|'unavailable'){super(message);}
}
