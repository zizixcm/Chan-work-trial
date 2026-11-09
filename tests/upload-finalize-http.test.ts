import assert from 'node:assert/strict';
import test from 'node:test';
import {finalizeUpload} from '../lib/jobs/upload-finalization';

test('manual upload HTTP commands default to processing for clients omitting the flag',async()=>{
 const calls:Array<[string,boolean]>=[];
 const service={async finalize(id:string,processing:boolean){calls.push([id,processing]);return {id};}};
 for(const flag of [undefined,true,false]){
  const request=new Request('http://localhost/api/upload-batches',{method:'POST',body:JSON.stringify({action:'finalize',id:'batch',requestProcessing:flag})});
  assert.deepEqual(await finalizeUpload(service,await request.json()),{id:'batch'});
 }
 assert.deepEqual(calls,[['batch',true],['batch',true],['batch',false]]);
});

test('malformed processing flags and invalid keys cannot finalize an upload',()=>{
 let called=false;const service={async finalize(){called=true;}};
 for(const requestProcessing of [null,'true','false',0,1,{},[]])assert.throws(()=>finalizeUpload(service,{id:'batch',requestProcessing}),/Invalid processing request/);
 assert.throws(()=>finalizeUpload(service,{}),/request key/);
 assert.equal(called,false);
});
