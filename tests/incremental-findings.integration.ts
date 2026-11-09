import '../scripts/env';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {PreparationService,type PreparationIntent} from '../lib/preparation/service';
import {PreparationWorker} from '../lib/preparation/worker';
import {transitionProcessorMode} from '../lib/preparation/ownership';
import type {EvidenceTools,PreparationPlanner} from '../lib/preparation/actions';
async function main(){
 if(!process.env.DATABASE_URL)throw Error('Local DATABASE_URL required');
 const url=new URL(process.env.DATABASE_URL);if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('Local database only');
 const schema=`incremental_${randomUUID().replaceAll('-','')}`,admin=new Pool({connectionString:url.toString()});url.searchParams.set('options',`-c search_path=${schema},public`);const db=new Pool({connectionString:url.toString()});
 try{
  await admin.query(`CREATE SCHEMA ${schema}`);
  for(const name of (await readdir('migrations/postgres')).filter(n=>n.endsWith('.sql')).sort())await db.query(await readFile(`migrations/postgres/${name}`,'utf8'));
  await db.query(`INSERT INTO "user"(id,name,email,"emailVerified") VALUES('u','Borrower','incremental@example.test',true)`);
  await db.query("INSERT INTO applications(id,borrower_name,property_name,address,transaction_type,requested_amount,loi_reference,created_at) VALUES('a','A','P','X','Refinance',1,'L',now())");
  await db.query("INSERT INTO application_memberships(application_id,user_id,role) VALUES('a','u','borrower')");
  await db.query("INSERT INTO requirements(id,application_id,title,category,purpose,period,owner,applicability,sort_order,criteria) VALUES('r','a','Statements','Financial','Income','2025 and YTD','Borrower','Required',1,ARRAY['2025 actuals','YTD actuals'])");
  await db.query("INSERT INTO borrower_conversations(id,application_id,borrower_user_id) VALUES('chat','a','u')");
  const sha='a'.repeat(64);await db.query("INSERT INTO documents(id,application_id,original_name,storage_key,content_type,size_bytes,sha256,uploaded_by,created_at) VALUES('doc','a','actuals.txt','doc','text/plain',10,$1,'Borrower',now())",[sha]);
  const access={applicationId:'a',userId:'u'},service=new PreparationService(db);
  await service.transaction(access,tx=>transitionProcessorMode(tx,'a','adaptive'));
  let reads=0;
  const tools:EvidenceTools={async inspect(){throw Error('Unexpected inspect');},async read(_bytes,documentId,sha256,_pages,mode){reads++;if(documentId==='scan')return {id:randomUUID(),documentId,sha256,kind:mode==='image'?'image':'ocr',pageCount:1,pages:[{page:1,text:mode==='image'?'':'Income 100',...(mode==='image'?{imageBase64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='}:{confidence:35})}],limitations:[]};return {id:randomUUID(),documentId,sha256,kind:'text',pageCount:1,pages:[{page:1,text:'2025 and YTD actuals'}],limitations:[]};}};
  const intent:PreparationIntent={commandId:'',idempotencyKey:'',objective:'resolve_gap',assessmentScope:'affected_requirements',documentIds:['doc'],requirementIds:['r'],origin:{kind:'borrower_request',conversationId:'chat',artifactId:null,domainEventId:'test'},uploadBatchId:null,expectedContentRevision:'',retryOf:null};
  async function run(name:string,decide:PreparationPlanner['decide']){
   const revision=(await db.query("SELECT content_revision::text FROM applications WHERE id='a'")).rows[0].content_revision;
   const receipt=await service.accept(access,{...intent,commandId:name,idempotencyKey:name,expectedContentRevision:revision});
   await db.query("UPDATE borrower_preparations SET state=jsonb_set(state,'{budget,limitMicros}','10000') WHERE application_id='a' AND user_id='u'");
   const worker=new PreparationWorker(service,{maximumCallMicros:100,decide},tools,async()=>new Uint8Array(),{runLimitMicros:10000,maxCalls:6,timeoutMs:30000});
   await worker.run(access,receipt.runId);return {snapshot:await service.snapshot(access),runId:receipt.runId};
  }
  const finding=(observationId:string,criterionId:string)=>({requirementId:'r',criterionId,state:'met' as const,reasonCode:'supported',explanation:'Fixture supports this criterion',evidence:[{observationId,page:1,quote:'2025 and YTD actuals'}],gap:null});
  const first=await run('first',async input=>({actualMicros:10,action:input.observations.length?{kind:'assess',findings:[finding(input.observations[0].id,'r:criterion:1')],limitations:[]}:{kind:'read_pages',documentId:'doc',pages:[1],mode:'text'}}));
  assert.ok(first.snapshot.currentResult,JSON.stringify((await db.query('SELECT state,output FROM preparation_runs r LEFT JOIN preparation_steps s ON s.run_id=r.id WHERE r.id=$1',[first.runId])).rows));assert.deepEqual(first.snapshot.currentResult!.requirements[0].checks.map(c=>c.state),['met','unknown']);assert.equal(first.snapshot.packageCompleteness?.status,'unknown');
  const second=await run('second',async input=>{assert.ok(input.reusableCriterionIds?.includes('r:criterion:1'));return {actualMicros:10,action:{kind:'assess',findings:[finding(input.observations[0].id,'r:criterion:2')],limitations:[]}};});
  assert.deepEqual(second.snapshot.currentResult!.requirements[0].checks.map(c=>c.state),['met','met']);assert.equal(second.snapshot.packageCompleteness?.status,'complete');assert.equal(reads,1);
  const audit=(await db.query("SELECT output FROM preparation_steps WHERE run_id=$1 AND output->>'kind'='assess'",[second.runId])).rows[0].output;
  assert.deepEqual(audit.changedCriterionIds,['r:criterion:2']);assert.ok(audit.retainedCriterionIds.includes('r:criterion:1'));assert.ok(audit.findingBaseline);
  await db.query("INSERT INTO documents(id,application_id,original_name,storage_key,content_type,size_bytes,sha256,uploaded_by,created_at) VALUES('new','a','new.txt','new','text/plain',10,$1,'Borrower',now())",['b'.repeat(64)]);
  assert.equal((await service.snapshot(access)).currentResult,null);
  const third=await run('changed',async input=>{assert.deepEqual(input.reusableCriterionIds,[]);assert.ok(input.reaffirmableCriterionIds?.includes('r:criterion:1'));return {actualMicros:10,action:{kind:'assess',findings:[],reaffirmCriterionIds:['r:criterion:1'],limitations:[]}};});
  assert.deepEqual(third.snapshot.currentResult!.requirements[0].checks.map(c=>c.state),['met','unknown']);assert.equal(third.snapshot.packageCompleteness?.status,'unknown');
  // Incomplete coverage is still rejected; incremental publication is no waiver.
  const invalid=await run('absence',async()=>({actualMicros:10,action:{kind:'assess',findings:[{requirementId:'r',criterionId:'r:criterion:2',state:'unmet',reasonCode:'missing',explanation:'Absent',evidence:[],gap:{kind:'missing_evidence',subject:null,period:null,documentRole:null,description:'Need YTD',owner:'borrower'}}],limitations:[]}}));
  assert.equal((await db.query('SELECT state FROM preparation_runs WHERE id=$1',[invalid.runId])).rows[0].state,'waiting_input');
  assert.ok((await db.query("SELECT 1 FROM preparation_steps WHERE run_id=$1 AND output->>'diagnostic'='Insufficient inspected coverage for absence'",[invalid.runId])).rowCount);
  // A removed source cannot be resurrected through compact reaffirmation.
  await db.query("INSERT INTO draft_document_removals(application_id,document_id,removed_by) VALUES('a','doc','u')");
  const removed=await run('removed',async()=>({actualMicros:10,action:{kind:'assess',findings:[],reaffirmCriterionIds:['r:criterion:1'],limitations:[]}}));
  assert.equal((await db.query('SELECT state FROM preparation_runs WHERE id=$1',[removed.runId])).rows[0].state,'waiting_input');assert.equal(removed.snapshot.currentResult,null);
  // The image must be cited directly; its existence never upgrades an OCR citation.
  await db.query("INSERT INTO documents(id,application_id,original_name,storage_key,content_type,size_bytes,sha256,uploaded_by,created_at) VALUES('scan','a','scan.pdf','scan','application/pdf',10,$1,'Borrower',now())",['d'.repeat(64)]);
  intent.documentIds=['scan'];
  let sawImageFeedback=false;
  const visual=await run('ocr-repair',async input=>{
   const ocr=input.observations.find(o=>o.documentId==='scan'&&o.kind==='ocr');
   if(!ocr)return {actualMicros:10,action:{kind:'read_pages',documentId:'scan',pages:[1],mode:'ocr'}};
   if(!input.actionFeedback)return {actualMicros:10,action:{kind:'assess',findings:[{...finding(ocr.id,'r:criterion:2'),evidence:[{observationId:ocr.id,page:1,quote:'Income 100'}]}],limitations:[]}};
   assert.match(input.actionFeedback,/IMAGE observation ID/);assert.match(input.actionFeedback,/does not upgrade/);sawImageFeedback=true;
   const image=input.observations.find(o=>o.documentId==='scan'&&o.kind==='image');
   if(!image)return {actualMicros:10,action:{kind:'read_pages',documentId:'scan',pages:[1],mode:'image'}};
   return {actualMicros:10,action:{kind:'assess',findings:[{...finding(image.id,'r:criterion:2'),evidence:[{observationId:image.id,page:1,quote:'Income row on the rendered statement'}]}],limitations:[]}};
  });
  assert(sawImageFeedback);assert.equal(visual.snapshot.currentResult!.requirements[0].checks.find(c=>c.criterionId==='r:criterion:2')!.state,'met');
  const cited=visual.snapshot.currentResult!.citations.find(c=>c.kind==='artifact'&&c.documentId==='scan');assert(cited&&cited.kind==='artifact');
  const visualObservations=(await db.query('SELECT observations FROM preparation_runs WHERE id=$1',[visual.runId])).rows[0].observations;
  assert.equal(visualObservations.find((o:any)=>o.id===cited.evidenceArtifactId).kind,'image');
  // Even with that image available, an unknown result may not cite unverified OCR.
  const uncertain=await run('ocr-unknown-fallback',async input=>{
   const ocr=input.observations.find(o=>o.documentId==='scan'&&o.kind==='ocr')!;
   if(input.actionFeedback)assert.match(input.actionFeedback,/unknown with evidence: \[\]/);
   return {actualMicros:10,action:{kind:'assess',findings:[{requirementId:'r',criterionId:'r:criterion:2',state:'unknown',reasonCode:'uncertain_visual',explanation:'This image is not conclusive',evidence:input.actionFeedback?[]:[{observationId:ocr.id,page:1,quote:'Income 100'}],gap:{kind:'unreadable',subject:null,period:null,documentRole:null,description:'A clearer source is needed to evaluate this criterion',owner:'borrower'}}],limitations:[]}};
  });
  assert.equal(uncertain.snapshot.currentResult!.requirements[0].checks.find(c=>c.criterionId==='r:criterion:2')!.state,'unknown');
  assert.ok((await db.query("SELECT 1 FROM preparation_steps WHERE run_id=$1 AND output->>'diagnostic'='Low confidence OCR requires image verification'",[uncertain.runId])).rowCount,'existing image must not silently legitimize OCR citation');
  console.log('PASS incremental durable publication: partial updates, citation reuse, backend completeness, audited dependencies, new evidence invalidation, absence coverage and removed-source rejection, image-citation repair and unknown OCR fallback. No live calls.');
 }finally{await db.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}
}
main().catch(error=>{console.error(error instanceof Error?error.stack:'Incremental integration failed');process.exitCode=1;});
