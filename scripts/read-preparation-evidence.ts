import {randomUUID,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
import {PilotPdfTools} from '../lib/preparation/pdf-tools';
import {extract} from '../lib/analysis/readers/extract';
import type {PageObservation} from '../lib/preparation/actions';
import type {EvidenceCommand} from '../lib/preparation/evidence-tools';

async function read(bytes:Uint8Array,c:EvidenceCommand):Promise<PageObservation>{
 if(createHash('sha256').update(bytes).digest('hex')!==c.sha256)throw Error('Evidence changed');
 const pdf=c.contentType==='application/pdf',image=c.contentType.startsWith('image/');
 const pages=c.pages??[];
 if(c.operation!=='inspect'&&(!pages.length||pages.length>(c.operation==='search'?40:8)||new Set(pages).size!==pages.length||pages.some(p=>!Number.isSafeInteger(p)||p<1)))throw Error('Invalid selection');
 let result:PageObservation;
 if(pdf){
  const reader=new PilotPdfTools();
  if(c.operation==='inspect')return reader.inspect(bytes,c.documentId,c.sha256);
  if(c.operation==='search'){
   const inventory=await reader.inspect(bytes,c.documentId,c.sha256);result={...inventory,id:randomUUID(),kind:'search',query:c.query,searchedPages:pages,limitations:['Search hits are candidates, not inspected support. Empty hits do not establish absence.']};
   for(let i=0;i<pages.length;i+=8){const part=await reader.read(bytes,c.documentId,c.sha256,pages.slice(i,i+8),'text');result.pages.push(...part.pages.filter(p=>p.text.toLowerCase().includes((c.query??'').toLowerCase())).map(p=>({...p,text:p.text.slice(0,300)})));}
   return result;
  }
  result=await reader.read(bytes,c.documentId,c.sha256,pages,c.mode==='ocr'?'image':c.mode??'text');
 }else if(image){
  result={id:randomUUID(),documentId:c.documentId,sha256:c.sha256,kind:'inventory',pageCount:1,pages:[],limitations:['Image 1 is a single visual unit.']};
  if(c.operation==='inspect')return result;
  if(pages.some(p=>p!==1)||c.operation==='search'||c.mode==='text')throw Error('Use image or OCR mode for image evidence');
  const sharp=(await import('sharp')).default;const png=await sharp(bytes,{limitInputPixels:16000000}).resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).png().toBuffer();
  result.kind='image';result.pages=[{page:1,text:'',imageBase64:png.toString('base64'),location:'Image 1'}];
 }else{
  // Existing bounded Word/Excel/TXT/CSV/EML/MSG extractors retain source locations.
  const source=await extract({id:c.documentId,sha256:c.sha256,contentType:c.contentType},bytes);
  const chunks:PageObservation['pages']=[];
  for(let i=0;i<source.records.length;i+=20){
   const location=`Records ${i+1}–${Math.min(i+20,source.records.length)} (${source.locations?.[i]??'record '+(i+1)})`;
   const text=source.records.slice(i,i+20).map((r,j)=>`${source.locations?.[i+j]??'Record '+(i+j+1)}: ${r.join(' | ')}`).join('\n');
   chunks.push({page:chunks.length+1,text,location});
  }
  if(!chunks.length)chunks.push({page:1,text:'',location:'No extracted records'});
  result={id:randomUUID(),documentId:c.documentId,sha256:c.sha256,kind:'inventory',pageCount:chunks.length,pages:[],coverageIssues:source.limitations??[],limitations:[...(source.limitations??[]),'Units are record chunks, not physical pages; cite the provided source locations.']};
  if(c.operation==='inspect')return {...result,pages:chunks.map(p=>({...p,text:p.location!}))};
  if(pages.some(p=>p>chunks.length))throw Error('Record chunk outside document');
  if(c.operation==='search')return {...result,kind:'search',query:c.query,searchedPages:pages,pages:chunks.filter(p=>pages.includes(p.page)&&p.text.toLowerCase().includes((c.query??'').toLowerCase())).map(p=>({...p,text:p.text.slice(0,300)})),limitations:[...result.limitations,'Search hits locate candidates; read before citing.']};
  if(c.mode!=='text')throw Error('Word/Excel/text/email support text records; export embedded visuals to PDF or image for visual review');
  return {...result,kind:'text',pages:chunks.filter(p=>pages.includes(p.page))};
 }
 if(c.mode==='ocr'){
  const {createWorker}=await import('tesseract.js'),require=createRequire(import.meta.url);
  const worker=await createWorker('eng',1,{langPath:join(dirname(require.resolve('@tesseract.js-data/eng/package.json')),'4.0.0'),cacheMethod:'none',gzip:true,logger:()=>{},errorHandler:()=>{}});
  try{for(const page of result.pages){const {data}=await worker.recognize(Buffer.from(page.imageBase64!,'base64'));if(data.text.length>24000)throw Error('OCR text limit');page.text=data.text;page.confidence=data.confidence;delete page.imageBase64;if(data.confidence<80||!data.text.trim())result.limitations.push(`Unit ${page.page}: OCR empty or low confidence; inspect the image.`);}}finally{await worker.terminate();}
  result.kind='ocr';result.limitations.push('OCR is fallible transcription, not signature authentication.');
 }
 return result;
}
process.once('message',async(message:{command:EvidenceCommand;bytes:string})=>{
 try{const result=await read(new Uint8Array(Buffer.from(message.bytes,'base64')),message.command);process.send?.({result});}
 catch{process.send?.({error:'Unsupported, malformed or oversized evidence; original review or another export is needed.'});}
});
