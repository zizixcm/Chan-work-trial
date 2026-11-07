import 'server-only';
import path from 'node:path';
import { pool } from '../db';
import { requireSession } from '../authorization';
import { UploadError } from '../validation';
import { isDebugDeveloper } from './access';
import { LocalDebugStore } from './store';
import { readDebugRequest } from './read-handler';

export async function requireDebugDeveloper(headers: Headers) {
  const user = await requireSession(headers);
  if (!isDebugDeveloper(user.id, process.env.ANALYSIS_DEBUG_USER_IDS)) {
    throw new UploadError('Developer access is required.', 403);
  }
  return user;
}
export function debugStore() {
  return new LocalDebugStore(path.join(path.resolve(process.env.PORTAL_DATA_DIR || '.data'), 'analysis-debug'));
}
export async function debugRead(request: Request, id?: string) {
  let userId='';
  return readDebugRequest(request, {authorize: async headers=>{const user=await requireDebugDeveloper(headers);userId=user.id;}, store: ()=>{
    const store=debugStore();
    const allowed=async(jobId:string)=>!!(await pool().query(`SELECT 1 FROM analysis_jobs j JOIN application_memberships m ON m.application_id=j.application_id
      WHERE j.id=$1 AND m.user_id=$2 AND m.active AND (m.role='borrower' OR
       (m.role='lender' AND j.consent_scope='lender' AND j.input->'observed'->>'submissionId'=(SELECT s.id FROM submissions s WHERE s.application_id=j.application_id ORDER BY revision_number DESC LIMIT 1)))`,[jobId,userId])).rowCount;
    return {save:store.save.bind(store),get:async id=>{const run=await store.get(id);return run&&await allowed(run.jobId)?run:null;},list:async()=>{const rows=await store.list(),visible=[];for(const row of rows)if(await allowed(row.jobId))visible.push(row);return visible;}};
  }}, id);
}
