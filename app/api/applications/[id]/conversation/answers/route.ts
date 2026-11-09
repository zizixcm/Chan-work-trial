import {ConversationAnswers} from '@/lib/borrower-chat/answers';
import {borrowerAccess,type ApplicationRoute} from '@/lib/borrower-chat/http';
import {failure} from '@/lib/http';
import {body,json} from '@/lib/jobs/http';
export const runtime='nodejs';
export async function POST(request:Request,context:ApplicationRoute) {
  try {
    const service=new ConversationAnswers(await borrowerAccess(request,context));
    const result=await service.ask(await body(request,4096));
    return json(result,result.replayed?200:201);
  }catch(error){return failure(error);}
}
export async function GET(request:Request,context:ApplicationRoute) {
  try {
    const service=new ConversationAnswers(await borrowerAccess(request,context));
    const params=new URL(request.url).searchParams;
    if(params.has('answerId')||params.has('sourceId'))return json(await service.source(params.get('answerId')??'',params.get('sourceId')??''));
    return json(await service.read(params.get('before')??undefined));
  }catch(error){return failure(error);}
}
