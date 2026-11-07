import { DEMO_ROLE_COOKIE,demoEnabled,demoUser } from '@/lib/demo-mode';
import { pool } from '@/lib/db';
import { failure,localRequest } from '@/lib/http';
import { body } from '@/lib/jobs/http';
import { UploadError } from '@/lib/validation';
export const runtime='nodejs';
export async function POST(request:Request) {
  try {
    localRequest(request,true);
    if(!demoEnabled(request.headers))throw new UploadError('Not found.',404);
    const input=await body(request);
    if(Object.keys(input).some(k=>!['role','applicationId'].includes(k))||(input.role!=='borrower'&&input.role!=='lender'))throw new UploadError('Choose borrower or lender.');
    if(input.applicationId!==undefined&&(typeof input.applicationId!=='string'||!input.applicationId||input.applicationId.length>200))throw new UploadError('Invalid application.');
    const role=input.role,user=await demoUser(role);
    const selected=typeof input.applicationId==='string'&&(await pool().query('SELECT 1 FROM application_memberships WHERE application_id=$1 AND user_id=$2 AND active AND role=$3',[input.applicationId,user.id,role])).rowCount ? input.applicationId : null;
    const redirectTo=role==='borrower'?(selected?'/borrower/'+encodeURIComponent(selected):'/'):(selected?'/lender/review?applicationId='+encodeURIComponent(selected):'/lender');
    return Response.json({role,applicationId:selected,redirectTo},{headers:{'Cache-Control':'private, no-store','Set-Cookie':`${DEMO_ROLE_COOKIE}=${role}; Path=/; HttpOnly; SameSite=Strict`}});
  }catch(error){return failure(error);}
}
