import { requireSession } from '@/lib/authorization';
import { demoEnabled,demoRole } from '@/lib/demo-mode';
import { pool } from '@/lib/db';
import { failure, localRequest } from '@/lib/http';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    localRequest(request);
    const user = await requireSession(request.headers);
    const memberships = (await pool().query('SELECT application_id,role FROM application_memberships WHERE user_id=$1 AND active ORDER BY application_id',[user.id])).rows;
    const enabled=demoEnabled(request.headers);
    return Response.json({ userId:user.id,name:user.name, memberships,demoMode:enabled,demoRole:enabled?demoRole(request.headers):null }, { headers:{'Cache-Control':'no-store'} });
  } catch (error) { return failure(error); }
}
