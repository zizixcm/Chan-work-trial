import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { PoolClient } from 'pg';
import { APPLICATION_ID } from './model';

export interface LoanPackageProfile {
  version: string;
  application: { borrower_name: string; property_name: string; address: string; transaction_type: string; requested_amount: number; loi_reference: string; policy_timezone: string };
  accounts: { borrower: string; lender: string };
  subjects: Array<{ key: string; kind: 'borrower' | 'property' | 'guarantor' | 'tenant'; label: string }>;
  requirements: Record<string, { subject: string; owner: string; period: string; period_start?: string; period_end?: string; as_of?: string }>;
  sources: string[];
}
/** Private transaction data stays in the ignored local data directory, not generic fixtures. */
export function readLoanPackageProfile(): LoanPackageProfile | null {
  const file = path.join(process.env.PORTAL_DATA_DIR || path.join(process.cwd(), '.data'), 'loan-package-profile.json');
  if (!existsSync(file)) return null;
  const p = JSON.parse(readFileSync(file, 'utf8')) as LoanPackageProfile;
  if (!p.version || !p.application || !Number.isFinite(p.application.requested_amount) || p.application.requested_amount <= 0 ||
      !p.accounts?.borrower || !p.accounts?.lender || !Array.isArray(p.subjects) || !p.requirements || !p.sources?.length)
    throw new Error('Invalid local loan package profile');
  for (const key of ['borrower_name','property_name','address','transaction_type','loi_reference','policy_timezone'] as const)
    if (typeof p.application[key] !== 'string' || !p.application[key].trim()) throw new Error('Missing application profile field');
  if (new Set(p.subjects.map(s => s.key)).size !== p.subjects.length) throw new Error('Duplicate profile subject');
  for (const s of p.subjects) if (!/^[a-z0-9-]+$/.test(s.key) || !['borrower','property','guarantor','tenant'].includes(s.kind) || !s.label?.trim()) throw new Error('Invalid profile subject');
  for (const r of Object.values(p.requirements)) {
    if (!p.subjects.some(s => s.key === r.subject) || !r.owner?.trim() || !r.period?.trim()) throw new Error('Invalid requirement profile');
    for (const date of [r.period_start,r.period_end,r.as_of]) if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)))) throw new Error('Invalid profile date');
    if (r.period_start && r.period_end && r.period_start > r.period_end) throw new Error('Invalid profile period');
  }
  return p;
}
export async function applyLoanPackageIdentity(db: PoolClient, p: LoanPackageProfile) {
  const a = p.application;
  const changed = await db.query(`UPDATE applications SET borrower_name=$2,property_name=$3,address=$4,transaction_type=$5,requested_amount=$6,loi_reference=$7,policy_timezone=$8,
    revision=revision+1,content_revision=content_revision+1 WHERE id=$1
    AND ROW(borrower_name,property_name,address,transaction_type,requested_amount,loi_reference,policy_timezone)
      IS DISTINCT FROM ROW($2::text,$3::text,$4::text,$5::text,$6::numeric,$7::text,$8::text)`,
    [APPLICATION_ID,a.borrower_name,a.property_name,a.address,a.transaction_type,a.requested_amount,a.loi_reference,a.policy_timezone]);
  for (const s of p.subjects) await db.query(`INSERT INTO application_subjects(id,application_id,kind,label) VALUES($1,$2,$3,$4)
    ON CONFLICT(id) DO UPDATE SET label=EXCLUDED.label WHERE application_subjects.application_id=EXCLUDED.application_id AND application_subjects.label IS DISTINCT FROM EXCLUDED.label`,
    [`${APPLICATION_ID}:${s.key}`,APPLICATION_ID,s.kind,s.label]);
  // Only the explicitly provisioned demo accounts; never rename other members.
  for (const role of ['borrower','lender'] as const) await db.query(`UPDATE "user" u SET name=$1 WHERE email=$2 AND EXISTS(
    SELECT 1 FROM application_memberships m WHERE m.user_id=u.id AND m.application_id=$3 AND m.role=$4) AND name IS DISTINCT FROM $1`,
    [p.accounts[role],`${role}@proximitty.example`,APPLICATION_ID,role]);
  if (changed.rowCount) await db.query(`INSERT INTO audit_events(id,application_id,actor,action,target_id,created_at,actor_kind,target_type,details,visibility)
    VALUES(gen_random_uuid()::text,$1,'Local package configuration','application.package_aligned',$1,now(),'system','application',$2,'lender_internal')`,
    [APPLICATION_ID,JSON.stringify({profile:p.version,sources:p.sources})]);
}
