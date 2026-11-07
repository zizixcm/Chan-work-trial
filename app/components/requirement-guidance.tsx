import type { Requirement } from '@/lib/model';
export default function RequirementGuidance({ requirement }: { requirement: Requirement }) {
  return <section className="requirement-guidance" aria-label="Requirement criteria">
    <dl><div><dt>Collected by</dt><dd>{requirement.collection === 'lender' ? 'Lender / approved provider' : requirement.owner}</dd></div><div><dt>Stage</dt><dd>{requirement.stage || 'Underwriting'}</dd></div></dl>
    {requirement.condition && <p><strong>When required:</strong> {requirement.condition} Your lender confirms applicability.</p>}
    {!!requirement.criteria?.length && <><h3>Acceptance criteria</h3><ul>{requirement.criteria.map(criterion => <li key={criterion}>{criterion}</li>)}</ul><p className="criteria-note">Provide complete, readable files for the correct party and period. Your lender checks these criteria; uploading a file does not mean it is accepted.</p></>}
  </section>;
}
