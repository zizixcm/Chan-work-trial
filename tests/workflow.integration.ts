/** Behavioral acceptance suite: real PostgreSQL/worker/validators, synthetic model.
 * Isolated schema and blobs. No paid calls or shared fixture mutations. */
import '../scripts/env';
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pool} from '../lib/db';
import type {Access} from '../lib/authorization';
import {UploadBatchService} from '../lib/jobs/batches';
import {PostgresRepository} from '../lib/postgres';
import {PostgresJobRepository} from '../lib/jobs/postgres';
import {AnalysisService} from '../lib/jobs/service';
import {snapshot,transaction} from '../lib/jobs/core';
import {LocalBlobStorage} from '../lib/storage/local';
import {createAnalysisPreparer} from '../lib/backend/prepare-analysis';
import {runJob} from '../lib/backend/job-runner';
import {DEFAULT_BUDGET,type ProviderTransport} from '../lib/backend/provider-executor';
import type {JobLease} from '../lib/backend/contracts';
import type {AnalysisSnapshot} from '../lib/backend/prepare-analysis';

async function main(){
 const schema='workflow_'+randomUUID().replaceAll('-',''),original=process.env.DATABASE_URL!;
 const admin=new Pool({connectionString:original});const url=new URL(original);url.searchParams.set('options','-c search_path='+schema+',public');
 process.env.DATABASE_URL=url.toString();process.env.OPENROUTER_API_KEY='synthetic-not-sent';process.env.OPENROUTER_MODEL=DEFAULT_BUDGET.model;
 process.env.ANALYSIS_DEBUG_CAPTURE='0';
 // This suite exercises convergence, not admission limits (covered in jobs suite).
 process.env.AI_REQUESTS_PER_MINUTE='10000';process.env.AI_DAILY_BUDGET_USD='100';process.env.AI_APPLICATION_DAILY_BUDGET_USD='100';
 const root=await mkdtemp(path.join(os.tmpdir(),'workflow-'));process.env.PORTAL_DATA_DIR=root;
 const db=new Pool({connectionString:url.toString()}),storage=new LocalBlobStorage();
 const access:Access={applicationId:'a',userId:'u',role:'borrower',displayName:'Fixture'};
 const batches=new UploadBatchService(access,db),service=new AnalysisService(access,db),repo=new PostgresJobRepository(db,storage);
 const calls:Array<{task:string;documents:number}>=[];
 let failMatch=false,duringCall:(()=>Promise<void>)|undefined;
 const transport:ProviderTransport={generate:async args=>{
   const parsed=JSON.parse(args.prompt),scope=parsed.evidence||parsed,matching=!parsed.evidence;
   calls.push({task:matching?'match':'verify',documents:scope.documents.length});
   if(duringCall){const effect=duringCall;duringCall=undefined;await effect();}
   if(matching&&failMatch){failMatch=false;return {text:'not JSON'};}
   const doc=scope.documents[0];
   const evidence=doc?[{documentId:doc.id,record:2,column:1,quote:doc.records[1].cells[0].value}]:[];
   const checks=(r:any)=>r.criteria.map((c:any)=>({criterionId:c.id,state:doc?'met':'unknown',reason:'Synthetic fixture',evidence}));
   const value=matching?{schemaVersion:'match.v1',classification:{kind:'rent_roll',reason:'Fixture',evidence},requirements:scope.requirements.map((r:any)=>({requirementId:r.id,relevance:{state:'relevant',reason:'Fixture',evidence},checks:checks(r)}))}:
     {schemaVersion:'verify.v1',requirementId:scope.requirements[0].id,assessment:doc&&!parsed.preparationLimitations.length?'appears_complete':'unknown',checks:checks(scope.requirements[0]),missingEvidence:[],conflicts:[],limitations:parsed.preparationLimitations};
   return {text:JSON.stringify(value),usage:{inputTokens:100,outputTokens:100}};
 }};
 const run=(job:JobLease<AnalysisSnapshot>)=>runJob(job,{repository:repo,prepare:createAnalysisPreparer(repo.readEvidence.bind(repo)),transport,budget:DEFAULT_BUDGET},new AbortController().signal);
 async function drain(){for(let i=0;i<40;i++){await repo.recover();const job=await repo.claim('interactive','test')||await repo.claim('shared','test');if(!job)return;await run(job);}throw Error('Workflow failed to converge');}
 const spec=(id:string)=>{const bytes=Buffer.from(`Property,Tenant\nDemo,${id}\n`);return {id:randomUUID(),name:id+'.csv',sha256:createHash('sha256').update(bytes).digest('hex'),requirementId:'r',bytes};};
 async function save(batch:string,file:ReturnType<typeof spec>){
   await storage.put(file.id,file.bytes);
   await new PostgresRepository(access,{batchId:batch,memberId:file.id}).insertMany({id:file.id,application_id:'a',original_name:file.name,storage_key:file.id,content_type:'text/csv',size_bytes:file.bytes.length,sha256:file.sha256,uploaded_by:'Fixture',created_at:new Date().toISOString()},['r']);
 }
 try{
  await admin.query(`CREATE SCHEMA ${schema}`);
  for(const file of (await readdir('migrations/postgres')).filter(f=>f.endsWith('.sql')).sort())await db.query(await readFile('migrations/postgres/'+file,'utf8'));
  await db.query(`INSERT INTO "user"(id,name,email,"emailVerified") VALUES('u','Fixture','workflow@example.test',true),('other','Other','other@example.test',true)`);
  await db.query("INSERT INTO applications(id,borrower_name,property_name,address,transaction_type,requested_amount,loi_reference,created_at) VALUES('a','Fixture','Demo','Fixture','Refinance',1,'LOI',now())");
  await db.query("INSERT INTO application_memberships(application_id,user_id,role) VALUES('a','u','borrower'),('a','other','borrower')");
  await db.query("INSERT INTO requirements(id,application_id,title,category,purpose,period,owner,applicability,sort_order,criteria) VALUES('r','a','Rent roll','Property','Evidence','Current','Borrower','Required',1,ARRAY['Identify property'])");
  await service.setPreference(true,'0');
  const first=spec('first'),second=spec('second');
  await batches.create('batch',[first,second]);
  await batches.create('batch',[first,second]);
  await assert.rejects(batches.create('batch',[first]),{status:409});
  await assert.rejects(new UploadBatchService({...access,userId:'other'},db).status('batch'),{status:404});
  await save('batch',first);
  await service.request('verify_requirement.v1','r',randomUUID());
  await drain();
  assert.equal(calls.filter(c=>c.task==='match').length,1,'F09/F18: held interactive assessment cannot starve background matching');
  assert.equal(calls.filter(c=>c.task==='verify').length,0,'F09: open batch holds assessment after first matching job');
  await save('batch',second);await batches.finalize('batch');await drain();
  assert.deepEqual(calls.filter(c=>c.task==='verify').map(c=>c.documents),[2],'F09: one aggregate assessment uses both files');
  const current=()=>service.status().then(s=>s.jobs.find(j=>j.task==='verify_requirement.v1'&&j.targetId==='r'&&j.state==='succeeded'&&j.freshness==='current'));
  assert.equal((await current())?.result.fulfillment,'fulfilled');
  const before=calls.length;await drain();assert.equal(calls.length,before,'unchanged snapshots do not repeat provider calls');
  await batches.attachExisting({batchId:'batch',memberId:first.id},first.id,first.sha256,first.name,['r']);
  await assert.rejects(batches.attachExisting({batchId:'batch',memberId:first.id},second.id,second.sha256,second.name,['r']),{status:409});

  const stalled=spec('stalled');await batches.create('stalled-batch',[stalled]);await save('stalled-batch',stalled);await batches.finalize('stalled-batch');
  await db.query("UPDATE analysis_jobs SET state='retry_wait',created_at=now()-interval '6 minutes',available_at=now()+interval '1 hour' WHERE document_id=$1 AND task='match_document.v1'",[stalled.id]);
  await drain();assert.equal((await current())?.result.fulfillment,'unable_to_determine','F09: bounded wait releases an explicitly incomplete assessment');
  assert((await current())?.result.limitations.some((s:string)=>s.includes('matching is still pending')));
  await db.query("UPDATE analysis_jobs SET available_at=now() WHERE document_id=$1 AND task='match_document.v1'",[stalled.id]);
  await drain();assert.equal((await current())?.result.fulfillment,'fulfilled','F09: late matching result triggers final current assessment');

  // A crash/closed browser leaves durable members; expiration releases a truthful partial check.
  const third=spec('third'),missing=spec('missing');await batches.create('abandoned',[third,missing]);await save('abandoned',third);
  await db.query("UPDATE upload_batches SET deadline_at=now()-interval '1 second' WHERE id='abandoned'");await drain();
  assert.equal((await batches.status('abandoned')).state,'expired');
  assert.equal((await current())?.result.fulfillment,'unable_to_determine','F09: unsaved member prevents fulfilled');
  assert((await current())?.result.limitations.some((s:string)=>s.includes('not saved')));
  await batches.create('resumed',[missing]);await save('resumed',missing);await batches.finalize('resumed');await drain();
  assert((await batches.status('abandoned')).members.every((m:{state:string})=>m.state==='saved'),'reselection resolves matching abandoned members');
  assert.equal((await current())?.result.fulfillment,'fulfilled','late member clears limitation and refreshes');

  // A failed matcher cannot strand evidence that the human explicitly linked.
  const bad=spec('bad-match');await batches.create('failed-match',[bad]);await save('failed-match',bad);await batches.finalize('failed-match');
  failMatch=true;const beforeFailure=calls.length;await drain();
  assert.equal(calls.slice(beforeFailure).filter(c=>c.task==='match').length,1,'F10: invalid output is not retried forever');
  assert(await current(),'F10: failed match still schedules aggregate human-linked evidence check');

  // Stale queued work is disposed before any provider call; mutation marker owns replacement.
  await db.query("UPDATE requirements SET purpose='Changed definition' WHERE id='r'");
  assert.equal(await current(),undefined,'F12: successful old assessment becomes visibly stale');
  await repo.recover();
  const stale=await repo.claim('shared','stale');assert(stale);
  await db.query("UPDATE requirements SET period='Next period' WHERE id='r'");
  const beforeStale=calls.length;await run(stale);assert.equal(calls.length,beforeStale,'E14: stale claimed job skips provider');
  assert.equal((await service.get(stale.id)).state,'stale');await drain();assert(await current(),'F12: definition changes converge without manual click');

  // Mid-call mutation discards the response, then change-driven work converges.
  const req=await service.request('verify_requirement.v1','r',randomUUID(),undefined,(await current())!.id);
  const mid=await repo.claim('interactive','mid-call');assert(mid);assert.equal(mid.id,req.id);
  duringCall=async()=>{await db.query("UPDATE requirements SET purpose='Changed during provider call' WHERE id='r'");};
  await run(mid);assert.equal((await service.get(mid.id)).state,'stale','F01: response cannot publish against new definition');
  await drain();assert(await current());
  await db.query("INSERT INTO requirements(id,application_id,title,category,purpose,period,owner,applicability,sort_order,criteria) VALUES('r2','a','Additional schedule','Property','Evidence','Current','Borrower','Required',2,ARRAY['Identify property'])");
  await drain();
  assert((await service.status()).jobs.some(j=>j.targetId==='r2'&&j.state==='succeeded'&&j.freshness==='current'),'F12: new requirement considers existing uploads');
  await db.query("UPDATE requirements SET lifecycle='superseded',superseded_at=now() WHERE id='r2'");await drain();
  assert(!(await service.status()).jobs.some(j=>j.targetId==='r2'&&j.freshness==='current'),'F12: retired requirement has no current assessment');
  assert(await current(),'retired human links do not break remaining matching commits');
  const replacement=spec('replacement');await storage.put(replacement.id,replacement.bytes);
  await db.query(`INSERT INTO documents(id,application_id,original_name,storage_key,content_type,size_bytes,sha256,uploaded_by,created_at,uploaded_by_user_id,series_id,version_number,replaces_document_id)
    SELECT $1,application_id,$2,$1,content_type,$3,$4,uploaded_by,now(),uploaded_by_user_id,series_id,version_number+1,id FROM documents WHERE id=$5`,[replacement.id,replacement.name,replacement.bytes.length,replacement.sha256,first.id]);
  assert.equal(await current(),undefined,'F13: replacement immediately invalidates old source snapshot');
  await drain();
  const replacementSnapshot=await transaction(db,client=>snapshot(client,'a','verify_requirement.v1','r'));
  assert(!replacementSnapshot.documents.some(d=>d.id===first.id),'F13: predecessor is not current evidence');
  assert(replacementSnapshot.documents.some(d=>d.id===replacement.id));
  assert.equal((await current())?.result.fulfillment,'unable_to_determine','F13: unresolved old links require confirmation');
  // Removing the last source invalidates completion and cannot invent support.
  for(const row of (await db.query("SELECT document_id FROM requirement_documents WHERE requirement_id='r' AND unlinked_at IS NULL")).rows){
    const revision=(await new PostgresRepository(access).requirement('r'))!.evidence_revision!;
    await new PostgresRepository(access).setDocumentRequirement(row.document_id,'r',false,revision);
  }
  await drain();assert.notEqual((await current())?.result.fulfillment,'fulfilled','F02: removed evidence cannot preserve fulfillment');
  const pref=(await service.status()).preference;await service.setPreference(false,pref.epoch);
  await db.query("UPDATE requirements SET period='Consent off change' WHERE id='r'");const offCalls=calls.length;await drain();assert.equal(calls.length,offCalls,'F03: off blocks automatic refresh');
  await transaction(db,client=>snapshot(client,'a','verify_requirement.v1','r')); // snapshot remains readable without dispatch
  console.log(JSON.stringify({ok:true,syntheticCalls:calls.length,scenarios:['E14 stale pickup','F01 mid-call change','F03 consent','F09 batch barrier','F09 abandoned batch and late arrival','F10 failed matching','F12 definition refresh','F02 evidence removal','manifest idempotency and ownership','derived fulfillment']}));
 }finally{await pool().end();await db.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();await rm(root,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e instanceof Error?e.stack:'Workflow suite failed');process.exitCode=1;});
