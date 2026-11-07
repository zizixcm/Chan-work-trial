import {service,json,body,key,revision} from '@/lib/jobs/http';
import {failure} from '@/lib/http';
export const runtime='nodejs';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){try{const s=await service(request);const b=await body(request);const result=await s.request('verify_requirement.v1',(await context.params).id,key(b.idempotencyKey),{definition:revision(b.expectedDefinitionRevision),evidence:revision(b.expectedEvidenceRevision),submissionId:typeof b.expectedSubmissionId==='string'?b.expectedSubmissionId:undefined});return json({job:await s.get(result.id!),reused:result.reused},202);}catch(e){return failure(e);}}
