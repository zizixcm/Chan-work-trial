/** Safe, user-facing explanations; never display raw provider errors. */
export type AssessmentOutput = {
  assessment?: string;
  fulfillment?: string;
  checks?: Array<{criterionId?: string; state: string; reason?: string; evidence?: Array<{documentId:string;record:number;column:number;quote:string;sourceLocation?:string}>}>;
  missingEvidence?: string[];
  limitations?: string[];
  conflicts?: Array<{reason:string}>;
  value?: AssessmentOutput;
};
export function failureExplanation(code?: string): string {
  const reasons: Record<string, string> = {
    provider_timeout: 'The AI service did not respond in time. Try the check again.',
    provider_unavailable: 'The AI service could not be reached. Try again later.',
    rate_limited: 'The AI service is handling too many requests. Try again later.',
    configuration_required: 'AI service configuration needs attention from an administrator.',
    budget_exhausted: 'The AI usage budget is exhausted. An administrator needs to restore capacity.',
    invalid_output: 'The AI response did not pass format or evidence validation, so no assessment was accepted. Try again or review the documents manually.',
    input_too_large: 'The file was read, but the combined evidence and checklist exceed the analysis input limit.',
    unsupported_input: 'The input could not be processed. Review the file format and contents, or continue with manual review.',
    lease_lost: 'The check was interrupted before it could finish. Try again.',
    cancelled: 'The check was cancelled before it finished.',
    internal_error: 'An internal error interrupted the check. Try again; if it persists, share the diagnostic details with support.',
  };
  return reasons[code || ''] || 'No specific failure reason was recorded. Try again or share the diagnostic details with support.';
}
export function assessmentExplanation(output?: AssessmentOutput): string {
  const result = output?.value || output;
  if (!result) return 'No assessment details are available.';
  return result.limitations?.[0] || result.conflicts?.[0]?.reason || result.missingEvidence?.[0]
    || result.checks?.find(check => check.state !== 'met' && check.reason)?.reason
    || (result.assessment === 'appears_complete' ? 'The supplied evidence supports all checked criteria.' : 'The AI could not establish whether every criterion is satisfied. Review the checks and evidence.');
}
