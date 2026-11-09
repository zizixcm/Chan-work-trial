/** Shared proposed protocol. Pure validation; no provider, DB, UI or dispatch imports. */
import { z } from 'zod';
const id = z.string().min(1).max(256);
export const revisionSchema = z.string().regex(/^(0|[1-9][0-9]*)$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const date = z.iso.date();
const ref = z.strictObject({id,revision:revisionSchema});
const scope = z.enum(['affected_requirements','application']);
const owner = z.enum(['borrower','lender','operator']);
export const publicStateSchema = z.enum(['queued','running','waiting_input','succeeded','partial','failed','canceled','superseded']);
export const assessmentSchema = z.enum(['appears_complete','incomplete','unknown']);
const document = z.strictObject({documentId:id,sha256:hash});
const requirement = z.strictObject({requirementId:id,definitionRevision:id,evidenceRevision:id});
export const processingRequestSchema = z.strictObject({
 schemaVersion:z.literal('processing-request.v1'),commandId:id,idempotencyKey:id,applicationId:id,
 authority:z.strictObject({actorUserId:id,scope:z.literal('borrower'),policyRevision:id}),
 origin:z.strictObject({kind:z.enum(['chat_upload','portal_upload','integration_upload','borrower_request','question_answer','requirement_change']),conversationId:id.nullable(),artifactId:id.nullable(),domainEventId:id}),
 objective:z.enum(['understand_and_assess','resolve_gap','assess_submission_readiness']),assessmentScope:scope,preparationId:id,uploadBatchId:id.nullable(),
 documents:z.array(document.extend({seriesId:id,version:z.number().int().positive()})),requirements:z.array(requirement),
 snapshot:z.strictObject({contentRevision:id,inputFingerprint:hash,preparationRevision:revisionSchema,submissionStage:id.nullable(),reviewDate:date,submissionPolicyRevision:id.nullable(),requestInventoryRevision:id,evidenceInventoryRevision:id}),retryOf:id.nullable(),
}).superRefine((v,ctx)=>{if(v.objective==='assess_submission_readiness'&&v.assessmentScope!=='application')ctx.addIssue({code:'custom',message:'Readiness requires application scope'});});
export const citationSchema = z.discriminatedUnion('kind',[
 z.strictObject({kind:z.literal('artifact'),citationId:id,documentId:id,sha256:hash,evidenceArtifactId:id,artifactDigest:hash,page:z.number().int().positive(),sourceLocation:z.string().min(1).max(2000).optional(),quote:z.string().min(1)}),
 z.strictObject({kind:z.literal('legacy_record'),citationId:id,documentId:id,sha256:hash,record:id,column:id,quote:z.string().min(1)}),
 z.strictObject({kind:z.literal('structured_record'),citationId:id,recordId:id,recordRevision:id,field:id}),
]);
const issue = z.strictObject({requirementId:id.nullable(),criterionId:id.nullable(),reasonCode:id,detail:z.string().optional(),citationIds:z.array(id),coverageRef:ref,owner});
const nextAction = z.strictObject({actionId:id,kind:z.enum(['upload_evidence','answer_question','confirm_link','use_existing_controls','request_retry']),owner,expectedRevision:revisionSchema,documentId:id.optional(),requirementId:id.optional(),expectedEvidenceRevision:id.optional(),mappingProposalId:id.optional(),automaticEligibility:z.enum(['confirmation_only','clear_supported']).optional()});
const check = z.strictObject({criterionId:id,state:z.enum(['met','unmet','unknown']),citationIds:z.array(id),reasonCode:id,explanation:z.string().min(1)});
const gap = z.strictObject({criterionId:id,kind:z.enum(['missing_evidence','unreadable','conflict','clarification','lender_decision']),subject:z.string().nullable(),period:z.string().nullable(),documentRole:z.string().nullable(),description:z.string().min(1),owner,coverageRef:ref});
const resultBase = {
 schemaVersion:z.literal('processing-result.v1'),applicationId:id,resultId:id,resultRevision:revisionSchema,
 preparationId:id,preparationRevision:revisionSchema,inputFingerprint:hash,dependencyFingerprint:hash,
 freshness:z.enum(['current','historical','superseded']),documents:z.array(document),requirements:z.array(requirement.extend({assessment:assessmentSchema,checks:z.array(check),gaps:z.array(gap)})),
 coverageRef:ref,citations:z.array(citationSchema),limitations:z.array(issue),conflicts:z.array(issue),allowedNextActions:z.array(nextAction),
};
const readiness = z.strictObject({submissionReadiness:z.enum(['not_ready','undetermined','appears_ready']),submissionStage:id.nullable(),reviewDate:date,submissionPolicyRevision:id.nullable(),requestLedgerRef:ref,evidenceCoverageRef:ref,blockers:z.array(issue),unknowns:z.array(issue),permittedExceptions:z.array(z.strictObject({criterionId:id,policyDecisionRef:ref})),dependencyFingerprint:hash}).superRefine((v,ctx)=>{
 if(v.submissionReadiness==='appears_ready' && (!v.submissionStage||!v.submissionPolicyRevision||v.blockers.length||v.unknowns.length))ctx.addIssue({code:'custom',message:'Ready requires authoritative stage/policy and resolved prerequisites'});
});
export const processingResultSchema = z.discriminatedUnion('assessmentScope',[
 z.strictObject({...resultBase,assessmentScope:z.literal('affected_requirements')}),
 z.strictObject({...resultBase,assessmentScope:z.literal('application'),readiness:readiness.optional()}),
]);
export const processingQuestionSchema = z.strictObject({schemaVersion:z.literal('processing-question.v1'),questionId:id,questionRevision:revisionSchema,preparationId:id,dependencyFingerprint:hash,affectedRequirementIds:z.array(id),requiredActor:owner,blocking:z.boolean(),prompt:z.string().min(1),answerSchema:z.discriminatedUnion('kind',[
 z.strictObject({kind:z.literal('attributed_text'),maxLength:z.number().int().positive().max(10000)}),
 z.strictObject({kind:z.literal('choice'),options:z.array(z.strictObject({id,label:z.string().min(1)})).min(2)}),
 z.strictObject({kind:z.literal('link_confirmation'),documentId:id,requirementId:id}),
]),allowedActionIds:z.array(id)});
const baseEvent = {schemaVersion:z.literal('processing-event.v1'),eventId:id,applicationId:id,cursor:id,runId:id,runRevision:revisionSchema,artifactId:id.nullable(),occurredAt:z.iso.datetime(),inputFingerprint:hash};
const event = <T extends string,S extends z.ZodType,D extends z.ZodType>(type:T,state:S,data:D)=>z.strictObject({...baseEvent,type:z.literal(type),state,data});
export const processingEventSchema = z.discriminatedUnion('type',[
 event('run.accepted',z.literal('queued'),z.strictObject({preparationId:id,preparationRevision:revisionSchema})),
 event('run.progress',z.enum(['queued','running']),z.strictObject({activityCode:id,intakeRef:ref.nullable(),affectedRequirementIds:z.array(id),inspectedCount:z.number().int().nonnegative(),limitations:z.array(id),nextPollAfterMs:z.number().int().nonnegative()})),
 event('run.needs_input',z.literal('waiting_input'),z.strictObject({reasonCode:id,requiredActor:owner,question:processingQuestionSchema.nullable()})),
 event('run.result_committed',z.enum(['running','succeeded','partial']),z.strictObject({terminal:z.boolean(),resultId:id,resultRevision:revisionSchema,coverageRef:ref})),
 event('run.failed',z.literal('failed'),z.strictObject({reasonCode:id,retryable:z.boolean()})),
 event('run.cancelled',z.literal('canceled'),z.strictObject({reasonCode:id})),
 event('run.superseded',z.literal('superseded'),z.strictObject({successorRunId:id.nullable(),reasonCode:id})),
]).superRefine((v,ctx)=>{if(v.type==='run.result_committed'&&v.data.terminal!==(v.state!=='running'))ctx.addIssue({code:'custom',message:'Terminal/state mismatch'});});
export const preparationInvalidationSchema=z.strictObject({schemaVersion:z.literal('preparation-invalidation.v1'),type:z.literal('application.preparation_invalidated'),eventId:id,applicationId:id,cursor:id,occurredAt:z.iso.datetime(),preparationId:id,preparationRevision:revisionSchema,affectedResultRefs:z.array(ref),affectedRequirementIds:z.array(id),reasonCode:id});
export const applicationEventSchema=z.union([processingEventSchema,preparationInvalidationSchema]);
export const preparationSnapshotSchema=z.strictObject({schemaVersion:z.literal('preparation-snapshot.v1'),applicationId:id,preparationId:id,preparationRevision:revisionSchema,cursor:id,currentResultRef:ref.nullable(),currentReadinessRef:ref.nullable(),obligations:z.array(z.strictObject({id,owner,status:z.enum(['open','resolved']),resumeTrigger:id})),questionRefs:z.array(ref),budget:z.strictObject({limitMicros:z.number().int().nonnegative(),knownMicros:z.number().int().nonnegative(),reservedMicros:z.number().int().nonnegative(),unknownCost:z.boolean()})});
export type ProcessingRequest=z.infer<typeof processingRequestSchema>;
export type ProcessingResult=z.infer<typeof processingResultSchema>;
export type ApplicationEvent=z.infer<typeof applicationEventSchema>;
export type PreparationSnapshot=z.infer<typeof preparationSnapshotSchema>;
export function compareRevisions(a:string,b:string):number {const x=BigInt(revisionSchema.parse(a)),y=BigInt(revisionSchema.parse(b));return x===y?0:x<y?-1:1;}
export function legacyAssessment(value:unknown):z.infer<typeof assessmentSchema>{return assessmentSchema.parse(value==='indeterminate'?'unknown':value);}

/** Current release gate, separate from the future-capable structural schema. */
export function parseCompletenessRequest(value:unknown):ProcessingRequest {const request=processingRequestSchema.parse(value);if(request.objective==='assess_submission_readiness')throw new Error('Submission readiness is deferred');return request;}
export function parseCompletenessResult(value:unknown):ProcessingResult {const result=processingResultSchema.parse(value);if('readiness' in result)throw new Error('Submission readiness is deferred');return result;}

export const evidenceCoverageSchema=z.strictObject({schemaVersion:z.literal('evidence-coverage.v1'),id,revision:revisionSchema,applicationId:id,preparationId:id,inventoryFingerprint:hash,completeInventory:z.literal(true),pendingUploads:z.boolean(),documents:z.array(z.strictObject({documentId:id,sha256:hash,active:z.boolean(),pageCount:z.number().int().positive().nullable(),inspectedPages:z.array(z.number().int().positive()),observationIds:z.array(id),limitations:z.array(z.string())})),limitations:z.array(z.string())});
