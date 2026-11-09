import {processorMode} from '@/lib/preparation/ownership';
import {BorrowerAgentService} from '@/lib/agents/borrower-service';
import {pool} from '@/lib/db';
import {borrowerAccess,type ApplicationRoute} from '@/lib/borrower-chat/http';
import {ChatProcessingBridge} from '@/lib/borrower-chat/processing-bridge';
import {ConversationAnswers} from '@/lib/borrower-chat/answers';
import {UploadError} from '@/lib/validation';
import {failure} from '@/lib/http';
import {body,json} from '@/lib/jobs/http';
export const runtime='nodejs';
function enabled(){if(process.env.BORROWER_PROCESSING_CHAT!=='1')throw new UploadError('Conversation integration is not enabled.',404);}
export async function GET(request:Request,context:ApplicationRoute) {
  try {
    enabled();const bridge=new ChatProcessingBridge(await borrowerAccess(request,context));
    const params=new URL(request.url).searchParams;
    if(params.has('citationId')) {
      const id=params.get('resultId'),revision=params.get('resultRevision'),citation=params.get('citationId');
      if(!id||id.length>256||!revision||! /^(0|[1-9][0-9]*)$/.test(revision)||!citation||citation.length>256)throw new UploadError('Invalid source reference.');
      return json(await bridge.source(id,revision,citation));
    }
    return json(await bridge.read());
  }catch(error){return failure(error);}
}
export async function POST(request:Request,context:ApplicationRoute) {
  try {
    enabled();const access=await borrowerAccess(request,context),input=await body(request,32768);
    if(input.action==='confirm_mapping'){const {action,...mapping}=input;return json(await new ChatProcessingBridge(access).confirmMapping(mapping));}
    if(input.action==='answer'){const {action,...answer}=input;return json(await new ChatProcessingBridge(access).answer(answer));}
    if(Object.keys(input).some(key=>!['intent','clientMessageId','text','requirementId','expectedContextRevision'].includes(key)))throw new UploadError('Invalid conversation action.');
    if(process.env.BORROWER_AGENT_CHAT==='1'){const agent=new BorrowerAgentService(pool());const mode=await agent.preparation.transaction(access,db=>processorMode(db,access.applicationId));if(mode.mode==='adaptive')return json(await agent.enqueueMessage(access,{clientMessageId:input.clientMessageId,text:input.text}),202);}
    if(['requested','uploaded','missing'].includes(String(input.intent))) {
      if(input.requirementId!==undefined)throw new UploadError('Information questions do not accept investigation selectors.');
      return json(await new ConversationAnswers(access).ask({intent:input.intent,clientMessageId:input.clientMessageId},input.text as string|undefined),201);
    }
    return json(await new ChatProcessingBridge(access).delegate(input),202);
  }catch(error){return failure(error);}
}
