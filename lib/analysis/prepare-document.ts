import {fork} from 'node:child_process';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {AnalysisFailure} from '../backend/failures';
import {prepareCsv} from './prepare-csv';
import {ANALYSIS_VERSION,type PreparedDocument} from './types';
const cache=new Map<string,PreparedDocument>();
import {supportsAnalysis} from './formats';

/** Process isolation gives parsers/OCR a hard timeout and cancellation boundary. */
export async function prepareDocument(document:{id:string;sha256:string;contentType:string},bytes:Uint8Array,signal:AbortSignal):Promise<PreparedDocument>{
  if(signal.aborted)throw new AnalysisFailure('cancelled');
  if(!supportsAnalysis(document.contentType)||bytes.length>25*1024*1024||createHash('sha256').update(bytes).digest('hex')!==document.sha256)throw new AnalysisFailure('unsupported_input');
  if(document.contentType.split(';')[0].trim()==='text/csv')return prepareCsv(document,bytes);
  const key=JSON.stringify([document.id,document.sha256,document.contentType,ANALYSIS_VERSION]);
  const cached=cache.get(key);if(cached)return structuredClone(cached);
  return new Promise((resolve,reject)=>{
    const child=fork(path.join(process.cwd(),'scripts/extract-document.ts'),[],{
      execArgv:['--max-old-space-size=256','--import','tsx'],stdio:['ignore','ignore','ignore','ipc'],
      env:{PATH:process.env.PATH,NODE_ENV:process.env.NODE_ENV},
    });
    let done=false;
    const finish=(error?:AnalysisFailure,result?:PreparedDocument)=>{
      if(done)return;done=true;clearTimeout(timer);signal.removeEventListener('abort',abort);child.kill('SIGKILL');
      if(error)reject(error);else {
        if(cache.size>=32)cache.delete(cache.keys().next().value!);
        cache.set(key,structuredClone(result!));resolve(result!);
      }
    };
    const abort=()=>finish(new AnalysisFailure('cancelled'));
    const timer=setTimeout(()=>finish(new AnalysisFailure('unsupported_input')),30000);
    signal.addEventListener('abort',abort,{once:true});
    child.once('error',()=>finish(new AnalysisFailure('unsupported_input')));
    child.once('exit',()=>finish(new AnalysisFailure('unsupported_input')));
    child.once('message',(message:{result?:PreparedDocument})=>message.result?finish(undefined,message.result):finish(new AnalysisFailure('unsupported_input')));
    if(signal.aborted){abort();return;}
    child.send({document,bytes:Buffer.from(bytes).toString('base64')},error=>{if(error)finish(new AnalysisFailure('unsupported_input'));});
  });
}
