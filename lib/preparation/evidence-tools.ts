import {fork} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import type {EvidenceTools,PageObservation} from './actions';
import {supportsAnalysis} from '../analysis/formats';
import {MAX_EVIDENCE_BYTES} from './evidence-limits';

export type EvidenceCommand={operation:'inspect'|'read'|'search';documentId:string;sha256:string;contentType:string;pages?:number[];mode?:'text'|'image'|'ocr';query?:string};
/** All file parsers/OCR execute in a disposable process with no provider credentials.
 * File/version hashes fence every read. No remote images, links, macros or formulas execute. */
export class DocumentEvidenceTools implements EvidenceTools {
 constructor(private timeoutMs=45000){}
 private execute(bytes:Uint8Array,command:EvidenceCommand):Promise<PageObservation>{
  if(bytes.length>MAX_EVIDENCE_BYTES||!supportsAnalysis(command.contentType)||createHash('sha256').update(bytes).digest('hex')!==command.sha256)throw Error('Unsupported or changed evidence');
  return new Promise((resolve,reject)=>{
   const child=fork(path.join(process.cwd(),'scripts/read-preparation-evidence.ts'),[],{execArgv:['--max-old-space-size=384','--import','tsx'],stdio:['ignore','ignore','ignore','ipc'],env:{PATH:process.env.PATH,NODE_ENV:process.env.NODE_ENV}});
   let done=false;
   const finish=(error?:Error,result?:PageObservation)=>{if(done)return;done=true;clearTimeout(timer);child.kill('SIGKILL');error?reject(error):resolve(result!);};
   const timer=setTimeout(()=>finish(Error('Evidence reader time limit')),this.timeoutMs);
   child.once('error',()=>finish(Error('Evidence reader unavailable')));
   child.once('exit',()=>finish(Error('Evidence reader stopped')));
   child.once('message',(message:{result?:PageObservation;error?:string})=>message.result?finish(undefined,message.result):finish(Error(message.error??'Unsupported evidence')));
   child.send({command,bytes:Buffer.from(bytes).toString('base64')},error=>{if(error)finish(Error('Evidence reader unavailable'));});
  });
 }
 inspect(bytes:Uint8Array,documentId:string,sha256:string,contentType='application/pdf'){return this.execute(bytes,{operation:'inspect',documentId,sha256,contentType});}
 read(bytes:Uint8Array,documentId:string,sha256:string,pages:number[],mode:'text'|'image'|'ocr',contentType='application/pdf'){return this.execute(bytes,{operation:'read',documentId,sha256,contentType,pages,mode});}
 search(bytes:Uint8Array,documentId:string,sha256:string,query:string,pages:number[],contentType='application/pdf'){return this.execute(bytes,{operation:'search',documentId,sha256,contentType,query,pages});}
}
