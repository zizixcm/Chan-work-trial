import type {ProcessingResult} from './protocol';
import type {AgentExecutionContext} from '../agents/execution';
import { z } from 'zod';
const id=z.string().min(1).max(256);
const support=z.array(z.strictObject({observationId:id,page:z.number().int().positive(),quote:z.string().min(1).max(2000)}));
export const plannerActionSchema=z.discriminatedUnion('kind',[
 z.strictObject({kind:z.literal('read_pages'),documentId:id,pages:z.array(z.number().int().positive()).min(1).max(8),mode:z.enum(['text','image','ocr'])}),
 z.strictObject({kind:z.literal('inspect_document'),documentId:id}),
 z.strictObject({kind:z.literal('search_evidence'),documentId:id,query:z.string().min(1).max(200),pages:z.array(z.number().int().positive()).min(1).max(40)}),
 z.strictObject({kind:z.literal('propose_mapping'),documentId:id,requirementId:id,relevance:z.enum(['clear','ambiguous']),basis:z.strictObject({identity:support,purpose:support,period:support,target:support}),conflicts:z.array(z.string().min(1)),explanation:z.string().min(1).max(2000)}),
 z.strictObject({kind:z.literal('ask'),prompt:z.string().min(1).max(1000),requirementIds:z.array(id).min(1)}),
 z.strictObject({kind:z.literal('assess'),findings:z.array(z.strictObject({requirementId:id,criterionId:id,state:z.enum(['met','unmet','unknown']),reasonCode:id,explanation:z.string().min(1).max(2000),assertionEvidence:z.array(z.strictObject({messageId:id,quote:z.string().min(1).max(4000),claim:z.literal('no_amendments')})).max(1).optional(),evidence:z.array(z.strictObject({observationId:id,page:z.number().int().positive(),quote:z.string().min(1).max(2000)})),gap:z.strictObject({kind:z.enum(['missing_evidence','unreadable','conflict','clarification','lender_decision']),subject:z.string().nullable(),period:z.string().nullable(),documentRole:z.string().nullable(),description:z.string().min(1),owner:z.enum(['borrower','lender','operator'])}).nullable()})),reaffirmCriterionIds:z.array(id).optional(),limitations:z.array(z.string().min(1).max(1000))}),
]);
export type PlannerAction=z.infer<typeof plannerActionSchema>;
export interface PageObservation {id:string;documentId:string;sha256:string;kind:'inventory'|'text'|'image'|'ocr'|'search'|'unavailable';query?:string;searchedPages?:number[];actionKey?:string;coverageIssues?:string[];pageCount:number;pages:{page:number;text:string;location?:string;confidence?:number;imageBase64?:string}[];limitations:string[]}
export interface EvidenceTools {
 inspect(bytes:Uint8Array,documentId:string,sha256:string,contentType?:string):Promise<PageObservation>;
 read(bytes:Uint8Array,documentId:string,sha256:string,pages:number[],mode:'text'|'image'|'ocr',contentType?:string):Promise<PageObservation>;
 search?(bytes:Uint8Array,documentId:string,sha256:string,query:string,pages:number[],contentType?:string):Promise<PageObservation>;
}
export interface PlannerInput {
 objective:string;
 /** Feedback from a reused action, so the next decision can make progress. */
 actionFeedback?:string;
 executionBudget?:{callsRemaining:number;runRemainingMicros:number;applicationRemainingMicros:number;timeRemainingMs:number};
 goal?:string;
 scope?:{requirementIds:string[];documentIds:string[]};
 inventory:{application:{borrowerName:string;propertyName:string;address:string;transactionType:string};documents:{documentId:string;name:string;contentType:string;active:boolean}[];requirements:{requirementId:string;title:string;owner:string;period:string;criteria:{id:string;description:string;confirmationPolicy?:'no_amendments'}[]}[];pendingUploads:boolean};
 priorAssessment?:ProcessingResult;
 /** Backend-validated prior findings; unchanged dependencies permit automatic reuse. */
 reusableCriterionIds?:string[];
 reaffirmableCriterionIds?:string[];
 borrowerMessages?:{id:string;text:string;sequence:string}[];
 observations:PageObservation[];
 mappingProposals:{documentId:string;requirementId:string;relevance:'clear'|'ambiguous';explanation:string}[];
 assertions:{questionId:string;question:string;answer:string;attributedTo:string}[];
}
/** Deployment supplies a paid implementation AND its global spend ledger. Tests inject scripts. */
export interface PreparationPlanner {
 maximumCallMicros:number;
 /** Digest of evaluated provider/model/prompt/tool configuration. Missing means confirmation-only mappings. */
 configurationDigest?:string;
 decide(input:PlannerInput,signal:AbortSignal,execute?:(action:PlannerAction)=>Promise<unknown>,execution?:AgentExecutionContext):Promise<{action:unknown;actualMicros:number|null;executed?:boolean}>;
}
