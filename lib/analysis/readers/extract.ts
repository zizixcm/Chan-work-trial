import {outlookMessage} from './outlook';
import {wordParagraphs,plainText} from './office-text';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
import {AnalysisError,type PreparedDocument} from '../types';
import {validateFile} from '../../validation';
import {prepareCsv} from '../prepare-csv';

/** Runs only in a disposable child process. No external fetches or formula execution. */
export async function extract(document:{id:string;sha256:string;contentType:string},bytes:Uint8Array):Promise<PreparedDocument> {
  if(createHash('sha256').update(bytes).digest('hex')!==document.sha256)throw new AnalysisError('UNSUPPORTED_INPUT');
  const mime=document.contentType.split(';')[0].trim().toLowerCase();
  if(mime==='text/csv')return prepareCsv(document,bytes);
  const extensions:Record<string,string>={'application/vnd.ms-outlook':'msg','text/plain':'txt','message/rfc822':'eml','application/vnd.openxmlformats-officedocument.wordprocessingml.document':'docx','application/pdf':'pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'xlsx','image/png':'png','image/jpeg':'jpg','image/webp':'webp'};
  if(!extensions[mime])throw new AnalysisError('UNSUPPORTED_INPUT');
  // MSG upload validation invokes this isolated reader; do not recurse.
  if(mime!=='application/vnd.ms-outlook')await validateFile('evidence.'+extensions[mime],bytes);
  const records:string[][]=[],locations:string[]=[],limitations:string[]=[];
  const add=(location:string,value:string)=>{
    if(!value.trim())return;
    // Never truncate evidence or silently skip sheets/pages beyond bounds.
    if(value.length>2000||records.length>=500)throw new AnalysisError('INPUT_TOO_LARGE');
    records.push([value]);locations.push(location);
    if(Buffer.byteLength(JSON.stringify(records))>60000)throw new AnalysisError('INPUT_TOO_LARGE');
  };
  let ocr:Awaited<ReturnType<typeof import('tesseract.js').createWorker>>|undefined;
  const readImage=async(image:Buffer,location:string)=>{
    if(!ocr){
      const {createWorker}=await import('tesseract.js');
      const require=createRequire(import.meta.url);
      const langPath=join(dirname(require.resolve('@tesseract.js-data/eng/package.json')),'4.0.0');
      ocr=await createWorker('eng',1,{langPath,cacheMethod:'none',gzip:true,logger:()=>{},errorHandler:()=>{}});
    }
    const {data}=await ocr.recognize(image);
    if(!data.text.trim()||data.confidence<80)limitations.push(`${location}: OCR is empty or low confidence; verify against the original.`);
    data.text.split(/\r?\n/).forEach((line,index)=>add(`${location}, OCR line ${index+1}`,line));
  };
  try {
    if(mime==='application/vnd.ms-outlook'){
      const email=outlookMessage(bytes);email.headers.forEach(h=>add(h.location,h.text));
      email.body.split(/\r?\n/).forEach((line,index)=>add(`Outlook body line ${index+1}`,line));
      limitations.push(...email.limitations);
    }else if(mime==='text/plain'){
      plainText(bytes).split(/\r?\n/).forEach((line,index)=>add(`Line ${index+1}`,line));
    }else if(mime==='application/vnd.openxmlformats-officedocument.wordprocessingml.document'){
      const word=wordParagraphs(bytes);word.paragraphs.forEach(p=>add(p.location,p.text));limitations.push(...word.limitations);
    }else if(mime==='message/rfc822'){
      const {default:PostalMime}=await import('postal-mime');
      const {convert}=await import('html-to-text');
      const email=await PostalMime.parse(bytes);
      for(const header of email.headers.filter(h=>['from','to','cc','date','subject','message-id'].includes(h.key.toLowerCase())))add(`Email header ${header.key}`,header.value);
      const body=email.text||convert(email.html||'',{wordwrap:false,selectors:[{selector:'img',format:'skip'}]});
      body.split(/\r?\n/).forEach((line,index)=>add(`Email body line ${index+1}`,line));
      if(!body.trim())limitations.push('Email has no readable message body.');
      if(email.attachments.length)limitations.push(`Email contains ${email.attachments.length} attachments not analyzed here. Upload them separately to include their evidence.`);
    }else if(mime.startsWith('image/')){
      const sharp=(await import('sharp')).default;
      const image=await sharp(bytes,{limitInputPixels:16000000}).png().toBuffer();
      await readImage(image,'Image 1');
    }else if(mime==='application/pdf'){
      const {getDocument,OPS}=await import('pdfjs-dist/legacy/build/pdf.mjs');
      const {createCanvas}=await import('@napi-rs/canvas');
      const require=createRequire(import.meta.url);
      const loading=getDocument({standardFontDataUrl:join(dirname(require.resolve('pdfjs-dist/package.json')),'standard_fonts')+'/',data:new Uint8Array(bytes),stopAtErrors:true,useSystemFonts:true,disableFontFace:true});
      const pdf=await loading.promise;
      try {
        if(pdf.numPages>12)throw new AnalysisError('INPUT_TOO_LARGE');
        for(let pageNumber=1;pageNumber<=pdf.numPages;pageNumber++){
          const page=await pdf.getPage(pageNumber),text=await page.getTextContent();
          const items=text.items.filter((item):item is import('pdfjs-dist/types/src/display/api').TextItem=>'str' in item);
          if(items.some(item=>item.str.trim())){
            items.forEach((item,index)=>add(`Page ${pageNumber}, text item ${index+1}`,item.str));
            const annotations=await page.getAnnotations();
            if(annotations.some(a=>a.subtype==='Widget'))limitations.push(`Page ${pageNumber}: interactive form fields require original-document review.`);
            const operators=await page.getOperatorList();
            if(operators.fnArray.some(op=>[OPS.paintImageXObject,OPS.paintInlineImageXObject,OPS.paintImageMaskXObject].includes(op)))limitations.push(`Page ${pageNumber}: embedded visual content is not covered by native text extraction.`);
          }else{
            const viewport=page.getViewport({scale:2});
            if(viewport.width*viewport.height>16000000)throw new AnalysisError('INPUT_TOO_LARGE');
            const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
            await page.render({canvas:canvas as never,canvasContext:canvas.getContext('2d') as never,viewport}).promise;
            await readImage(canvas.toBuffer('image/png'),`Page ${pageNumber}`);
          }
          page.cleanup();
        }
      }finally{await loading.destroy();}
    }else{
      const ExcelJS=(await import('exceljs')).default;
      const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(Buffer.from(bytes) as never);
      if(workbook.worksheets.length>10)throw new AnalysisError('INPUT_TOO_LARGE');
      for(const sheet of workbook.worksheets){
        if(sheet.rowCount>500||sheet.columnCount>50)throw new AnalysisError('INPUT_TOO_LARGE');
        if(sheet.getImages().length)limitations.push(`Sheet ${sheet.name}: embedded images are not covered by cell extraction.`);
        sheet.eachRow(row=>row.eachCell(cell=>{
          const value=cell.value;
          if(value&&typeof value==='object'&&('formula' in value||'sharedFormula' in value)){
            add(`Sheet ${sheet.name}!${cell.address}`,JSON.stringify(value));
            limitations.push(`Sheet ${sheet.name}: formulas and cached values are unverified, not recalculated.`);
          }else add(`Sheet ${sheet.name}!${cell.address}`,cell.text);
        }));
      }
    }
  }finally{await ocr?.terminate();}
  if(!records.length)limitations.push('No readable text was extracted; absence of text does not establish missing business evidence.');
  return {id:document.id,sha256:document.sha256,records,locations,format:mime,limitations:[...new Set(limitations)]};
}
