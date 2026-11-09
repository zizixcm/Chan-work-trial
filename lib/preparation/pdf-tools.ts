import { createHash,randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname,join } from 'node:path';
import type { EvidenceTools,PageObservation } from './actions';
import { MAX_EVIDENCE_BYTES } from './evidence-limits';
/** Local PDF capability. Runtime callers use the isolated DocumentEvidenceTools
 * process boundary. No network, OCR or signature authentication here. */
export class PilotPdfTools implements EvidenceTools {
 private async open(bytes:Uint8Array,sha256:string){
  if(bytes.length>MAX_EVIDENCE_BYTES||createHash('sha256').update(bytes).digest('hex')!==sha256)throw new Error('Invalid evidence bytes');
  const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');const require=createRequire(import.meta.url);
  const task=getDocument({data:new Uint8Array(bytes),stopAtErrors:true,useSystemFonts:true,disableFontFace:true,standardFontDataUrl:join(dirname(require.resolve('pdfjs-dist/package.json')),'standard_fonts')+'/'});
  try{const pdf=await task.promise;if(pdf.numPages>500)throw new Error('PDF page limit');return {task,pdf};}catch(e){await task.destroy();throw e;}
 }
 async inspect(bytes:Uint8Array,documentId:string,sha256:string):Promise<PageObservation>{
  const {task,pdf}=await this.open(bytes,sha256);try{return {id:randomUUID(),documentId,sha256,kind:'inventory',pageCount:pdf.numPages,pages:[],limitations:['Page count is not evidence inspection.']};}finally{await task.destroy();}
 }
 async read(bytes:Uint8Array,documentId:string,sha256:string,pages:number[],mode:'text'|'image'):Promise<PageObservation>{
  if(!pages.length||pages.length>8||new Set(pages).size!==pages.length||pages.some(p=>!Number.isSafeInteger(p)||p<1))throw new Error('Invalid page selection');
  const {task,pdf}=await this.open(bytes,sha256);const output:PageObservation={id:randomUUID(),documentId,sha256,kind:mode,pageCount:pdf.numPages,pages:[],limitations:[]};
  try{
   if(pages.some(p=>p>pdf.numPages))throw new Error('Page outside document');
   for(const number of pages){const page=await pdf.getPage(number);const text=await page.getTextContent();const native=text.items.filter((i):i is import('pdfjs-dist/types/src/display/api').TextItem=>'str' in i).map(i=>i.str).join(' ');
    if(native.length>24000)throw new Error('Page text limit; narrower capability required');
    if(mode==='text'){output.pages.push({page:number,text:native});if(!native.trim())output.limitations.push(`Page ${number}: no native text; consider image inspection.`);else output.limitations.push(`Page ${number}: text does not establish visual/signature or form-appearance facts.`);}
    else{const viewport=page.getViewport({scale:1.5});if(viewport.width*viewport.height>4000000)throw new Error('Page render limit');const {createCanvas}=await import('@napi-rs/canvas');const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));await page.render({canvas:canvas as never,canvasContext:canvas.getContext('2d') as never,viewport}).promise;const png=canvas.toBuffer('image/png');if(png.length>4000000)throw new Error('Page image limit');output.pages.push({page:number,text:native,imageBase64:png.toString('base64')});output.limitations.push(`Page ${number}: visible marks do not authenticate signatures or authority.`);}
    page.cleanup();
   }return output;
  }finally{await task.destroy();}
 }
}
