import { accessFor } from '../authorization';
import { UploadError } from '../validation';
import { AnalysisService } from './service';
export async function service(request:Request,applicationId?:string) {
 const url=new URL(request.url);if(applicationId)url.searchParams.set('applicationId',applicationId);
 const scoped=new Request(url,{method:request.method,headers:request.headers});
 return new AnalysisService(await accessFor(scoped,['borrower','lender']));
}
export const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
export async function body(request:Request):Promise<Record<string,unknown>> {
 if(Number(request.headers.get('content-length'))>8192)throw new UploadError('Request too large.',413);
 const reader=request.body?.getReader();if(!reader)throw new UploadError('Request body required.');
 const chunks:Uint8Array[]=[];let size=0;
 for(;;){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>8192){await reader.cancel();throw new UploadError('Request too large.',413);}chunks.push(r.value);}
 try {const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value;}catch{throw new UploadError('Invalid request.');}
}
export function key(value:unknown) {if(typeof value!=='string'||value.length<1||value.length>160)throw new UploadError('A request key is required.');return value;}
export function revision(value:unknown) {if(value===undefined)return undefined;if(typeof value!=='string'||!/^\d{1,20}$/.test(value))throw new UploadError('Invalid revision.');return value;}
