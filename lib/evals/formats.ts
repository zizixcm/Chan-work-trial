import {PDFDocument,StandardFonts} from 'pdf-lib';
import ExcelJS from 'exceljs';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {prepareDocument} from '../analysis/prepare-document';
import {evaluationCases} from './cases';
/** Public synthetic evidence only. Tests extraction + the same assessment prompt. */
export async function formatEvaluationCases(){
 const lines=['Property: Demo Plaza','Period: November 2026','Monthly rent: 5000 dollars'];
 const image=await sharp(Buffer.from(`<svg width="1400" height="330"><rect width="100%" height="100%" fill="white"/>${lines.map((line,i)=>`<text x="30" y="${80+i*95}" font-size="48" fill="black">${line}</text>`).join('')}</svg>`)).png().toBuffer();
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),page=pdf.addPage();lines.forEach((line,i)=>page.drawText(line,{font,y:700-i*40}));
 const scan=await PDFDocument.create(),embedded=await scan.embedPng(image);scan.addPage([700,165]).drawImage(embedded,{width:700,height:165});
 const book=new ExcelJS.Workbook();book.addWorksheet('Rent').addRows([['Property','Period','Monthly rent'],['Demo Plaza','November 2026',5000]]);
 const files=[{id:'native-pdf',type:'application/pdf',bytes:await pdf.save()},{id:'scanned-pdf',type:'application/pdf',bytes:await scan.save()},{id:'xlsx',type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',bytes:new Uint8Array(await book.xlsx.writeBuffer())}];
 for(const format of ['png','jpeg','webp'] as const)files.push({id:format,type:'image/'+format,bytes:await sharp(image).toFormat(format).toBuffer()});
 return Promise.all(files.map(async file=>({id:file.id,expected:'fulfilled',requirement:evaluationCases[0].requirement,document:await prepareDocument({id:file.id,sha256:createHash('sha256').update(file.bytes).digest('hex'),contentType:file.type},file.bytes,new AbortController().signal)})));
}
