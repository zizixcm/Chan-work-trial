import {finalizeUpload} from '@/lib/jobs/upload-finalization';
import { accessFor } from '@/lib/authorization';
import { UploadBatchService, type BatchMember } from '@/lib/jobs/batches';
import { body, json, key } from '@/lib/jobs/http';
import { failure, localRequest } from '@/lib/http';
export const runtime='nodejs';
export async function POST(request:Request) {
  try {
    localRequest(request,true);
    const service=new UploadBatchService(await accessFor(request,['borrower']));
    const input=await body(request,32768);
    if(input.action==='finalize')return json(await finalizeUpload(service,input));
    return json(await service.create(key(input.id),input.members as BatchMember[]),201);
  }catch(error){return failure(error);}
}
export async function GET(request:Request) {
  try {
    localRequest(request);
    const service=new UploadBatchService(await accessFor(request,['borrower']));
    const params=new URL(request.url).searchParams;
    if(params.get('latest')==='1')return json({batch:await service.latest()});
    return json(await service.status(key(params.get('id'))));
  }catch(error){return failure(error);}
}
