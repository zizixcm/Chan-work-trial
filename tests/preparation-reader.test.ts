import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFixture } from './fixtures/preparation-pilot/fixture';
import { PilotPdfTools } from '../lib/preparation/pdf-tools';
import { createHash } from 'node:crypto';
import { DocumentEvidenceTools } from '../lib/preparation/evidence-tools';
import { MAX_EVIDENCE_BYTES } from '../lib/preparation/evidence-limits';
const fixture=buildFixture();
test('isolated PDF reader accepts a valid PDF above 20 MiB and preserves the 25 MiB bound',async()=>{
 const f=await fixture,reader=new DocumentEvidenceTools();
 // Whitespace padding preserves the PDF while exercising the real byte boundary.
 const bytes=Buffer.alloc(21*1024*1024,32);Buffer.from(f.bytes.get('d17')!).copy(bytes);
 const hash=createHash('sha256').update(bytes).digest('hex');
 const selected=await reader.read(bytes,'large',hash,[24],'text');
 assert.equal(selected.pageCount,48);assert.deepEqual(selected.pages.map(p=>p.page),[24]);
 assert.match(selected.pages[0].text,/July 14, 2026/);
 const oversized=Buffer.alloc(MAX_EVIDENCE_BYTES+1);
 assert.throws(()=>reader.inspect(oversized,'large','unused'),/Unsupported or changed evidence/);
 await assert.rejects(new PilotPdfTools().inspect(oversized,'large','unused'),/Invalid evidence bytes/);
});
test('actual PDF reader selects pages beyond page 12 and exposes scan images without inventing OCR',async()=>{
 const f=await fixture,tools=new PilotPdfTools();
 const source=(id:string)=>f.checkpoints[3].sources.find(s=>s.id===id)!;
 const report=await tools.inspect(f.bytes.get('d17')!,'d17',source('d17').sha256);assert.equal(report.pageCount,48);assert.equal(report.pages.length,0);
 const selected=await tools.read(f.bytes.get('d17')!,'d17',source('d17').sha256,[24,25],'text');assert.deepEqual(selected.pages.map(p=>p.page),[24,25]);assert.match(selected.pages[0].text,/July 14, 2026/);assert.match(selected.pages[1].text,/Cedar Test Bank/);
 const scan=await tools.read(f.bytes.get('d04')!,'d04',source('d04').sha256,[1],'text');assert.equal(scan.pages[0].text,'');assert.ok(scan.limitations.length);
 const image=await tools.read(f.bytes.get('d04')!,'d04',source('d04').sha256,[1],'image');assert.ok(Buffer.from(image.pages[0].imageBase64!,'base64').length>1000);
 await assert.rejects(tools.read(f.bytes.get('d17')!,'d17',source('d17').sha256,[49],'text'),/outside/);
 await assert.rejects(tools.inspect(f.bytes.get('d17')!,'d17','0'.repeat(64)),/Invalid evidence/);
});
