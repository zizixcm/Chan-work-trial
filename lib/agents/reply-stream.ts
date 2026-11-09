/** Extract only a top-level borrower-facing message string from native tool input.
 * Draft text is provisional until the durable tool succeeds. Never forward raw chunks. */
const tools=new Set(['reply_to_borrower','investigate_documents','answer_investigation_question']);
function stringAt(input:string,start:number):{text:string;end:number;complete:boolean}|undefined{
 if(input[start]!== '"')return;
 let text='';
 for(let i=start+1;i<input.length;i++){
  const c=input[i];
  if(c==='"')return {text,end:i+1,complete:true};
  if(c.charCodeAt(0)<32)return;
  if(c!=='\\'){text+=c;continue;}
  if(++i===input.length)return {text,end:i,complete:false};
  const escape=input[i],simple:Record<string,string>={'"':'"','\\':'\\','/':'/','b':'\b','f':'\f','n':'\n','r':'\r','t':'\t'};
  if(escape==='u'){
   const hex=input.slice(i+1,i+5);if(!/^[0-9a-f]*$/i.test(hex))return;
   if(hex.length<4)return {text,end:input.length,complete:false};
   text+=String.fromCharCode(parseInt(hex,16));i+=4;
  }else if(Object.hasOwn(simple,escape))text+=simple[escape];else return;
 }
 return {text,end:input.length,complete:false};
}
/** Prefix parsing deliberately stops at incomplete preceding values. Nested
 * strings named message, reasoning, answerText, and other arguments are skipped. */
export function replyMessagePrefix(input:string):string|undefined{
 let i=0;const ws=()=>{while(/\s/.test(input[i]??'')&&i<input.length)i++;};ws();if(input[i++]!=='{')return;
 while(i<input.length){
  ws();const key=stringAt(input,i);if(!key?.complete)return;i=key.end;ws();if(input[i++]!==':')return;ws();
  if(key.text==='message'){const value=stringAt(input,i);return value?.text.replace(/[\uD800-\uDBFF]$/,'');}
  const start=i;let depth=0,inString=false,escape=false;
  for(;i<input.length;i++){
   const c=input[i];
   if(inString){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')inString=false;continue;}
   if(c==='"'){inString=true;continue;}
   if(c==='{'||c==='['){if(++depth>64)return;}
   else if(c==='}'||c===']'){if(depth===0)break;depth--;}
   else if(c===','&&depth===0)break;
  }
  if(i===input.length||depth!==0||inString)return;
  try{JSON.parse(input.slice(start,i));}catch{return;}
  ws();if(input[i++]!==',')return;
 }
}
export function createReplyStream(onReplyText:(text:string)=>Promise<void>){
 let selected:string|undefined,name:string|undefined,input='',last='',prose='',disabled=false;
 return async(chunk:unknown)=>{
  if(disabled||!chunk||typeof chunk!=='object')return;
  const {type,payload}=chunk as {type?:string;payload?:Record<string,unknown>};if(!payload)return;
  if(type==='text-delta'&&!selected&&typeof payload.text==='string'){
   prose+=payload.text;if(prose.length>6000){disabled=true;await onReplyText('');return;}
   await onReplyText(prose);return;
  }
  if(typeof payload.toolCallId!=='string')return;
  if(!['tool-call-input-streaming-start','tool-call-delta','tool-call'].includes(type??''))return;
  const toolName=typeof payload.toolName==='string'?payload.toolName:undefined;
  if(!selected){if(!toolName||!tools.has(toolName))return;selected=payload.toolCallId;name=toolName;if(prose){prose='';await onReplyText('');}}
  if(payload.toolCallId!==selected||(toolName&&toolName!==name))return;
  let text:string|undefined;
  if(type==='tool-call-delta'&&typeof payload.argsTextDelta==='string'){
   input+=payload.argsTextDelta;if(input.length>131072){disabled=true;return;}text=replyMessagePrefix(input);
  }else if(type==='tool-call'){
   const args=payload.args;
   if(args&&typeof args==='object'&&!Array.isArray(args)&&Object.hasOwn(args,'message'))text=(args as {message?:unknown}).message as string|undefined;
  }
  if(typeof text!=='string'||!text||text===last||text.length>(name==='reply_to_borrower'?6000:2000)||!text.startsWith(last))return;
  last=text;await onReplyText(text);
 };
}
