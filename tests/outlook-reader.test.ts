import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as CFB from 'cfb';
import {prepareDocument} from '../lib/analysis/prepare-document';
import {validateFile} from '../lib/validation';
import {supportsAnalysis} from '../lib/analysis/formats';

function fixture({html=false,attachment=false,rtf=false,messageClass='IPM.Note'}={}){
 const container=CFB.utils.cfb_new();
 const put=(name:string,value:Uint8Array)=>CFB.utils.cfb_add(container,name,Buffer.from(value));
 const text=(property:string,value:string)=>put('__substg1.0_'+property,Buffer.from(value+'\0','utf16le'));
 put('__properties_version1.0',Buffer.alloc(32));text('001A001F',messageClass);text('0037001F','Demo rent evidence');text('0C1A001F','Owner');text('0C1F001F','owner@example.test');
 text('007D001F','Date: Sat, 7 Nov 2026 12:00:00 -0800\r\nMessage-ID: <synthetic@example.test>');
 if(rtf)put('__substg1.0_10090102',Buffer.from('synthetic unsupported RTF'));
 else if(html)put('__substg1.0_10130102',Buffer.from('<p>Demo Plaza &amp; monthly rent 5000</p><img src="https://invalid.example/tracker">'));
 else text('1000001F','Property: Demo Plaza\r\nMonthly rent: 5000');
 if(attachment){put('__attach_version1.0_#00000000/__properties_version1.0',Buffer.alloc(8));put('__attach_version1.0_#00000000/__substg1.0_3707001F',Buffer.from('extra.txt\0','utf16le'));put('__attach_version1.0_#00000000/__substg1.0_37010102',Buffer.from('UNREVIEWED ATTACHMENT'));}
 return new Uint8Array(CFB.write(container,{type:'buffer'}));
}
const read=(bytes:Uint8Array)=>prepareDocument({id:'outlook',sha256:createHash('sha256').update(bytes).digest('hex'),contentType:'application/vnd.ms-outlook'},bytes,new AbortController().signal);
test('MSG upload validates and extracts Unicode headers/plain body with source locations',async()=>{
 const bytes=fixture();assert.equal(await validateFile('message.msg',bytes),'application/vnd.ms-outlook');assert(supportsAnalysis('application/vnd.ms-outlook'));
 const result=await read(bytes);assert(result.records.flat().includes('Property: Demo Plaza'));assert(result.records.flat().includes('owner@example.test'));assert(result.locations?.includes('Outlook body line 2'));assert.deepEqual(result.limitations,[]);
});
test('MSG HTML is text-only and attachment contents are not silently treated as reviewed',async()=>{
 const result=await read(fixture({html:true,attachment:true}));assert(result.records.flat().some(v=>v.includes('Demo Plaza & monthly rent 5000')));assert(!result.records.flat().some(v=>v.includes('UNREVIEWED ATTACHMENT')));assert(result.limitations?.some(v=>v.includes('attachments not analyzed')));
});
test('MSG RTF-only evidence remains unknown; damaged files and non-email containers are rejected',async()=>{
 const result=await read(fixture({rtf:true}));assert(result.limitations?.some(v=>v.includes('RTF')));
 await assert.rejects(validateFile('broken.msg',Buffer.from('not msg')));
 await assert.rejects(validateFile('renamed.msg',fixture({messageClass:'IPM.Contact'})));
 await assert.rejects(read(fixture().subarray(0,512)));
});
