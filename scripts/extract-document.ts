import {extract} from '../lib/analysis/readers/extract';
// IPC only: extracted private text must never be printed to process logs.
process.once('message',async (request:{document:{id:string;sha256:string;contentType:string};bytes:string})=>{
  try {const result=await extract(request.document,Buffer.from(request.bytes,'base64'));process.send?.({result},()=>process.exit(0));}
  catch {process.send?.({error:'unsupported_input'},()=>process.exit(0));}
});
