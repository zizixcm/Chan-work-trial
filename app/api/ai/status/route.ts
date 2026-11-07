import {service,json} from '@/lib/jobs/http';
import {failure} from '@/lib/http';
export const runtime='nodejs';
export async function GET(request:Request){try{return json(await(await service(request)).status());}catch(e){return failure(e);}}
