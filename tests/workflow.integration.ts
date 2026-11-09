import {workflowMetrics} from '../lib/analysis-metrics/data';
import {captureDisagreement} from '../lib/evals/feedback';
import {PDFDocument,StandardFonts} from 'pdf-lib';
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
 const calls:Array<{task:string;documents:number;requirementId?:string}>=[];
 let failMatch=false,ambiguousMatch=false,duringCall:(()=>Promise<void>)|undefined;
 const transport:ProviderTransport={generate:async args=>{
   const parsed=JSON.parse(args.prompt),scope=parsed.evidence||parsed,matching=!parsed.evidence;
   calls.push({task:matching?'match':'verify',documents:scope.documents.length,requirementId:matching?undefined:scope.requirements[0].id});
   if(duringCall){const effect=duringCall;duringCall=undefined;await effect();}
   if(matching&&failMatch){failMatch=false;return {text:'not JSON'};}
   const doc=scope.documents[0];
   const evidence=doc?[{documentId:doc.id,record:2,column:1,quote:doc.records[1].cells[0].value}]:[];
   const checks=(r:any)=>r.criteria.map((c:any)=>({criterionId:c.id,state:doc?'met':'unknown',reason:'Synthetic fixture',evidence}));
   const value=matching?{schemaVersion:'match.v1',classification:{kind:'rent_roll',reason:'Fixture',evidence},requirements:scope.requirements.map((r:any)=>({requirementId:r.id,relevance:{state:r.id==='untouched'?'not_relevant':ambiguousMatch?'ambiguous':'relevant',reason:'Fixture',evidence},checks:checks(r)}))}:
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
  assert.equal((await service.status()).preference.enabled,false,'new uploads do not require personal opt-in');
  const legacy=spec('pre-existing');await storage.put(legacy.id,legacy.bytes);
  await db.query("INSERT INTO documents(id,application_id,original_name,storage_key,content_type,size_bytes,sha256,uploaded_by,created_at,uploaded_by_user_id) VALUES($1,'a',$2,$1,'text/csv',$3,$4,'Fixture',now(),'u')",[legacy.id,legacy.name,legacy.bytes.length,legacy.sha256]);
  await drain();assert.equal(calls.length,0,'deployment/invalidation alone does not dispatch pre-existing files');
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
  const completedBatch=await batches.status('batch');
  assert.equal(completedBatch.processing.stage,'complete');
  assert.equal(completedBatch.processing.documentsSettled,true);
  assert.deepEqual(completedBatch.processing.requirements.map((r:{id:string})=>r.id),['r']);
  assert(completedBatch.members.every((m:{validity:{state:string}})=>m.validity.state==='passed'),'readability comes from durable extraction phases');

  const feedback={requestId:'feedback-one',jobId:(await current())!.id,expected:'not_fulfilled',reason:'Synthetic human correction pending adjudication'};
  const candidate=await captureDisagreement(access,feedback,db,path.join(root,'evals'));
  assert.equal(candidate.status,'pending_review');
  assert.deepEqual(await captureDisagreement(access,feedback,db,path.join(root,'evals')),candidate,'feedback replay is idempotent');
  await assert.rejects(captureDisagreement(access,{...feedback,reason:'Different correction'},db,path.join(root,'evals')),{status:409});
  await assert.rejects(captureDisagreement({...access,userId:'other'},feedback,db,path.join(root,'evals')),{status:404});
  const captured=JSON.parse(await readFile(path.join(root,'evals',candidate.id),'utf8'));
  assert(captured.output.checks.length);assert.equal(captured.expected,'not_fulfilled');assert(captured.input.documents.length);
  assert.equal((await current())?.result.fulfillment,'fulfilled','feedback does not rewrite authoritative assessment');
  const metrics=await workflowMetrics('u',{days:7},db);
  assert(metrics.summary.preparation.count>0,'worker records durable preparation phases');
  assert(metrics.summary.modelAndValidation.count>0,'worker records model/validation phases');
  assert(metrics.summary.knownCostUsd>0);assert(metrics.jobs.some(j=>j.id===(candidate&&feedback.jobId)));
  assert(!JSON.stringify(metrics).includes('Synthetic fixture'),'metrics omit source/reason text');
  assert.equal((await workflowMetrics('not-a-member',{days:7},db)).jobs.length,0,'metrics enforce membership');
  assert.equal((await workflowMetrics('u',{days:7,applicationId:'foreign'},db)).jobs.length,0,'metrics cannot cross application filter');
  const before=calls.length;await drain();assert.equal(calls.length,before,'unchanged snapshots do not repeat provider calls');
  await batches.attachExisting({batchId:'batch',memberId:first.id},first.id,first.sha256,first.name,['r']);
  await assert.rejects(batches.attachExisting({batchId:'batch',memberId:first.id},second.id,second.sha256,second.name,['r']),{status:409});

  const stalled=spec('stalled');await batches.create('stalled-batch',[stalled]);await save('stalled-batch',stalled);await batches.finalize('stalled-batch');
  await db.query("UPDATE analysis_jobs SET state='retry_wait',created_at=now()-interval '6 minutes',available_at=now()+interval '1 hour' WHERE document_id=$1 AND task='match_document.v1'",[stalled.id]);
  const beforeStalled=calls.filter(c=>c.task==='verify').length;
  await drain();assert.equal(calls.filter(c=>c.task==='verify').length,beforeStalled,'completeness never overtakes unfinished matching, even after five minutes');
  const stalledStatus=await batches.status('stalled-batch');
  assert.equal(stalledStatus.processing.documentsSettled,false);
  assert.equal(stalledStatus.members[0].matching.state,'retry_wait');
  await db.query("UPDATE analysis_jobs SET available_at=now() WHERE document_id=$1 AND task='match_document.v1'",[stalled.id]);
  await drain();assert.equal((await current())?.result.fulfillment,'fulfilled','F09: late matching result triggers final current assessment');

  // A crash/closed browser leaves durable members; expiration releases a truthful partial check.
  const third=spec('third'),missing=spec('missing');await batches.create('abandoned',[third,missing]);await save('abandoned',third);
  await db.query("UPDATE upload_batches SET deadline_at=now()-interval '1 second' WHERE id='abandoned'");await drain();
  assert.equal((await batches.status('abandoned')).state,'expired');
  assert.equal((await batches.status('abandoned')).processing.needsReview,true,'finished partial processing is not sufficient evidence');
  assert.equal((await current())?.result.fulfillment,'unable_to_determine','F09: unsaved member prevents fulfilled');
  assert((await current())?.result.limitations.some((s:string)=>s.includes('not saved')));
  await batches.create('resumed',[missing]);await save('resumed',missing);await batches.finalize('resumed');await drain();
  assert((await batches.status('abandoned')).members.every((m:{state:string})=>m.state==='saved'),'reselection resolves matching abandoned members');
  assert.equal((await current())?.result.fulfillment,'fulfilled','late member clears limitation and refreshes');

  // E11/F09: an unassigned manifest must not disappear merely because it closes.
  for(const close of ['expired','finalized'] as const){
    const unsent=spec('unassigned-'+close),batch='unassigned-'+close;
    await batches.create(batch,[{...unsent,requirementId:undefined}]);
    if(close==='expired')await db.query("UPDATE upload_batches SET deadline_at=now()-interval '1 second' WHERE id=$1",[batch]);
    else await batches.finalize(batch);
    const beforeUnassigned=calls.filter(c=>c.task==='verify').length;
    await drain();
    assert.equal(calls.filter(c=>c.task==='verify').length,beforeUnassigned,'unsaved unassigned files do not recheck unchanged requirements');
    assert.equal(await current(),undefined,'unresolved intake still stales old completion');
    const unsavedStatus=await batches.status(batch);
    assert.equal(unsavedStatus.processing.requirements.length,0);
    assert.equal(unsavedStatus.processing.stage,'attention_required');
    // Recover through the normal save path, which resolves same-user/hash members.
    await batches.create(batch+'-recovery',[unsent]);await save(batch+'-recovery',unsent);
    await batches.finalize(batch+'-recovery');await drain();
    assert.equal((await batches.status(batch)).members[0].state,'saved');
    assert.equal((await current())?.result.fulfillment,'fulfilled','resolved intake restores current fulfillment');
  }

  // E21/E30: a newer clear match from another actor cannot erase ambiguity.
  const otherService=new AnalysisService({...access,userId:'other'},db);
  await otherService.setPreference(true,'0');
  await otherService.request('match_document.v1',first.id,randomUUID());
  ambiguousMatch=true;
  const ambiguous=await repo.claim('interactive','ambiguous');assert(ambiguous);await run(ambiguous);
  ambiguousMatch=false;
  const ownMatch=(await service.status()).jobs.find(j=>j.task==='match_document.v1'&&j.targetId===first.id&&j.state==='succeeded');assert(ownMatch);
  await service.request('match_document.v1',first.id,randomUUID(),undefined,ownMatch.id);
  const clear=await repo.claim('interactive','clear');assert(clear);await run(clear);
  const uncertain=await transaction(db,client=>snapshot(client,'a','verify_requirement.v1','r'));
  assert(uncertain.processingLimitations?.some(s=>s.includes('confidently assigned')),'F11: newer other-actor success cannot hide unresolved ambiguity');
  await db.query("UPDATE application_memberships SET active=false WHERE user_id='other'");
  await drain();
  assert.equal((await current())?.result.fulfillment,'fulfilled','F11: revoked actor does not keep assessment uncertain');

  // A failed matcher cannot strand evidence that the human explicitly linked.
  const bad=spec('bad-match');await batches.create('failed-match',[bad]);await save('failed-match',bad);await batches.finalize('failed-match');
  failMatch=true;const beforeFailure=calls.length;await drain();
  assert.equal(calls.slice(beforeFailure).filter(c=>c.task==='match').length,1,'F10: invalid output is not retried forever');
  assert(await current(),'F10: failed match still schedules aggregate human-linked evidence check');

  // Non-CSV upload uses the same durable scheduling and worker pipeline.
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),page=pdf.addPage();
  page.drawText('Property: Demo',{font,y:700});page.drawText('Tenant: PDF fixture',{font,y:660});
  const pdfBytes=await pdf.save(),pdfId=randomUUID();await storage.put(pdfId,pdfBytes);
  await new PostgresRepository(access).insertMany({id:pdfId,application_id:'a',original_name:'evidence.pdf',storage_key:pdfId,content_type:'application/pdf',size_bytes:pdfBytes.length,sha256:createHash('sha256').update(pdfBytes).digest('hex'),uploaded_by:'Fixture',created_at:new Date().toISOString()},['r']);
  await drain();
  assert((await service.status()).jobs.some(j=>j.targetId===pdfId&&j.task==='match_document.v1'&&j.state==='succeeded'),'PDF upload is automatically matched through real extraction');
  assert(await current(),'PDF evidence reaches aggregate assessment');

  // Stale queued work is disposed before any provider call; mutation marker owns replacement.
  await db.query("UPDATE requirements SET purpose='Changed definition' WHERE id='r'");
  assert.equal(await current(),undefined,'F12: successful old assessment becomes visibly stale');
  const outdatedMatches=await transaction(db,client=>snapshot(client,'a','verify_requirement.v1','r'));
  assert(outdatedMatches.processingLimitations?.some(s=>s.includes('confidently assigned')),'F12: old successful matches cannot resolve changed definitions');
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
  await db.query("UPDATE requirements SET period='Consent off change' WHERE id='r'");const offCalls=calls.length;await drain();assert(calls.length>offCalls,'automatic refresh ignores old disabled preference');
  await transaction(db,client=>snapshot(client,'a','verify_requirement.v1','r')); // snapshot remains readable without dispatch
  assert.equal((await db.query('SELECT count(*)::int n FROM analysis_jobs WHERE document_id=$1',[legacy.id])).rows[0].n,0,'new activity does not backfill old unrequested CSVs');
  const removable=spec('remove-running');await batches.create('remove-running',[removable]);await save('remove-running',removable);await batches.finalize('remove-running');
  const lease=await repo.claim('shared','remove-running');assert(lease);assert.equal(lease.task,'match_document.v1');
  const portal=new PostgresRepository(access),beforeRemoval=await portal.snapshot();
  await portal.removeDocument(removable.id,beforeRemoval.draft!.contentRevision);
  assert.equal(await repo.authorizePreparation(lease),false,'removal fences running borrower work');
  assert.equal(await repo.commit(lease,{model:DEFAULT_BUDGET.model,usage:{},value:{schemaVersion:'match.v1',requirements:[]}}),false,'late matcher cannot restore removed file links');
  assert(!(await portal.snapshot()).documents.some(d=>d.id===removable.id));
  const removedBatch=await batches.status('remove-running');
  assert.equal(removedBatch.members[0].matching.state,'removed');
  assert.equal(removedBatch.processing.needsReview,true);
  assert(removedBatch.processing.requirements.some(r=>r.id==='r'),'former requirement remains affected after removing this batch file');
  assert((await storage.get(removable.id)).length>0);
  await drain();
  assert.equal((await db.query("SELECT count(*)::int n FROM analysis_jobs WHERE document_id=$1 AND state IN ('queued','running','retry_wait','blocked')",[removable.id])).rows[0].n,0,'reconciler cannot resurrect removed file jobs');
  await assert.rejects(batches.attachExisting({batchId:'remove-running',memberId:removable.id},removable.id,removable.sha256,removable.name,['r']),{status:409},'old upload receipt cannot restore removed file');
  const reselected={...removable,id:randomUUID()};await batches.create('reselect-removed',[reselected]);
  assert.equal(await batches.attachExisting({batchId:'reselect-removed',memberId:reselected.id},removable.id,removable.sha256,removable.name,['r']),removable.id);
  await batches.finalize('reselect-removed');
  assert((await portal.snapshot()).documents.some(d=>d.id===removable.id),'fresh explicit reupload restores retained ID');
  assert.equal(await repo.commit(lease,{model:DEFAULT_BUDGET.model,usage:{},value:{schemaVersion:'match.v1',requirements:[]}}),false,'old model response stays fenced after explicit restore');
  await drain();
  const restoredView=await portal.snapshot();assert(restoredView.draft!.hasUnsentChanges);
  assert.equal((await db.query('SELECT count(*)::int n FROM documents WHERE id=$1',[removable.id])).rows[0].n,1,'restore does not duplicate immutable document');
  await portal.removeDocument(removable.id,restoredView.draft!.contentRevision);
  await assert.rejects(batches.attachExisting({batchId:'reselect-removed',memberId:reselected.id},removable.id,removable.sha256,removable.name,['r']),{status:409},'retry of restored upload cannot undo a later removal');

  // Bulk sequencing: a previously assessed unrelated requirement must never
  // receive a new paid check because another requirement gets uploaded files.
  await drain();
  await db.query("INSERT INTO applications(id,borrower_name,property_name,address,transaction_type,requested_amount,loi_reference,created_at) VALUES('bulk','Fixture','Demo','Fixture','Refinance',1,'LOI',now())");
  await db.query("INSERT INTO application_memberships(application_id,user_id,role) VALUES('bulk','u','borrower'),('bulk','other','borrower')");
  await db.query("INSERT INTO requirements(id,application_id,title,category,purpose,period,owner,applicability,sort_order,criteria) VALUES('changed','bulk','Rent roll','Property','Evidence','Current','Borrower','Required',1,ARRAY['Identify property']),('untouched','bulk','Unchanged request','Property','Evidence','Current','Borrower','Required',2,ARRAY['Identify property'])");
  const bulkAccess={...access,applicationId:'bulk'},bulk=new UploadBatchService(bulkAccess,db),bulkService=new AnalysisService(bulkAccess,db);
  await bulkService.request('verify_requirement.v1','untouched',randomUUID());await drain();
  const untouchedCalls=calls.filter(c=>c.requirementId==='untouched').length;
  const files=[spec('bulk-first'),spec('bulk-second')].map(f=>({...f,requirementId:'changed'}));
  await bulk.create('bulk-popup',files);
  const waiting=await bulk.status('bulk-popup');
  assert.equal(waiting.processing.stage,'uploading');assert.equal(waiting.members[0].validity.state,'waiting');
  await assert.rejects(new UploadBatchService({...bulkAccess,userId:'other'},db).status('bulk-popup'),{status:404});
  const saveBulk=async(file:typeof files[number])=>{
    await storage.put(file.id,file.bytes);
    await new PostgresRepository(bulkAccess,{batchId:'bulk-popup',memberId:file.id}).insertMany({id:file.id,application_id:'bulk',original_name:file.name,storage_key:file.id,content_type:'text/csv',size_bytes:file.bytes.length,sha256:file.sha256,uploaded_by:'Fixture',created_at:new Date().toISOString()},['changed']);
  };
  await saveBulk(files[0]);await drain();
  assert.equal(calls.filter(c=>c.requirementId==='changed').length,0,'no completeness while another file in this upload is pending');
  await saveBulk(files[1]);await bulk.finalize('bulk-popup');await drain();
  assert.equal(calls.filter(c=>c.requirementId==='changed').length,1,'one aggregate check after both files finish');
  assert.equal(calls.filter(c=>c.requirementId==='untouched').length,untouchedCalls,'unrelated previously checked requirement gets no new model call');
  const bulkDone=await bulk.status('bulk-popup');
  assert.equal(bulkDone.processing.stage,'complete');
  assert.deepEqual(bulkDone.processing.requirements.map((r:{id:string})=>r.id),['changed']);
  assert.equal(bulkDone.processing.requirements[0].documentIds.length,2);
  assert(bulkDone.members.every((m:{validity:{state:string}})=>m.validity.state==='passed'));
  // A reused duplicate is not a new file update and owns no completeness check.
  const duplicate={...files[0],id:randomUUID()};await bulk.create('bulk-duplicate',[duplicate]);
  await bulk.attachExisting({batchId:'bulk-duplicate',memberId:duplicate.id},files[0].id,duplicate.sha256,duplicate.name,['changed']);await bulk.finalize('bulk-duplicate');
  assert.equal((await bulk.status('bulk-duplicate')).processing.requirements.length,0);
  const persisted=await new UploadBatchService(bulkAccess,db).latest();
  assert.equal(persisted?.id,'bulk-duplicate','refresh restores the latest persisted batch');
  assert.equal(persisted?.members[0].validity.state,'passed');
  const persistedJob=persisted?.members[0].matching.job;
  assert.equal(persistedJob?.state,'succeeded');
  assert.equal(persistedJob?.id,bulkDone.members.find(m=>m.document_id===files[0].id)?.matching.job?.id,'duplicate reuses matching outcome');
  assert.equal(await new UploadBatchService({...bulkAccess,userId:'other'},db).latest(),null,'latest batch remains user-scoped');
  // Missing telemetry on a later attempt must not erase the prior reading.
  const priorMatch=(await bulkService.status()).jobs.find(j=>j.task==='match_document.v1'&&j.targetId===files[0].id)!;
  await bulkService.request('match_document.v1',files[0].id,randomUUID(),undefined,priorMatch.id);
  const phaseRecorder=repo.recordPhase;repo.recordPhase=async()=>{};
  const noTelemetry=await repo.claim('interactive','no-telemetry');assert(noTelemetry);await run(noTelemetry);repo.recordPhase=phaseRecorder;
  const unknown=(await bulk.status('bulk-popup')).members.find(m=>m.document_id===files[0].id)!;
  assert.equal(unknown.matching.job?.state,'succeeded');assert.equal(unknown.validity.state,'passed');
  await drain();
  const invalid={...spec('unreadable'),requirementId:'changed'};await bulk.create('bulk-unreadable',[invalid]);
  await storage.put(invalid.id,Buffer.alloc(invalid.bytes.length));
  await new PostgresRepository(bulkAccess,{batchId:'bulk-unreadable',memberId:invalid.id}).insertMany({id:invalid.id,application_id:'bulk',original_name:invalid.name,storage_key:invalid.id,content_type:'text/csv',size_bytes:invalid.bytes.length,sha256:invalid.sha256,uploaded_by:'Fixture',created_at:new Date().toISOString()},['changed']);
  await bulk.finalize('bulk-unreadable');const beforeUnreadable=calls.length;await drain();
  const unreadable=await bulk.status('bulk-unreadable');
  assert.equal(unreadable.members[0].validity.state,'failed','read/integrity failure is technical invalidity');
  assert.equal(unreadable.members[0].matching.job?.state,'failed');
  assert.equal(unreadable.processing.stage,'attention_required');
  assert.equal(unreadable.processing.needsReview,true);
  assert.equal(calls.length,beforeUnreadable,'unreadable bytes never reach provider');

  // A failure after preparation must not overwrite a successful readable check.
  const failedId=unreadable.members[0].matching.job!.id;
  await db.query(`INSERT INTO analysis_events(application_id,job_id,event,token)
    SELECT application_id,id,'prepared',token FROM analysis_jobs WHERE id=$1`,[failedId]);
  for(const code of ['unsupported_input','input_too_large','budget_exhausted']) {
    await db.query('UPDATE analysis_jobs SET safe_code=$2 WHERE id=$1',[failedId,code]);
    const status=await bulk.status('bulk-unreadable');
    assert.equal(status.members[0].validity.state,'passed','prepared evidence stays readable after '+code);
    assert.equal(status.members[0].matching.job?.safeCode,code);
  }

  // Previously saved files without history get exactly one check on explicit
  // reselection. Read-only status polling and deployment never backfill them.
  const legacySelection={...legacy,id:randomUUID(),requirementId:undefined};
  await batches.create('legacy-reselected',[legacySelection]);
  await Promise.all([1,2].map(()=>batches.attachExisting({batchId:'legacy-reselected',memberId:legacySelection.id},legacy.id,legacy.sha256,legacy.name,[])));
  await batches.finalize('legacy-reselected');
  assert.equal((await db.query('SELECT count(*)::int n FROM analysis_jobs WHERE document_id=$1',[legacy.id])).rows[0].n,1);
  assert.equal((await batches.status('legacy-reselected')).members[0].validity.state,'waiting');
  await drain();
  const readLegacy=(await batches.status('legacy-reselected')).members[0];
  assert.equal(readLegacy.validity.state,'passed');
  assert.equal(readLegacy.matching.job?.state,'succeeded');
  await batches.attachExisting({batchId:'legacy-reselected',memberId:legacySelection.id},legacy.id,legacy.sha256,legacy.name,[]);
  assert.equal((await db.query('SELECT count(*)::int n FROM analysis_jobs WHERE document_id=$1',[legacy.id])).rows[0].n,1,'saved results do not trigger another call');

  // Only evidence about the exact stored bytes can confirm readability.
  const savedInput=(await db.query('SELECT input FROM analysis_jobs WHERE id=$1',[readLegacy.matching.job!.id])).rows[0].input;
  await db.query("UPDATE analysis_jobs SET input=jsonb_set(input,'{documents,0,sha256}',to_jsonb($2::text)) WHERE id=$1",[readLegacy.matching.job!.id,'f'.repeat(64)]);
  assert.equal((await batches.status('legacy-reselected')).members[0].validity.state,'unknown');
  await db.query('UPDATE analysis_jobs SET input=$2 WHERE id=$1',[readLegacy.matching.job!.id,savedInput]);
  await db.query("UPDATE requirements SET period='Changed period' WHERE application_id='a' AND id='r'");
  const changedContext=(await batches.status('legacy-reselected')).members[0];
  assert.equal(changedContext.matching.job?.freshness,'stale','matching still respects changed requirements');
  assert.equal(changedContext.validity.state,'passed','changing matching context cannot undo successful reading');

  console.log(JSON.stringify({ok:true,syntheticCalls:calls.length,scenarios:['E14 stale pickup','F01 mid-call change','automatic uploads despite legacy preference','F09 batch barrier','F09 abandoned batch and late arrival','F09 unassigned expiry/finalization/recovery','F11 cross-user ambiguity','F12 stale match findings','F10 failed matching','F12 definition refresh','F02 evidence removal','manifest idempotency and ownership','derived fulfillment','no historical backfill','soft removal fences running jobs','batch-scoped readable/matching/completeness stages','strict matching barrier','affected-only completeness','missing telemetry is unknown','unreadable bytes never dispatched']}));
 }finally{await pool().end();await db.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();await rm(root,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e instanceof Error?e.stack:'Workflow suite failed');process.exitCode=1;});
