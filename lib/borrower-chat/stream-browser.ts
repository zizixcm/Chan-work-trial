import {z} from 'zod';
import {ConversationUiError,type ConversationStreamState} from './conversation-ui';
const stateSchema=z.object({uploadPending:z.boolean().optional(),pending:z.boolean(),drafts:z.array(z.object({turnId:z.string().max(256),sourceMessageId:z.string().max(256).nullable(),clientMessageId:z.string().max(256).nullable(),text:z.string().max(6000),status:z.enum(['streaming','completed','interrupted']),createdAt:z.string().max(64)})).max(20),activity:z.array(z.object({id:z.string().max(256),runId:z.string().max(256),label:z.string().max(256),status:z.enum(['running','completed','failed']),startedAt:z.string().max(64),completedAt:z.string().max(64).optional()})).max(50)});
/** Frames may split in the middle of UTF-8 characters, JSON, or event delimiters. */
export async function consumeConversationStream(response:Response,signal:AbortSignal,onState:(state:ConversationStreamState)=>void){
 if(!response.ok)throw new ConversationUiError('Could not connect to the live response.',[401,403,404].includes(response.status)?'denied':'unavailable');
 if(!response.body||!response.headers.get('content-type')?.includes('text/event-stream'))throw new ConversationUiError('Live response unavailable.','unavailable');
 const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
 const abort=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
 try{
  while(!signal.aborted){
   const {done,value}=await reader.read();if(done)break;
   buffer+=decoder.decode(value,{stream:true});
   if(buffer.length>250000)throw new Error('Live response frame too large.');
   let boundary:RegExpExecArray|null;
   while((boundary=/\r?\n\r?\n/.exec(buffer))){
    const frame=buffer.slice(0,boundary.index);buffer=buffer.slice(boundary.index+boundary[0].length);
    const lines=frame.split(/\r?\n/),event=lines.find(line=>line.startsWith('event:'))?.slice(6).trim();
    if(event==='unavailable')throw new ConversationUiError('Live response interrupted. Reconnecting…','unavailable');
    if(event==='state')onState(stateSchema.parse(JSON.parse(lines.filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n'))));
   }
  }
 }finally{signal.removeEventListener('abort',abort);await reader.cancel().catch(()=>{});reader.releaseLock();}
}
