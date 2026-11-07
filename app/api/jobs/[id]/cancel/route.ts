import {service,json} from '@/lib/jobs/http';
import {failure} from '@/lib/http';
export const runtime='nodejs';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){try{return json(await(await service(request)).cancel((await context.params).id));}catch(e){return failure(e);}}
