import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getPortalSession } from '@/lib/portal-session';
import { pool } from '@/lib/db';
import LoanChatWorkspace from './components/loan-chat-workspace';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const session=await getPortalSession(await headers());
  if(!session) redirect('/login');
  const memberships=(await pool().query('SELECT role FROM application_memberships WHERE user_id=$1 AND active',[session.user.id])).rows;
  if(!memberships.some(m=>m.role==='borrower') && memberships.some(m=>m.role==='lender')) redirect('/lender');
  const application=(await pool().query("SELECT application_id FROM application_memberships WHERE user_id=$1 AND active AND role='borrower' ORDER BY application_id LIMIT 1",[session.user.id])).rows[0];
  if(!application)return <main style={{padding:40}}>Your loan conversation will appear here when an application is available.</main>;
  return <LoanChatWorkspace applicationId={application.application_id}/>;
}
