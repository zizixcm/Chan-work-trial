import { assessmentRubric } from './rubrics';
import { verifyOutputSchema } from './schema';
import { ANALYSIS_VERSION, AnalysisError, type AnalysisRequirement, type AnalysisTask, type PreparedDocument, type VerifyResult } from './types';
import { checks, choice, evidence, input, instructions, invalid, list, object, parse, string } from './validation';

/** Include every preparation limitation (unsupported/missing linked files); never silently omit it. */
export function buildVerifyTask(documents: PreparedDocument[], requirement: AnalysisRequirement, limitations: string[] = []): AnalysisTask<VerifyResult> {
  if (limitations.length > 20 || limitations.some(v => !v.trim() || v.length > 500)) throw new AnalysisError('UNSUPPORTED_INPUT');
  const prompt = JSON.stringify({ evidence: JSON.parse(input(documents, [requirement])), preparationLimitations: limitations });
  if (Buffer.byteLength(prompt) > 80_000) throw new AnalysisError('INPUT_TOO_LARGE');
  return {
    task: 'verify_requirement.v1', version: ANALYSIS_VERSION, outputSchema: verifyOutputSchema,
    instructions: instructions + assessmentRubric + ` Assess this requirement against the entire supplied linked evidence set collectively. Evaluate EVERY part of each criterion: an AND or a list of required items means all parts must be supported before marking met. A matching document category, property name or tenant name does not establish the presence of monetary amounts, dates or signatures. A criterion requiring a numeric amount needs a citation of that actual amount in its relevant source column; a different number such as a date is not a substitute. If a required field or column is absent, mark the criterion unmet and explain the missing field. Do not fill gaps from general knowledge or from the requirement wording itself. Two partial documents can complement each other; duplicate copies do not supply missing evidence. Cite both sides of conflicts. Unsupported/missing files, missing criteria and preparation limitations prevent appears_complete. Never infer signatures/execution from a rent roll. No link mutations. Return exactly {"schemaVersion":"verify.v1","requirementId":"supplied ID","assessment":"appears_complete|incomplete|unknown","checks":[{"criterionId":"supplied ID","state":"met|unmet|unknown","reason":"text","evidence":[]}],"missingEvidence":["specific gap"],"conflicts":[{"reason":"text","evidence":[]}],"limitations":["limitation"]}. Choose one enum value, not pipe-separated text. Evidence entries: {"documentId":"supplied ID","record":1,"column":1,"quote":"exact cell"}. Include each criterion exactly once. Include preparationLimitations verbatim. Every unmet check requires a missingEvidence explanation; conflicts need at least two distinct source cells.`,
    prompt,
    validate(raw) {
      const result = object(parse(raw), ['schemaVersion', 'requirementId', 'assessment', 'checks', 'missingEvidence', 'conflicts', 'limitations']);
      if (result.schemaVersion !== 'verify.v1' || result.requirementId !== requirement.id) return invalid();
      const validatedChecks = checks(result.checks, requirement, documents);
      const reportedAssessment = choice(result.assessment, ['appears_complete', 'incomplete', 'unknown'] as const);
      const missingEvidence = list(result.missingEvidence, 20).map(v => string(v));
      const resultLimitations = list(result.limitations, 20).map(v => string(v));
      if (limitations.some(l => !resultLimitations.includes(l))) return invalid();
      const conflicts = list(result.conflicts, 20).map(item => {
        const conflict = object(item, ['reason', 'evidence']);
        const refs = evidence(conflict.evidence, documents, true);
        if (refs.length < 2) return invalid();
        return { reason: string(conflict.reason), evidence: refs };
      });
      const hasUnmet = validatedChecks.some(c => c.state === 'unmet');
      const unknown = !documents.length || !requirement.criteria.length || validatedChecks.some(c => c.state === 'unknown') || !!resultLimitations.length || !!conflicts.length;
      if (hasUnmet && !missingEvidence.length) return invalid();
      // Aggregate status belongs to the application. Keep the legacy provider
      // summary for diagnostics, but it can never override validated findings.
      const assessment = unknown?'unknown':hasUnmet?'incomplete':missingEvidence.length?'unknown':'appears_complete';
      return { schemaVersion: 'verify.v1', requirementId: requirement.id, assessment, ...(reportedAssessment!==assessment?{reportedAssessment}:{}), checks: validatedChecks, missingEvidence, conflicts, limitations: resultLimitations };
    },
  };
}
