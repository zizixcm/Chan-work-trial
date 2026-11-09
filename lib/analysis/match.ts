import { scopedMatchSchema } from './schema';
import { ANALYSIS_VERSION, type AnalysisRequirement, type AnalysisTask, type MatchResult, type PreparedDocument } from './types';
import { checks, choice, evidence, input, instructions, invalid, list, object, parse, string } from './validation';

export function buildMatchTask(document: PreparedDocument, requirements: AnalysisRequirement[]): AnalysisTask<MatchResult> {
  const prompt = input([document], requirements);
  return {
    task: 'match_document.v1', version: ANALYSIS_VERSION, outputSchema: scopedMatchSchema(requirements.map(r=>r.id)),
    instructions: instructions + ` Classify the document and evaluate relevance independently from coverage for EVERY supplied requirement exactly once. Relevant partial evidence can be linked without claiming completeness. Wrong/unclear property or entity is not a clear relevant match; a wrong date can still be relevant with an unmet period check. Similar names alone are ambiguous. Do not remove human links. Return schema: {"schemaVersion":"match.v1","classification":{"kind":"rent_roll|other_table|other_document|unknown","reason":"text","evidence":[]},"requirements":[{"requirementId":"supplied ID","relevance":{"state":"relevant|not_relevant|ambiguous","reason":"text","evidence":[]},"checks":[{"criterionId":"supplied ID","state":"met|unmet|unknown","reason":"text","evidence":[]}]}]}. The | choices mean choose exactly one value. Evidence entries: {"documentId":"supplied ID","record":1,"column":1,"quote":"exact cell"}. Relevant and non-unknown classifications require nonempty evidence. Requirement IDs/criterion IDs are opaque strings: copy the ENTIRE string verbatim, including every colon and version suffix such as :demo-v4. Never shorten an ID to a UUID or reconstruct criterion IDs. All IDs must match the input, with none omitted.`,
    prompt,
    validate(raw) {
      const result = object(parse(raw), ['schemaVersion', 'classification', 'requirements']);
      if (result.schemaVersion !== 'match.v1') return invalid();
      const c = object(result.classification, ['kind', 'reason', 'evidence']);
      const kind = choice(c.kind, ['rent_roll', 'other_table', 'other_document', 'unknown'] as const);
      const classification = { kind, reason: string(c.reason), evidence: evidence(c.evidence, [document], kind !== 'unknown') };
      const seen = new Set<string>();
      const matches = list(result.requirements, 50).map(item => {
        const m = object(item, ['requirementId', 'relevance', 'checks']);
        const requirementId = string(m.requirementId, 200);
        const requirement = requirements.find(r => r.id === requirementId);
        if (!requirement || seen.has(requirementId)) return invalid('invalid_requirement');
        seen.add(requirementId);
        const r = object(m.relevance, ['state', 'reason', 'evidence']);
        const state = choice(r.state, ['relevant', 'not_relevant', 'ambiguous'] as const);
        return { requirementId, relevance: { state, reason: string(r.reason), evidence: evidence(r.evidence, [document], state === 'relevant') }, checks: checks(m.checks, requirement, [document]) };
      });
      if (seen.size !== requirements.length) return invalid('missing_requirements');
      return { schemaVersion: 'match.v1', classification, requirements: matches };
    },
  };
}
