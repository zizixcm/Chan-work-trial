import 'server-only';
import { getAuth } from './auth';
import { demoEnabled,demoRole,demoUser } from './demo-mode';
/** Demo role selection resolves only the two seeded synthetic identities. */
export async function getPortalSession(headers:Headers) {
  if(demoEnabled(headers))return {user:await demoUser(demoRole(headers))};
  return getAuth().api.getSession({headers});
}
