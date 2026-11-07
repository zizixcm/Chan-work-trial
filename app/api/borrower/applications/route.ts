import { requireSession } from '@/lib/authorization';
import { pool } from '@/lib/db';
import { failure, localRequest } from '@/lib/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    localRequest(request);
    const user = await requireSession(request.headers);
    // Applications have no archived/closed status. Active membership is the
    // existing access boundary; submission does not end that membership.
    const applications = (await pool().query(`
      SELECT a.id,a.borrower_name,a.property_name,a.address,a.transaction_type,
        a.requested_amount::float8 AS requested_amount,a.created_at
      FROM applications a JOIN application_memberships m ON m.application_id=a.id
      WHERE m.user_id=$1 AND m.active AND m.role='borrower'
      ORDER BY a.created_at DESC,a.id`, [user.id])).rows;
    return Response.json({ applications }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return failure(error); }
}
