import type {PreparationInventory} from './service';
import type {ProcessingResult} from './protocol';

/** This reducer aggregates validated judgments; it does not establish semantic
 * entailment or replace lender review. All active borrower requests are in scope;
 * the model cannot waive a conditional requirement or declare it inapplicable. */
export function packageCompleteness(inventory:PreparationInventory,result:ProcessingResult|null){
 const required=inventory.requirements.filter(r=>r.collection==='borrower');
 const gaps:string[]=[],unchecked:string[]=[];
 if(!required.length)return {status:'unknown' as const,reason:'no_authoritative_requests',gaps,unchecked};
 if(!result||result.freshness!=='current')return {status:'unknown' as const,reason:'current_assessment_required',gaps,unchecked:required.map(r=>r.requirementId)};
 for(const r of required){
  const finding=result.requirements.find(f=>f.requirementId===r.requirementId&&f.definitionRevision===r.definitionRevision&&f.evidenceRevision===r.evidenceRevision);
  if(!finding||!r.criteria.length||finding.checks.length!==r.criteria.length||new Set(finding.checks.map(c=>c.criterionId)).size!==r.criteria.length){unchecked.push(r.requirementId);continue;}
  for(const criterion of r.criteria){
   const check=finding.checks.find(c=>c.criterionId===criterion.id);
   if(!check||check.state==='unknown'||(check.state==='met'&&(!check.citationIds.length||check.citationIds.some(id=>!result.citations.some(c=>c.citationId===id)))))unchecked.push(criterion.id);
   else if(check.state==='unmet')gaps.push(criterion.id);
  }
  if(finding.gaps.length&&finding.checks.every(c=>c.state==='met'))unchecked.push(r.requirementId);
 }
 const uncertain=inventory.pendingUploads||unchecked.length>0||result.limitations.length>0||result.conflicts.length>0;
 return {status:gaps.length?'incomplete' as const:uncertain?'unknown' as const:'complete' as const,reason:gaps.length?'remaining_requirements':uncertain?'unresolved_evidence':'all_active_borrower_criteria_supported',gaps,unchecked};
}
