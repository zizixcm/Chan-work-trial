import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {validateFile} from '../lib/validation';
import {DocumentEvidenceTools} from '../lib/preparation/evidence-tools';

test('PDF upload accepts no-password encrypted evidence without rewriting it',async()=>{
 const bytes=await readFile(new URL('./fixtures/pdf-validation/permissions-only.pdf',import.meta.url));
 const hash=()=>createHash('sha256').update(bytes).digest('hex'),before=hash();
 assert.equal(await validateFile('bank.pdf',bytes),'application/pdf');
 const page=await new DocumentEvidenceTools().read(bytes,'bank',before,[1],'text');
 assert.match(page.pages[0].text,/Synthetic statement/);
 assert.equal(hash(),before);
});

test('PDF upload still rejects a password-required encrypted document',async()=>{
 const bytes=await readFile(new URL('./fixtures/pdf-validation/password-required.pdf',import.meta.url));
 await assert.rejects(validateFile('locked.pdf',bytes),/password-protected/);
});
