import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getPortalSession } from '@/lib/portal-session';
import { pool } from '@/lib/db';
export default async function AiLayout({children}:{children:React.ReactNode}) {
  const session=await getPortalSession(await headers());
  if(!session) redirect('/login');
  const membership=await pool().query("SELECT 1 FROM application_memberships WHERE user_id=$1 AND active AND role='lender'",[session.user.id]);
  if(!membership.rows.length) redirect('/');
  return children;
}
