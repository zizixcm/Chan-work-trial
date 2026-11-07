import {service,json,body,revision} from '@/lib/jobs/http';
import {failure} from '@/lib/http';
import {UploadError} from '@/lib/validation';
export const runtime='nodejs';
export async function PUT(request:Request,context:{params:Promise<{id:string}>}){try{const s=await service(request,(await context.params).id);const b=await body(request);if(typeof b.enabled!=='boolean')throw new UploadError('Choose whether to enable AI.');return json(await s.setPreference(b.enabled,revision(b.expectedEpoch)??''));}catch(e){return failure(e);}}
