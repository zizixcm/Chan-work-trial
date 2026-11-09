import {BorrowerAgentService} from '@/lib/agents/borrower-service';
import {borrowerAccess,type ApplicationRoute} from '@/lib/borrower-chat/http';
import {pool} from '@/lib/db';
import {failure} from '@/lib/http';
import {UploadError} from '@/lib/validation';
export const runtime='nodejs';
export const dynamic='force-dynamic';
/** Reconnect reads the durable draft. Opening/closing this stream never runs or cancels an agent. */
export async function GET(request:Request,context:ApplicationRoute){
 try{
  if(process.env.BORROWER_PROCESSING_CHAT!=='1'||process.env.BORROWER_AGENT_CHAT!=='1')throw new UploadError('Streaming unavailable.',404);
  const service=new BorrowerAgentService(pool());
  const read=async()=>service.streamState(await borrowerAccess(request,context));
  const initial=await read(),encoder=new TextEncoder(),stop=new AbortController();
  let timer:ReturnType<typeof setTimeout>|undefined,wake:(()=>void)|undefined;
  const cancel=()=>{stop.abort();clearTimeout(timer);wake?.();};
  request.signal.addEventListener('abort',cancel,{once:true});
  const stream=new ReadableStream<Uint8Array>({
   async start(controller){
    let previous='',state=initial;const start=Date.now();
    try{
     while(!stop.signal.aborted&&!request.signal.aborted&&Date.now()-start<55000){
      const serialized=JSON.stringify(state);
      if(serialized!==previous){controller.enqueue(encoder.encode(`event: state\ndata: ${serialized}\n\n`));previous=serialized;}
      await new Promise<void>(resolve=>{wake=resolve;timer=setTimeout(resolve,200);});wake=undefined;
      if(stop.signal.aborted||request.signal.aborted)break;
      state=await read();
     }
    }catch{
     if(!stop.signal.aborted&&!request.signal.aborted)controller.enqueue(encoder.encode('event: unavailable\ndata: {}\n\n'));
    }finally{request.signal.removeEventListener('abort',cancel);clearTimeout(timer);if(!stop.signal.aborted)controller.close();}
   },cancel,
  });
  return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'private, no-cache, no-store, no-transform','X-Accel-Buffering':'no','Connection':'keep-alive'}});
 }catch(error){return failure(error);}
}
