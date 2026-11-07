import {accessFor} from '@/lib/authorization';
import {localRequest,failure} from '@/lib/http';
import {body,json} from '@/lib/jobs/http';
import {captureDisagreement,type Disagreement} from '@/lib/evals/feedback';
export const runtime='nodejs';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
 try{
  localRequest(request,true);
  const url=new URL(request.url);url.searchParams.set('applicationId',(await context.params).id);
  const access=await accessFor(new Request(url,{headers:request.headers}),['borrower','lender']);
  return json(await captureDisagreement(access,await body(request) as unknown as Disagreement),201);
 }catch(error){return failure(error);}
}
