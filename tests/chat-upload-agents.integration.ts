import '../scripts/env';
import {Pool} from 'pg';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {AgentExecutionError} from '../lib/agents/execution-error';
import {BorrowerAgentService} from '../lib/agents/borrower-service';
import {ConversationUploads} from '../lib/borrower-chat/uploads';
import {UploadBatchService} from '../lib/jobs/batches';
import {transitionProcessorMode} from '../lib/preparation/ownership';

async function main(){
 const url=new URL(process.env.DATABASE_URL!);if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('Disposable local schemas only');
 const schema='upload_agents_'+randomUUID().replaceAll('-',''),admin=new Pool({connectionString:url.toString()});url.searchParams.set('options',`-c search_path=${schema},public`);const db=new Pool({connectionString:url.toString()});
 try{
  await admin.query(`CREATE SCHEMA ${schema}`);
  for(const file of (await readdir('migrations/postgres')).filter(f=>f.endsWith('.sql')).sort())await db.query(await readFile('migrations/postgres/'+file,'utf8'));
  await db.query(`INSERT INTO "user"(id,name,email,"emailVerified") VALUES('u','Borrower','upload-agent@example.test',true)`);
  await db.query("INSERT INTO applications(id,borrower_name,property_name,address,transaction_type,requested_amount,loi_reference,created_at) VALUES('a','Borrower','Property','Address','Refinance',1000,'LOI',now())");
  await db.query("INSERT INTO application_memberships(application_id,user_id,role) VALUES('a','u','borrower')");
  await db.query("INSERT INTO user_ai_preferences(user_id,enabled) VALUES('u',true) ON CONFLICT(user_id) DO UPDATE SET enabled=true");
  const access={applicationId:'a',userId:'u',role:'borrower' as const,displayName:'Borrower'},service=new BorrowerAgentService(db),batches=new UploadBatchService(access,db);
  await service.preparation.transaction(access,tx=>transitionProcessorMode(tx,'a','adaptive'));
  await db.query(`INSERT INTO borrower_preparations(id,application_id,user_id,fingerprint,state) VALUES('prep','a','u','',$1)`,[{currentResultRef:null,obligations:[],questionRefs:[],budget:{limitMicros:10000000,knownMicros:0,reservedMicros:0,unknownCost:false}}]);
  const sha='a'.repeat(64);
  await batches.create('batch-a',[{id:'a1',name:'Lease.txt',sha256:sha},{id:'a2',name:'Roll.txt',sha256:sha}]);
  await batches.create('batch-b',[{id:'b1',name:'Pending.txt',sha256:sha}]);
  const save=async(id:string,member:string)=>{
   await db.query("INSERT INTO documents(id,application_id,original_name,storage_key,content_type,size_bytes,sha256,uploaded_by,created_at) VALUES($1,'a',$1,$1,'text/plain',10,$2,'Borrower',now())",[id,createHash('sha256').update(id).digest('hex')]);
   await db.query("UPDATE upload_batch_members SET state='saved',document_id=$1 WHERE id=$2",[id,member]);
  };
  await save('doc-a1','a1');await service.enqueueEvents(access);
  assert.equal((await db.query('SELECT count(*)::int n FROM borrower_agent_turns')).rows[0].n,0,'partial open batch does not start a review');
  await batches.finalize('batch-a');await batches.finalize('batch-a');await service.enqueueEvents(access);await service.enqueueEvents(access);
  let turns=(await db.query("SELECT * FROM borrower_agent_turns WHERE source_key LIKE 'upload:%'")).rows;
  assert.equal(turns.length,1,'duplicate finalization and worker ticks admit exactly once');assert.deepEqual(turns[0].trigger_context.newDocumentIds,['doc-a1']);
  assert.equal((await service.streamState(access)).uploadPending,true,'pending upload work has an honest activity status');
  const receipt=await new ConversationUploads(access,db).read();assert.equal(receipt.cards.find(c=>c.batchId==='batch-a')!.members.filter(m=>m.state==='saved').length,1,'receipt exists before any model call');
  assert.equal((await db.query("SELECT count(*)::int n FROM borrower_agent_turns WHERE source_key LIKE 'inventory:%'")).rows[0].n,0,'no duplicate legacy inventory turn');
  let calls=0;
  await service.runOne(access,{maximumCallMicros:1,async decide(input:any,_signal,execute){calls++;assert.equal(input.inventory.pendingUploads,true);assert.equal(input.trigger.upload.uploadBatchId,'batch-a');assert.deepEqual(input.trigger.upload.newDocumentIds,['doc-a1']);const action={kind:'reply' as const,message:'Saved lease received.'};await execute(action);return {action,actualMicros:1,executed:true};}});
  assert.equal(calls,1,'unrelated incomplete batch does not block completed batch');
  await save('doc-a2','a2');await batches.finalize('batch-a');await service.enqueueEvents(access);
  turns=(await db.query("SELECT * FROM borrower_agent_turns WHERE source_key LIKE 'upload:%' ORDER BY created_at")).rows;
  assert.equal(turns.length,2);assert.deepEqual(turns[1].trigger_context.newDocumentIds,['doc-a2'],'retry only focuses newly saved members');
  await db.query("UPDATE user_ai_preferences SET enabled=false,epoch=epoch+1 WHERE user_id='u'");
  await service.runOne(access,{maximumCallMicros:1,async decide(){throw Error('Revoked consent must stop before generation');}});
  assert.equal((await db.query('SELECT state FROM borrower_agent_turns WHERE id=$1',[turns[1].id])).rows[0].state,'blocked');
  await db.query("UPDATE user_ai_preferences SET enabled=true,epoch=epoch+1 WHERE user_id='u'");
  await save('doc-b1','b1');await batches.finalize('batch-b');await service.enqueueEvents(access);
  await service.runOne(access,{maximumCallMicros:1,async decide(_input,_signal,execute){await db.query("UPDATE user_ai_preferences SET enabled=false,epoch=epoch+1 WHERE user_id='u'");const action={kind:'reply' as const,message:'Must not commit after revocation'};try{await execute(action);}catch(error){throw new AgentExecutionError('tool_or_validation_limit',0,error);}return {action,actualMicros:1,executed:true};}});
  assert.equal((await db.query("SELECT count(*)::int n FROM borrower_agent_turns WHERE response_text='Must not commit after revocation'")).rows[0].n,0);
  await db.query("UPDATE user_ai_preferences SET enabled=true,epoch=epoch+1 WHERE user_id='u'");
  await batches.create('batch-c',[{id:'c1',name:'New statement.txt',sha256:sha}]);await save('doc-c1','c1');await batches.finalize('batch-c');await service.enqueueEvents(access);
  const stale=(await db.query("SELECT * FROM borrower_agent_turns WHERE trigger_context->>'uploadBatchId'='batch-c'")).rows[0];
  await service.runOne(access,{maximumCallMicros:1,async decide(){await db.query("UPDATE applications SET content_revision=content_revision+1 WHERE id='a'");return {action:{kind:'reply',message:'Stale update'},actualMicros:1};}});
  assert.equal((await db.query('SELECT state FROM borrower_agent_turns WHERE id=$1',[stale.id])).rows[0].state,'superseded');
  const retry=(await db.query("SELECT * FROM borrower_agent_turns WHERE source_key LIKE 'retry:%' AND trigger_context->>'uploadBatchId'='batch-c'")).rows[0];
  assert(retry);assert.deepEqual(retry.trigger_context,stale.trigger_context,'context-change retries retain upload scope and authority');
  await db.query("UPDATE user_ai_preferences SET epoch=epoch+1 WHERE user_id='u'");
  await service.runOne(access,{maximumCallMicros:1,async decide(){throw Error('Changed consent epoch must stop before generation');}});
  assert.equal((await db.query('SELECT state FROM borrower_agent_turns WHERE id=$1',[retry.id])).rows[0].state,'blocked');
  const beforeMutations=(await db.query("SELECT count(*)::int n FROM borrower_agent_turns WHERE source_key LIKE 'inventory:%'")).rows[0].n;
  await db.query("UPDATE applications SET address='Updated address' WHERE id='a'");await service.enqueueEvents(access);
  assert.equal((await db.query("SELECT count(*)::int n FROM borrower_agent_turns WHERE source_key LIKE 'inventory:%'")).rows[0].n,beforeMutations+1,'non-upload mutations still enqueue an inventory update');
  const mutationCount=(await db.query("SELECT count(*)::int n FROM borrower_agent_turns WHERE source_key LIKE 'inventory:%'")).rows[0].n;
  await db.query("UPDATE applications SET content_revision=content_revision+1 WHERE id='a'");await service.enqueueEvents(access);
  assert.equal((await db.query("SELECT count(*)::int n FROM borrower_agent_turns WHERE source_key LIKE 'inventory:%'")).rows[0].n,mutationCount+1,'evidence-only mutations are preserved without partial-upload churn');
  await db.query("UPDATE borrower_agent_turns SET state='completed' WHERE state='queued'");
  await db.query("UPDATE user_ai_preferences SET enabled=false,epoch=epoch+1 WHERE user_id='u'");
  await batches.create('explicit-upload',[{id:'explicit-member',name:'Explicit upload.txt',sha256:sha}]);await save('explicit-doc','explicit-member');await batches.finalize('explicit-upload');await service.enqueueEvents(access);
  assert.equal((await db.query("SELECT count(*)::int n FROM borrower_agent_turns WHERE trigger_context->>'uploadBatchId'='explicit-upload'")).rows[0].n,0,'background batch stays opt-in');
  await assert.rejects(new UploadBatchService({...access,userId:'not-the-borrower'},db).finalize('explicit-upload',true));
  await batches.finalize('explicit-upload',true);await service.enqueueEvents(access);
  const explicit=(await db.query("SELECT * FROM borrower_agent_turns WHERE trigger_context->>'uploadBatchId'='explicit-upload'")).rows[0];assert(explicit);assert.equal(explicit.trigger_context.grant.kind,'explicit_upload');
  const requestedAt=(await db.query("SELECT processing_requested_at FROM upload_batches WHERE id='explicit-upload'")).rows[0].processing_requested_at.toISOString();
  await batches.finalize('explicit-upload',true);await service.enqueueEvents(access);
  assert.equal((await db.query("SELECT count(*)::int n FROM borrower_agent_turns WHERE trigger_context->>'uploadBatchId'='explicit-upload'")).rows[0].n,1,'explicit finalization replay does not duplicate work');
  assert.equal((await db.query("SELECT processing_requested_at FROM upload_batches WHERE id='explicit-upload'")).rows[0].processing_requested_at.toISOString(),requestedAt);
  assert.equal((await db.query("SELECT enabled FROM user_ai_preferences WHERE user_id='u'")).rows[0].enabled,false,'explicit upload never silently enables background AI');
  assert.equal((await service.streamState(access)).uploadPending,true);
  await service.preparation.transaction(access,async tx=>{await transitionProcessorMode(tx,'a','baseline');await transitionProcessorMode(tx,'a','adaptive');});
  let explicitCalled=false;await service.runOne(access,{maximumCallMicros:1,async decide(){explicitCalled=true;throw Error('Obsolete explicit upload epoch must not dispatch');}});
  assert.equal(explicitCalled,false);assert.equal((await db.query('SELECT state FROM borrower_agent_turns WHERE id=$1',[explicit.id])).rows[0].state,'blocked');
  // First-ever interaction can be an upload: no chat initialization or worker
  // inventory scan is required, and this commit must not recover older batches.
  await db.query("INSERT INTO applications(id,borrower_name,property_name,address,transaction_type,requested_amount,loi_reference,created_at) VALUES('first-upload','Borrower','Property','Address','Refinance',1000,'LOI',now())");
  await db.query("INSERT INTO application_memberships(application_id,user_id,role) VALUES('first-upload','u','borrower')");
  const firstAccess={...access,applicationId:'first-upload'},firstBatches=new UploadBatchService(firstAccess,db);
  await service.preparation.transaction(firstAccess,tx=>transitionProcessorMode(tx,'first-upload','adaptive'));
  for(const id of ['historical','fresh']){
   const firstSha=createHash('sha256').update(id).digest('hex');
   await firstBatches.create(id,[{id:`member-${id}`,name:`${id}.txt`,sha256:firstSha}]);
   await db.query("INSERT INTO documents(id,application_id,original_name,storage_key,content_type,size_bytes,sha256,uploaded_by,created_at) VALUES($1,'first-upload',$2,$1,'text/plain',10,$3,'Borrower',now())",[id,`${id}.txt`,firstSha]);
   await db.query("UPDATE upload_batch_members SET state='saved',document_id=$1 WHERE id=$2",[id,`member-${id}`]);
  }
  await firstBatches.finalize('historical');
  await firstBatches.finalize('fresh',true);
  const immediate=(await db.query("SELECT t.* FROM borrower_agent_turns t JOIN borrower_conversations c ON c.id=t.conversation_id WHERE t.application_id='first-upload'")).rows;
  assert.equal(immediate.length,1,'first upload creates its conversation and exactly one agent message before a worker runs');
  assert.equal(immediate[0].trigger_context.uploadBatchId,'fresh','manual commit does not retroactively admit another batch');
  assert.deepEqual(immediate[0].trigger_context.newDocumentIds,['fresh']);
  assert.deepEqual(immediate[0].trigger_context.files.map((f:any)=>f.name),['fresh.txt']);
  await firstBatches.finalize('fresh',true);
  assert.equal((await db.query("SELECT count(*)::int n FROM borrower_agent_turns WHERE application_id='first-upload'")).rows[0].n,1,'commit replay sends no duplicate message');
  console.log('PASS chat upload admission: partial/finalized batches, retries, durable receipts, deduplication, consent fencing');
 }finally{await db.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
