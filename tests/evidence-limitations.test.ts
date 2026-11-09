import {test} from 'node:test';
import assert from 'node:assert/strict';
import {unresolvedEvidenceLimitations} from '../lib/preparation/evidence-limitations';
import type {PageObservation} from '../lib/preparation/actions';
const observation=(overrides:Partial<PageObservation>):PageObservation=>({id:'o',documentId:'d',sha256:'hash',kind:'text',pageCount:1,pages:[{page:1,text:'Evidence'}],limitations:['Text does not authenticate signatures.'],...overrides});
test('reader scope cannot disappear; informational notices do not block',()=>{
 assert.deepEqual(unresolvedEvidenceLimitations([observation({})]),[]);
 assert.match(unresolvedEvidenceLimitations([observation({coverageIssues:['Unread email attachment']})])[0],/Unread email attachment/);
});
test('selective visual inspection resolves OCR uncertainty only on the same version and page',()=>{
 const weak=observation({kind:'ocr',pages:[{page:1,text:'Unreliable',confidence:30}]});
 assert.equal(unresolvedEvidenceLimitations([weak]).length,1);
 assert.equal(unresolvedEvidenceLimitations([weak,observation({kind:'image',sha256:'other'})]).length,1);
 assert.equal(unresolvedEvidenceLimitations([weak,observation({kind:'image'})]).length,0);
});
test('failed reads preserve uncertainty until usable evidence is available',()=>{
 const failed=observation({kind:'unavailable',pages:[]});
 assert.equal(unresolvedEvidenceLimitations([failed]).length,1);
 assert.equal(unresolvedEvidenceLimitations([failed,observation({kind:'inventory'})]).length,1);
 assert.equal(unresolvedEvidenceLimitations([failed,observation({})]).length,0);
});
