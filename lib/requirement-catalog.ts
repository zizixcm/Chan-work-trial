import type { PoolClient } from 'pg';
import catalog from './requirement-catalog.json';
import { APPLICATION_ID } from './model';

// A small demo spans tabular property data, financial statements, tax forms and a narrative valuation.
const demoNumbers = [1, 15, 19, 8, 9, 27, 37];
export const demoCatalog = demoNumbers.map((number, sort_order) => {
  const id = `33000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
  const requirement = catalog.find(row => row.id === id);
  if (!requirement) throw new Error(`Missing demo requirement: ${id}`);
  return { ...requirement, sort_order };
});

/** Explicit local-demo upgrade. Preserve IDs, evidence, historical reviews and other applications. */
export async function applyRequirementCatalog(db: PoolClient) {
  await db.query('SELECT id FROM applications WHERE id=$1 FOR UPDATE', [APPLICATION_ID]);
  // Retire only known template requests. Keep their evidence and immutable reviews intact.
  await db.query(`UPDATE requirements SET lifecycle='superseded',superseded_at=now()
    WHERE application_id=$1 AND lifecycle='active'
      AND id=ANY($2::text[]) AND NOT (id=ANY($3::text[]))`,
    [APPLICATION_ID, catalog.map(r => r.id), demoCatalog.map(r => r.id)]);
  for (const r of demoCatalog) {
    await db.query(`INSERT INTO requirements
      (id,application_id,title,category,purpose,period,owner,applicability,sort_order,criteria,collection,stage,condition,source_reference)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'cre-refinance-demo-v3')
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
      [r.id,APPLICATION_ID,r.title,r.category,r.purpose,r.period,r.owner,r.applicability,r.sort_order,r.criteria,r.collection,r.stage,r.condition]);
  }
  await db.query("UPDATE applications SET checklist_version='cre-refinance-demo-v3' WHERE id=$1 AND checklist_version IS DISTINCT FROM 'cre-refinance-demo-v3'", [APPLICATION_ID]);
}
