import MsgReader from '@kenjiuno/msgreader';
import {convert} from 'html-to-text';

/** Called only inside the disposable extraction process. Never opens attachments. */
export function outlookMessage(bytes:Uint8Array){
 if(bytes.length<512||Buffer.from(bytes.subarray(0,8)).toString('hex')!=='d0cf11e0a1b11ae1')throw Error('Invalid MSG container');
 const message=new MsgReader(new Uint8Array(bytes).buffer).getFileData();
 if(message.error||!message.messageClass?.startsWith('IPM.Note'))throw Error('Not an Outlook email message');
 const limitations:string[]=[];
 const headers:Array<{location:string;text:string}>=[];
 const field=(name:string,value:unknown)=>{if(typeof value==='string'&&value.trim())headers.push({location:`Outlook header ${name}`,text:value});};
 field('Subject',message.subject);field('From name',message.senderName);field('From address',message.senderSmtpAddress||message.senderEmail);
 for(const recipient of message.recipients||[]){field('Recipient name',recipient.name);field('Recipient address',recipient.smtpAddress||recipient.email);}
 // Transport headers preserve the exported Date/Message-ID as untrusted evidence.
 for(const line of (message.headers||'').split(/\r?\n/))if(/^(Date|Message-ID):/i.test(line))field('Transport',line);
 let html=message.bodyHtml||'';
 if(!html&&message.html){try{html=new TextDecoder('utf-8',{fatal:true}).decode(message.html);}catch{limitations.push('Outlook HTML body encoding could not be decoded reliably.');}}
 const body=message.body?.trim()?message.body:convert(html,{wordwrap:false,selectors:[{selector:'img',format:'skip'}]});
 if(!body.trim())limitations.push('Outlook message has no readable plain-text/HTML body; RTF-only or protected content is not covered.');
 if(message.compressedRtf&&!body.trim())limitations.push('Outlook compressed RTF body requires export to EML or PDF for review.');
 if(message.attachments?.length)limitations.push(`Outlook email contains ${message.attachments.length} attachments not analyzed here. Upload them separately to include their evidence.`);
 if(message.messageClass!=='IPM.Note')limitations.push('Outlook message uses a specialized or protected message class; original-message review is required.');
 return {headers,body,limitations};
}
