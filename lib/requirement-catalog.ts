import type { PoolClient } from 'pg';
import catalog from './requirement-catalog.json';
import { APPLICATION_ID } from './model';
import { readLoanPackageProfile, applyLoanPackageIdentity } from './loan-package-profile';

// Nine requests cover all six core folders. Reintroduced requests get new occurrences;
// retired definitions and their evidence remain immutable history.
const demoNumbers = [10, 15, 19, 8, 9, 7, 1, 3, 37];
const reintroduced = new Set([10, 7, 3]);
export const demoCatalog = demoNumbers.map((number, sort_order) => {
  const baseId = `33000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
  const requirement = catalog.find(row => row.id === baseId);
  if (!requirement) throw new Error(`Missing demo requirement: ${baseId}`);
  return { ...requirement, id: reintroduced.has(number) ? `${baseId}:demo-v4` : baseId,
    predecessor: reintroduced.has(number) ? baseId : null, sort_order };
});

/** Explicit local-demo upgrade. Preserve IDs, evidence, historical reviews and other applications. */
export async function applyRequirementCatalog(db: PoolClient) {
  await db.query('SELECT id FROM applications WHERE id=$1 FOR UPDATE', [APPLICATION_ID]);
  const profile = readLoanPackageProfile();
  if (profile) await applyLoanPackageIdentity(db, profile);
  // Retire only known template requests. Keep their evidence and immutable reviews intact.
  await db.query(`UPDATE requirements SET lifecycle='superseded',superseded_at=now()
    WHERE application_id=$1 AND lifecycle='active'
      AND id=ANY($2::text[]) AND NOT (id=ANY($3::text[]))`,
    [APPLICATION_ID, [...catalog.map(r => r.id), ...demoCatalog.map(r => r.id)], demoCatalog.map(r => r.id)]);
  for (const template of demoCatalog) {
    const override = profile?.requirements[template.id];
    if (profile && !override) throw new Error(`Missing package requirement: ${template.id}`);
    const r = { ...template, ...(override ? { owner: override.owner, period: override.period } : {}) };
    // BEFORE INSERT triggers run even when ON CONFLICT skips the update. Avoid
    // issuing the insert for unchanged definitions so reseeding is a true no-op.
    const existing = (await db.query('SELECT * FROM requirements WHERE application_id=$1 AND id=$2', [APPLICATION_ID,r.id])).rows[0];
    const definition = { title:r.title, category:r.category, purpose:r.purpose, period:r.period, owner:r.owner,
      applicability:r.applicability, sort_order:r.sort_order, criteria:r.criteria, collection:r.collection,
      stage:r.stage, condition:r.condition, source_reference:profile?.version || 'cre-refinance-demo-v4' };
    if (existing && Object.entries(definition).every(([key,value]) => JSON.stringify(existing[key]) === JSON.stringify(value))) continue;
    await db.query(`INSERT INTO requirements
      (id,application_id,title,category,purpose,period,owner,applicability,sort_order,criteria,collection,stage,condition,source_reference,supersedes_requirement_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$15,(SELECT id FROM requirements WHERE id=$14 AND application_id=$2 AND lifecycle='superseded'))
      ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title,category=EXCLUDED.category,
        purpose=EXCLUDED.purpose,period=EXCLUDED.period,owner=EXCLUDED.owner,
        applicability=EXCLUDED.applicability,sort_order=EXCLUDED.sort_order,
        criteria=EXCLUDED.criteria,collection=EXCLUDED.collection,stage=EXCLUDED.stage,
        condition=EXCLUDED.condition,source_reference=EXCLUDED.source_reference
      WHERE requirements.application_id=EXCLUDED.application_id AND requirements.lifecycle='active'
        AND ROW(requirements.title,requirements.category,requirements.purpose,requirements.period,
          requirements.owner,requirements.applicability,requirements.sort_order,requirements.criteria,
          requirements.collection,requirements.stage,requirements.condition,requirements.source_reference)
        IS DISTINCT FROM ROW(EXCLUDED.title,EXCLUDED.category,EXCLUDED.purpose,EXCLUDED.period,
          EXCLUDED.owner,EXCLUDED.applicability,EXCLUDED.sort_order,EXCLUDED.criteria,
          EXCLUDED.collection,EXCLUDED.stage,EXCLUDED.condition,EXCLUDED.source_reference)`,
      [r.id,APPLICATION_ID,r.title,r.category,r.purpose,r.period,r.owner,r.applicability,r.sort_order,r.criteria,r.collection,r.stage,r.condition,r.predecessor,profile?.version || 'cre-refinance-demo-v4']);
  }
  if (profile) for (const [id, r] of Object.entries(profile.requirements)) {
    await db.query(`UPDATE requirements SET subject_id=$3,period_start=$4,period_end=$5,as_of=$6,source_reference=$7
      WHERE application_id=$1 AND id=$2 AND lifecycle='active'
      AND ROW(subject_id,period_start,period_end,as_of,source_reference) IS DISTINCT FROM ROW($3::text,$4::date,$5::date,$6::date,$7::text)`,
      [APPLICATION_ID,id,`${APPLICATION_ID}:${r.subject}`,r.period_start || null,r.period_end || null,r.as_of || null,profile.version]);
  }
  await db.query("UPDATE applications SET checklist_version='cre-refinance-demo-v4' WHERE id=$1 AND checklist_version IS DISTINCT FROM 'cre-refinance-demo-v4'", [APPLICATION_ID]);
}
