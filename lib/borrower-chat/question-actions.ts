import {processingQuestionSchema,compareRevisions} from '../preparation/protocol';
import {UploadError} from '../validation';
/** Current question + dependency fingerprint must come from the authorized
 * processor snapshot, never from browser assertion. Returned commands are not
 * dispatched here; the processor applies revision/idempotency fences again. */
export function prepareQuestionAction(current:unknown,currentDependencyFingerprint:string,input:unknown) {
  const question=processingQuestionSchema.parse(current);
  if(!input||typeof input!=='object'||Array.isArray(input))throw new UploadError('Invalid answer.');
  const value=input as Record<string,unknown>;
  if(Object.keys(value).some(k=>!['questionId','expectedQuestionRevision','actionId','clientActionId','answer'].includes(k))||
    value.questionId!==question.questionId||typeof value.expectedQuestionRevision!=='string'||! /^(0|[1-9][0-9]*)$/.test(value.expectedQuestionRevision)||
    typeof value.actionId!=='string'||!question.allowedActionIds.includes(value.actionId)||
    typeof value.clientActionId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(value.clientActionId))throw new UploadError('Invalid question action.');
  if(question.requiredActor!=='borrower')throw new UploadError('This action requires another participant.',403);
  if(compareRevisions(value.expectedQuestionRevision,question.questionRevision)!==0||question.dependencyFingerprint!==currentDependencyFingerprint)
    throw new UploadError('This question changed. Refresh it before sending your answer; keep your entered text.',409);
  const base={questionId:question.questionId,expectedQuestionRevision:question.questionRevision,dependencyFingerprint:question.dependencyFingerprint,
    preparationId:question.preparationId,actionId:value.actionId,clientActionId:value.clientActionId};
  switch(question.answerSchema.kind) {
    case 'attributed_text':
      if(typeof value.answer!=='string'||!value.answer.trim()||value.answer.length>question.answerSchema.maxLength)throw new UploadError('Provide a short answer.');
      return {...base,kind:'record_assertion' as const,answer:value.answer};
    case 'choice':
      if(typeof value.answer!=='string'||!question.answerSchema.options.some(option=>option.id===value.answer))throw new UploadError('Choose one of the offered answers.');
      return {...base,kind:'record_assertion' as const,answer:value.answer};
    case 'link_confirmation':
      if(typeof value.answer!=='boolean')throw new UploadError('Confirm or reject the suggested link.');
      return {...base,kind:'confirm_link' as const,confirmed:value.answer,documentId:question.answerSchema.documentId,requirementId:question.answerSchema.requirementId};
  }
}
