import '../scripts/env';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {PreparationService} from '../lib/preparation/service';
import {PreparationWorker} from '../lib/preparation/worker';
import {PilotPdfTools} from '../lib/preparation/pdf-tools';
import {transitionProcessorMode} from '../lib/preparation/ownership';
import {initialProcessingProjection,consumeProcessingPage} from '../lib/borrower-chat/processing-projection';
import {buildFixture} from './fixtures/preparation-pilot/fixture';
async function main(){
 const url=new URL(process.env.DATABASE_URL!);if(url.hostname!=='127.0.0.1'||url.port!=='5434')throw Error('Deployment integration requires isolated database port 5434');
 const schema='deployment_'+randomUUID().replaceAll('-','');const admin=new Pool({connectionString:url.toString()});url.searchParams.set('options',`-c search_path=${schema},public`);const database=new Pool({connectionString:url.toString()});
 try{
  await admin.query(`CREATE SCHEMA ${schema}`);
  for(const name of (await readdir('migrations/postgres')).filter(n=>n.endsWith('.sql')).sort())await database.query(await readFile('migrations/postgres/'+name,'utf8'));
  await database.query(`INSERT INTO "user"(id,name,email,"emailVerified") VALUES('u','Synthetic borrower','deployment@example.test',true)`);
  await database.query("INSERT INTO applications(id,borrower_name,property_name,address,transaction_type,requested_amount,loi_reference,created_at) VALUES('a','Cedar Court Holdings LLC','Cedar Court','18 Cedar Lane','Refinance',1000000,'synthetic',now())");
  await database.query("INSERT INTO application_memberships(application_id,user_id,role) VALUES('a','u','borrower')");
  await database.query("INSERT INTO requirements(id,application_id,title,category,purpose,period,owner,applicability,sort_order,criteria) VALUES('r','a','April statement','Financial','Cash evidence','April 2026','Borrower','Required',1,ARRAY['April account balance'])");
  await database.query("INSERT INTO borrower_conversations(id,application_id,borrower_user_id) VALUES('chat','a','u')");
  const fixture=await buildFixture(),source=fixture.checkpoints[1].sources.find(s=>s.id==='d09')!,bytes=fixture.bytes.get('d09')!;
  await database.query("INSERT INTO documents(id,application_id,original_name,storage_key,content_type,size_bytes,sha256,uploaded_by,created_at) VALUES('doc','a','statement.pdf','doc','application/pdf',$1,$2,'Synthetic borrower',now())",[bytes.length,source.sha256]);
  const service=new PreparationService(database),access={applicationId:'a',userId:'u'};
  await service.transaction(access,db=>transitionProcessorMode(db,'a','adaptive'));
  const revision=(await database.query("SELECT content_revision::text FROM applications WHERE id='a'")).rows[0].content_revision;
  const intent={commandId:'command',idempotencyKey:'command',objective:'understand_and_assess',assessmentScope:'application',documentIds:[],requirementIds:[],origin:{kind:'borrower_request',conversationId:'chat',artifactId:'card',domainEventId:'message'},uploadBatchId:null,expectedContentRevision:revision,retryOf:null};
  const accepted=await service.accept(access,intent);const initial=await service.snapshot(access);assert(initial.preparation);
  const projection=initialProcessingProjection({...initial.preparation,cursor:'start'});
  await database.query("UPDATE borrower_preparations SET state=jsonb_set(state,'{budget,limitMicros}','10000') WHERE application_id='a'");
  let calls=0;
  const worker=new PreparationWorker(service,{maximumCallMicros:100,async decide(input){calls++;const observation=input.observations.find(o=>o.kind==='text');return {actualMicros:10,action:!observation?{kind:'read_pages',documentId:'doc',pages:[1],mode:'text'}:{kind:'assess',findings:[{requirementId:'r',criterionId:'r:criterion:1',state:'met',reasonCode:'synthetic',explanation:'Simulated observation for transport verification only',evidence:[{observationId:observation.id,page:1,quote:observation.pages[0].text}],gap:null}],limitations:[]}};}},new PilotPdfTools(),async()=>bytes);
  await worker.run(access,accepted.runId);
  const page=await service.events(access,'start');
  const consumed=await consumeProcessingPage(projection,'start',page.events,page.cursor,(id,revision)=>service.result(access,id,revision));
  assert.equal(consumed.currentResult?.requirements[0].assessment,'appears_complete');assert.equal(consumed.summaries.length,1);
  const replayed=await consumeProcessingPage(consumed,consumed.cursor,page.events,page.cursor,(id,revision)=>service.result(access,id,revision));assert.equal(replayed.summaries.length,1);assert.equal(calls,2);
  await database.query("UPDATE applications SET content_revision=content_revision+1 WHERE id='a'");
  const newRevision=(await database.query("SELECT content_revision::text FROM applications WHERE id='a'")).rows[0].content_revision;
  await service.accept(access,{...intent,commandId:'new',idempotencyKey:'new',expectedContentRevision:newRevision});
  assert.equal((await service.snapshot(access)).currentResult,null,'new admission must not revive old result');
  const count=(await database.query('SELECT count(*)::int n FROM preparation_runs')).rows[0].n;await service.snapshot(access);await service.events(access,'start');assert.equal((await database.query('SELECT count(*)::int n FROM preparation_runs')).rows[0].n,count,'reads cannot dispatch');
  console.log('PASS: actual processor publication → chat consumer, exact citations/result, duplicate summary suppression, mutation/new-admission freshness, read-only no dispatch. Simulated planner; no paid calls.');
 }finally{await database.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Combined integration failed');process.exitCode=1;});
