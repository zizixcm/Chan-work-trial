import 'server-only';
import { getPortalSession } from './portal-session';
import { pool } from './db';
import { UploadError } from './validation';
import { localRequest } from './http';
export type Role = 'borrower' | 'lender';
export type Access = { userId: string; displayName: string; applicationId: string; role: Role };
export async function requireSession(headers: Headers) {
  const session = await getPortalSession(headers);
  if (!session) throw new UploadError('Sign in to continue.', 401);
  return session.user;
}
export async function accessFor(request: Request, roles: readonly Role[], documentId?: string): Promise<Access> {
  localRequest(request, request.method !== 'GET');
  const user = await requireSession(request.headers);
  const selected = new URL(request.url).searchParams.get('applicationId');
  const result = documentId
    ? await pool().query(`SELECT m.application_id, m.role FROM application_memberships m JOIN documents d ON d.application_id=m.application_id WHERE m.user_id=$1 AND m.active AND d.id=$2 AND ($3::text IS NULL OR d.application_id=$3)`, [user.id, documentId, selected])
    : await pool().query(`SELECT application_id, role FROM application_memberships WHERE user_id=$1 AND active AND ($2::text IS NULL OR application_id=$2) ORDER BY application_id`, [user.id, selected]);
  if (!result.rows.length) throw new UploadError('Application not found.', 404);
  if (!documentId && !selected && result.rows.length > 1) throw new UploadError('Select an application.', 400);
  const membership = result.rows[0];
  if (!roles.includes(membership.role)) throw new UploadError('Your account cannot perform this action.', 403);
  return { userId: user.id, displayName: user.name, applicationId: membership.application_id, role: membership.role };
}
