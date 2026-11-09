import {consumeConversationStream} from './stream-browser';
import {ConversationUiError,type ConversationUiAdapter,type ConversationUiSnapshot} from './conversation-ui';
/** Browser transport only. No authority, policy or document fingerprints supplied. */
export function createConversationUiAdapter(applicationId:string):ConversationUiAdapter {
  const url=`/api/applications/${encodeURIComponent(applicationId)}/conversation/bridge`;
  let contextRevision='';
  const pending=new Map<string,Record<string,unknown>>();
  async function request<T>(target:string,signal:AbortSignal,payload?:unknown):Promise<T> {
    const response=await fetch(target,{signal,cache:'no-store',...(payload===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})});
    const value=await response.json();
    if(!response.ok)throw new ConversationUiError(value.error||'Conversation request failed.',[401,403,404].includes(response.status)?'denied':response.status===409||response.status===400?'conflict':'unavailable');
    return value;
  }
  return {
    async listen(signal,onState){await consumeConversationStream(await fetch(url.replace(/bridge$/,'stream'),{signal,cache:'no-store'}),signal,onState);},
    async read(signal){const value=await request<ConversationUiSnapshot>(url,signal);contextRevision=value.contextRevision??'';return value;},
    async send(input,signal){
      if(!pending.has(input.clientMessageId))pending.set(input.clientMessageId,{...input,...(['investigate_gap','review_documents'].includes(input.intent)?{expectedContextRevision:contextRevision}:{})});
      try{await request(url,signal,pending.get(input.clientMessageId));pending.delete(input.clientMessageId);}
      catch(error){if(error instanceof ConversationUiError&&error.kind==='conflict')pending.delete(input.clientMessageId);throw error;}
    },
    async confirmMapping(input,signal){await request(url,signal,{action:'confirm_mapping',...input});},
    async answer(input,signal){await request(url,signal,{action:'answer',...input});},
    source(input,signal){return request(`${url}?${new URLSearchParams(input)}`,signal);},
  };
}
