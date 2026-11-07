import {service,json,body,key} from '@/lib/jobs/http';
import {failure} from '@/lib/http';
export const runtime='nodejs';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){try{const s=await service(request);const b=await body(request);const result=await s.retry((await context.params).id,key(b.idempotencyKey));return json({job:await s.get(result.id!)},202);}catch(e){return failure(e);}}
