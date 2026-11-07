import { adapters } from '@/lib/runtime';
import { failure } from '@/lib/http';
import { body,key,revision,json } from '@/lib/jobs/http';
import { UploadError } from '@/lib/validation';
export const runtime='nodejs';
export async function POST(request:Request,context:{params:Promise<{id:string}>}) {
  try {
    const url=new URL(request.url);url.searchParams.set('applicationId',(await context.params).id);
    const {repository}=await adapters(new Request(url,{method:request.method,headers:request.headers}),['borrower']);
    const b=await body(request),r=revision(b.expectedRevision),c=revision(b.expectedContentRevision);
    if(r===undefined||c===undefined)throw new UploadError('Refresh before sending for review.');
    return json(await repository.submit(key(b.idempotencyKey),r,c));
  }catch(error){return failure(error);}
}
