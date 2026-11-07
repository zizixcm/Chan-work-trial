import {service,json} from '@/lib/jobs/http';
import {failure} from '@/lib/http';
export const runtime='nodejs';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){try{return json(await(await service(request,(await context.params).id)).status());}catch(e){return failure(e);}}
