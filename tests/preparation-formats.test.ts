import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {zipSync,strToU8} from 'fflate';
import ExcelJS from 'exceljs';
import * as CFB from 'cfb';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import sharp from 'sharp';
import {DocumentEvidenceTools} from '../lib/preparation/evidence-tools';
const reader=new DocumentEvidenceTools();
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
test('Excel evidence handles blank merges and cites populated masters once without losing zero values',async()=>{
 const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('Rent Roll');
 sheet.mergeCells('A1:D1'); // A valid blank merged heading must not crash extraction.
 sheet.mergeCells('A2:D2');sheet.getCell('A2').value='Current tenant';
 sheet.getCell('A3').value=0;
 sheet.getCell('B3').value={formula:'A3+1',result:1};
 const bytes=new Uint8Array(await workbook.xlsx.writeBuffer());
 const type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
 const inventory=await reader.inspect(bytes,'merged',hash(bytes),type);
 assert.equal(inventory.pageCount,1);
 const result=await reader.read(bytes,'merged',hash(bytes),[1],'text',type);
 const text=result.pages[0].text;
 assert.equal(text.match(/Current tenant/g)?.length,1);
 assert.match(text,/Rent Roll!A2: Current tenant/);
 assert.match(text,/Rent Roll!A3: 0/);
 assert.match(text,/"formula":"A3\+1"/);
 assert(result.limitations.some(l=>l.includes('not recalculated')));
});
test('selective evidence tools support Word, Excel, TXT, CSV, EML and MSG with source locations',async()=>{
 const workbook=new ExcelJS.Workbook();workbook.addWorksheet('Income').getCell('B2').value='Borrower rent 5000';
 const cfb=CFB.utils.cfb_new();CFB.utils.cfb_add(cfb,'__properties_version1.0',Buffer.alloc(32));
 for(const [p,v] of [['001A001F','IPM.Note'],['0037001F','Loan evidence'],['1000001F','Borrower rent 5000']])CFB.utils.cfb_add(cfb,'__substg1.0_'+p,Buffer.from(v+'\0','utf16le'));
 const cases:Array<[string,Uint8Array,string]>=[
  ['text/plain',Buffer.from('Borrower rent 5000\nMarch 2026'),'Line'],
  ['text/csv',Buffer.from('property,rent\nBorrower,5000'),'Record'],
  ['message/rfc822',Buffer.from('From: owner@example.test\r\nSubject: Loan evidence\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nBorrower rent 5000'),'Email'],
  ['application/vnd.ms-outlook',new Uint8Array(CFB.write(cfb,{type:'buffer'})),'Outlook'],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',new Uint8Array(await workbook.xlsx.writeBuffer()),'Income!B2'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document',zipSync({'[Content_Types].xml':strToU8('<Types/>'),'word/document.xml':strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Borrower rent 5000</w:t></w:r></w:p></w:body></w:document>')}),'paragraph'],
 ];
 for(const [type,bytes,location] of cases){
  const inventory=await reader.inspect(bytes,'d',hash(bytes),type);assert(inventory.pageCount>=1);
  const hits=await reader.search(bytes,'d',hash(bytes),'5000',[1],type);assert.equal(hits.kind,'search');assert(hits.pages.length);
  const evidence=await reader.read(bytes,'d',hash(bytes),[1],'text',type);assert.match(evidence.pages[0].text,/5000/);assert(evidence.pages[0].text.includes(location));assert(evidence.pages[0].location);
 }
});
test('PDF late-page search and selective image/OCR inspect only requested pages',async()=>{
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
 for(let i=1;i<=32;i++)pdf.addPage().drawText(i===31?'Monthly rent 5000':`Page ${i}`,{font,size:20,x:40,y:700});
 const bytes=await pdf.save(),sha=hash(bytes);
 const found=await reader.search(bytes,'long',sha,'Monthly rent',[30,31,32]);assert.deepEqual(found.pages.map(p=>p.page),[31]);
 const page=await reader.read(bytes,'long',sha,[31],'text');assert.equal(page.pages.length,1);assert.match(page.pages[0].text,/5000/);
 const png=await sharp(Buffer.from('<svg width="800" height="200"><rect width="800" height="200" fill="white"/><text x="30" y="110" font-family="Arial" font-size="48" fill="black">Monthly rent 5000</text></svg>')).png().toBuffer();
 const scan=await PDFDocument.create(),image=await scan.embedPng(png);scan.addPage([800,200]).drawImage(image,{x:0,y:0,width:800,height:200});
 const scanBytes=await scan.save(),scanHash=hash(scanBytes);
 const ocr=await reader.read(scanBytes,'scan',scanHash,[1],'ocr');assert.equal(ocr.kind,'ocr');assert.match(ocr.pages[0].text,/5000/);
 await assert.rejects(reader.read(bytes,'long',sha,[33],'text'));
 assert.throws(()=>reader.inspect(bytes,'long','0'.repeat(64)),/changed evidence/);
});
