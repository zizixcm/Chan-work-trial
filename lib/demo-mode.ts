import { pool } from './db';
import { UploadError } from './validation';
export type DemoRole='borrower'|'lender';
export const DEMO_ROLE_COOKIE='proximity_demo_role';
const emails:Record<DemoRole,string>={borrower:'borrower@proximitty.example',lender:'lender@proximitty.example'};
/** Explicit opt-in and loopback Host only. This never changes production auth. */
export function demoEnabled(headers:Headers) {
  if(process.env.LOCAL_DEMO_MODE!=='1')return false;
  if(!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i.test(headers.get('host')||''))throw new UploadError('Local demo mode is available on localhost only.',403);
  return true;
}
export function demoRole(headers:Headers):DemoRole {
  const values=(headers.get('cookie')||'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(DEMO_ROLE_COOKIE+'='));
  if(!values.length)return 'borrower';
  if(values.length!==1)throw new UploadError('Invalid demo role.',400);
  const role=values[0].slice(DEMO_ROLE_COOKIE.length+1);
  if(role!=='borrower'&&role!=='lender')throw new UploadError('Invalid demo role.',400);
  return role;
}
export async function demoUser(role:DemoRole) {
  const user=(await pool().query('SELECT id,name,email,"emailVerified",image,"createdAt","updatedAt" FROM "user" WHERE email=$1',[emails[role]])).rows[0];
  if(!user)throw new UploadError('The local demo accounts are not set up.',503);
  return user;
}
