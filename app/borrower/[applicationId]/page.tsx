import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getPortalSession } from '@/lib/portal-session';
import { pool } from '@/lib/db';
import Portal from '@/app/components/borrower-portal';
export const dynamic='force-dynamic';
export default async function BorrowerApplication({params}:{params:Promise<{applicationId:string}>}) {
  const session=await getPortalSession(await headers());
  if(!session)redirect('/login');
  const {applicationId}=await params;
  const membership=await pool().query("SELECT 1 FROM application_memberships WHERE user_id=$1 AND active AND role='borrower' AND application_id=$2",[session.user.id,applicationId]);
  if(!membership.rows.length)notFound();
  return <Portal key={applicationId} applicationId={applicationId} />;
}
