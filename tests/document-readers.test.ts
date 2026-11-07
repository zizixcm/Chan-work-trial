import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import ExcelJS from 'exceljs';
import sharp from 'sharp';
import {prepareDocument} from '../lib/analysis/prepare-document';
import {buildVerifyTask} from '../lib/analysis/verify';
import {supportsAnalysis} from '../lib/analysis/formats';
const doc=(bytes:Uint8Array,contentType:string)=>({id:'source',sha256:createHash('sha256').update(bytes).digest('hex'),contentType});
const read=(bytes:Uint8Array,type:string)=>prepareDocument(doc(bytes,type),bytes,new AbortController().signal);
const png=()=>sharp(Buffer.from('<svg width="1200" height="240"><rect width="100%" height="100%" fill="white"/><text x="40" y="95" font-size="48" fill="black">Property: Demo Plaza</text><text x="40" y="175" font-size="48" fill="black">Monthly rent: 5000 dollars</text></svg>')).png().toBuffer();
test('PDF native text preserves page locations and validated citations',async()=>{
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);pdf.addPage().drawText('Demo Plaza rent 5000',{font});
 const output=await read(await pdf.save(),'application/pdf');
 assert(output.records.flat().some(v=>v.includes('Demo Plaza')));assert.match(output.locations![0],/Page 1/);
 const task=buildVerifyTask([output],{id:'r',title:'Rent',subject:'Demo',period:'Current',criteria:[{id:'c',description:'Identify property'}]});
 assert(JSON.parse(task.prompt).evidence.documents[0].records[0].location);
 const raw={schemaVersion:'verify.v1',requirementId:'r',assessment:'appears_complete',checks:[{criterionId:'c',state:'met',reason:'Named',evidence:[{documentId:'source',record:1,column:1,quote:output.records[0][0]}]}],missingEvidence:[],conflicts:[],limitations:[]};
 assert.equal(task.validate(raw).assessment,'appears_complete');
 assert.match(task.validate(raw).checks[0].evidence[0].sourceLocation!,/Page 1/);
 assert.throws(()=>task.validate({...raw,checks:[{...raw.checks[0],evidence:[{...raw.checks[0].evidence[0],quote:'invented'}]}]}));
});
test('XLSX reads hidden sheets, preserves cell addresses, flags formulas rather than executing',async()=>{
 const book=new ExcelJS.Workbook();book.addWorksheet('Rent').getCell('B2').value='Demo Plaza';
 const hidden=book.addWorksheet('Details',{state:'hidden'});hidden.getCell('C4').value={formula:'1+1',result:2};
 const output=await read(new Uint8Array(await book.xlsx.writeBuffer()),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
 assert(output.locations?.includes('Sheet Rent!B2'));assert(output.locations?.includes('Sheet Details!C4'));
 assert(output.limitations?.some(v=>v.includes('not recalculated')));
});
test('PNG, JPEG, WebP and scanned PDF use local OCR with original source locations',async()=>{
 const image=await png();
 for(const format of ['png','jpeg','webp'] as const){
  const bytes=await sharp(image).toFormat(format).toBuffer();const output=await read(bytes,'image/'+format);
  assert.match(output.records.flat().join(' '),/Demo Plaza/i);assert.match(output.locations![0],/OCR line/);
 }
 const pdf=await PDFDocument.create(),embedded=await pdf.embedPng(image);pdf.addPage([600,120]).drawImage(embedded,{width:600,height:120});
 const scan=await read(await pdf.save(),'application/pdf');assert.match(scan.records.flat().join(' '),/5000/);assert.match(scan.locations![0],/Page 1, OCR/);
});
test('blank image, oversized PDF, damaged file, bad hash, unsupported format and cancellation fail conservatively',async()=>{
 const blank=await sharp({create:{width:200,height:100,channels:3,background:'white'}}).png().toBuffer();
 const output=await read(blank,'image/png');assert(output.limitations?.length);assert.equal(output.records.length,0);
 const pdf=await PDFDocument.create();for(let i=0;i<13;i++)pdf.addPage();await assert.rejects(read(await pdf.save(),'application/pdf'));
 const bytes=Buffer.from('invalid');await assert.rejects(read(bytes,'application/pdf'));
 await assert.rejects(prepareDocument({...doc(bytes,'image/png'),sha256:'0'.repeat(64)},bytes,new AbortController().signal));
 await assert.rejects(read(bytes,'application/zip'));assert.equal(supportsAnalysis('application/zip'),false);
 await assert.rejects(prepareDocument(doc(blank,'image/png'),blank,AbortSignal.abort()));
 const controller=new AbortController();const pending=prepareDocument({...doc(blank,'image/png'),id:'uncached-cancellation'},blank,controller.signal);controller.abort();await assert.rejects(pending);
});

test('Word paragraphs including headers, UTF-8 text, and EML headers/body/attachments are readable',async()=>{
 const {zipSync,strToU8}=await import('fflate');
 const docx=zipSync({'[Content_Types].xml':strToU8('<Types/>'),'word/document.xml':strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Demo &amp; Plaza</w:t></w:r></w:p></w:body></w:document>'),'word/header1.xml':strToU8('<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>November 2026</w:t></w:r></w:p></w:hdr>')});
 const word=await read(docx,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
 assert(word.records.flat().includes('Demo & Plaza'));assert(word.locations?.some(l=>l.includes('header1.xml')));
 const text=await read(Buffer.from('Property: Demo Plaza\nRent: 5000\n'),'text/plain');assert.deepEqual(text.locations,['Line 1','Line 2']);
 const email=Buffer.from('From: owner@example.test\r\nTo: lender@example.test\r\nSubject: Rent evidence\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="demo"\r\n\r\n--demo\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nDemo Plaza rent 5000\r\n--demo\r\nContent-Type: text/plain; name="extra.txt"\r\nContent-Disposition: attachment; filename="extra.txt"\r\nContent-Transfer-Encoding: base64\r\n\r\nU2VjcmV0IGF0dGFjaG1lbnQ=\r\n--demo--\r\n');
 const eml=await read(email,'message/rfc822');assert(eml.records.flat().some(v=>v.includes('Demo Plaza')));assert(eml.limitations?.some(v=>v.includes('attachments not analyzed')));assert(!eml.records.flat().some(v=>v.includes('Secret attachment')));
 const html=await read(Buffer.from('From: owner@example.test\nSubject: HTML\nContent-Type: text/html; charset=utf-8\n\n<p>Demo &amp; Plaza</p><img src="https://invalid.example/tracker">'),'message/rfc822');assert(html.records.flat().some(v=>v.includes('Demo & Plaza')));
 await assert.rejects(read(Buffer.from('not an email'),'message/rfc822'));
 await assert.rejects(read(Buffer.from([0,255,1]),'text/plain'));
 const malformed=zipSync({'[Content_Types].xml':strToU8('<Types/>'),'word/document.xml':strToU8('<!DOCTYPE x [<!ENTITY evil SYSTEM "file:///etc/passwd">]><x>&evil;</x>')});await assert.rejects(read(malformed,'application/vnd.openxmlformats-officedocument.wordprocessingml.document'));
});
