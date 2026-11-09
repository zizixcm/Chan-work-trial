import '../scripts/env';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {BorrowerAgentService} from '../lib/agents/borrower-service';
import {UploadBatchService} from '../lib/jobs/batches';
import {transitionProcessorMode} from '../lib/preparation/ownership';
async function main(){
 const url=new URL(process.env.DATABASE_URL!);if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('Disposable local schemas only');
 const schema='upload_upgrade_'+randomUUID().replaceAll('-',''),admin=new Pool({connectionString:url.toString()});url.searchParams.set('options',`-c search_path=${schema},public`);const db=new Pool({connectionString:url.toString()});
 try{
  await admin.query(`CREATE SCHEMA ${schema}`);
  for(const file of (await readdir('migrations/postgres')).filter(f=>f.endsWith('.sql')&&f<'026').sort())await db.query(await readFile('migrations/postgres/'+file,'utf8'));
  await db.query(`INSERT INTO "user"(id,name,email,"emailVerified") VALUES('u','Borrower','upload-upgrade@example.test',true)`);
  await db.query("INSERT INTO applications(id,borrower_name,property_name,address,transaction_type,requested_amount,loi_reference,created_at) VALUES('a','Borrower','Property','Address','Refinance',1000,'LOI',now())");
  await db.query("INSERT INTO application_memberships(application_id,user_id,role) VALUES('a','u','borrower')");
  await db.query("INSERT INTO user_ai_preferences(user_id,enabled) VALUES('u',true) ON CONFLICT(user_id) DO UPDATE SET enabled=true");
  const access={applicationId:'a',userId:'u',role:'borrower' as const,displayName:'Borrower'},service=new BorrowerAgentService(db),batches=new UploadBatchService(access,db);
  await service.preparation.transaction(access,tx=>transitionProcessorMode(tx,'a','adaptive'));
  const upload=async(id:string,hash:string)=>{
   await batches.create(id,[{id:id+'-member',name:id+'.txt',sha256:hash}]);
   await db.query("INSERT INTO documents(id,application_id,original_name,storage_key,content_type,size_bytes,sha256,uploaded_by,created_at) VALUES($1,'a',$1,$1,'text/plain',10,$2,'Borrower',now())",[id+'-doc',hash]);
   await db.query("UPDATE upload_batch_members SET state='saved',document_id=$1 WHERE batch_id=$2",[id+'-doc',id]);
   await batches.finalize(id);
  };
  await upload('historical','a'.repeat(64));
  assert.equal((await db.query('SELECT count(*)::int n FROM borrower_agent_turns')).rows[0].n,0);
  for(const file of (await readdir('migrations/postgres')).filter(f=>f.endsWith('.sql')&&f>='026').sort())await db.query(await readFile('migrations/postgres/'+file,'utf8'));
  await service.enqueueEvents(access);await service.enqueueEvents(access);
  assert.equal((await db.query('SELECT count(*)::int n FROM borrower_agent_turns')).rows[0].n,0,'upgrade does not replay historical uploads or create legacy inventory work');
  assert.equal((await service.runOne(access,{maximumCallMicros:1,async decide(){throw Error('Upgrade must not dispatch a provider');}})).ran,false);
  await upload('new','b'.repeat(64));await service.enqueueEvents(access);await service.enqueueEvents(access);
  const turns=(await db.query('SELECT * FROM borrower_agent_turns')).rows;
  assert.equal(turns.length,1);assert.equal(turns[0].trigger_context.uploadBatchId,'new');assert.deepEqual(turns[0].trigger_context.newDocumentIds,['new-doc']);
  console.log('PASS migration026 upgrade: historical finalized saved batch baselined with zero turns/provider dispatch; new finalized batch admitted exactly once');
 }finally{await db.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
