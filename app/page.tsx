import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getPortalSession } from '@/lib/portal-session';
import { pool } from '@/lib/db';
import BorrowerApplications from './components/borrower-applications';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const session=await getPortalSession(await headers());
  if(!session) redirect('/login');
  const memberships=(await pool().query('SELECT role FROM application_memberships WHERE user_id=$1 AND active',[session.user.id])).rows;
  if(!memberships.some(m=>m.role==='borrower') && memberships.some(m=>m.role==='lender')) redirect('/lender');
  return <BorrowerApplications />;
}
