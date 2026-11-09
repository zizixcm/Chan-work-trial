import '../scripts/env';
import {Pool} from 'pg';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {approvedPilotEvidence,verifyPilotBlob} from '../lib/agents/pilot-evidence';
async function main(){
 const url=new URL(process.env.DATABASE_URL!);if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('Disposable local schemas only');
 const schema='pilot_upload_'+randomUUID().replaceAll('-',''),admin=new Pool({connectionString:url.toString()});url.searchParams.set('options',`-c search_path=${schema},public`);const db=new Pool({connectionString:url.toString()});
 try{
  await admin.query(`CREATE SCHEMA ${schema}`);for(const file of (await readdir('migrations/postgres')).filter(f=>f.endsWith('.sql')).sort())await db.query(await readFile('migrations/postgres/'+file,'utf8'));
  await db.query(`INSERT INTO "user"(id,name,email,"emailVerified") VALUES('u','Borrower','pilot-upload@example.test',true),('v','Other','pilot-other@example.test',true)`);
  for(const id of ['a','other'])await db.query("INSERT INTO applications(id,borrower_name,property_name,address,transaction_type,requested_amount,loi_reference,created_at) VALUES($1,'Borrower','Property','Address','Refinance',1000,'LOI',now())",[id]);
  await db.query("INSERT INTO application_memberships(application_id,user_id,role) VALUES('a','u','borrower'),('a','v','borrower'),('other','v','borrower')");
  const access={applicationId:'a',userId:'u',role:'borrower' as const,displayName:'Borrower'},bytes=Buffer.from('New lease bytes'),hash=createHash('sha256').update(bytes).digest('hex');
  await db.query("INSERT INTO documents(id,application_id,original_name,storage_key,content_type,size_bytes,sha256,uploaded_by,created_at) VALUES('doc','a','Lease.txt','lease-key','text/plain',$1,$2,'Borrower',now())",[bytes.length,hash]);
  const read=async()=>{const tx=await db.connect();try{return await approvedPilotEvidence(tx,access,[]);}finally{tx.release();}};
  await assert.rejects(read(),/Unregistered/,'an unbatched new file is not automatically trusted');
  await db.query("INSERT INTO upload_batches(id,application_id,user_id,manifest_hash) VALUES('wrong-user','a','v','hash')");
  await db.query("INSERT INTO upload_batch_members(batch_id,id,application_id,name,sha256,state,document_id) VALUES('wrong-user','w','a','Lease.txt',$1,'saved','doc')",[hash]);
  await assert.rejects(read(),/Unregistered/,'another borrower receipt cannot authorize bytes');
  await db.query("INSERT INTO upload_batches(id,application_id,user_id,manifest_hash) VALUES('own','a','u','hash')");
  await db.query("INSERT INTO upload_batch_members(batch_id,id,application_id,name,sha256,state,document_id) VALUES('own','m','a','Lease.txt',$1,'saved','doc')",['b'.repeat(64)]);
  await assert.rejects(read(),/Unregistered/,'forged hash receipt is rejected');
  await db.query("UPDATE upload_batch_members SET sha256=$1,state='pending',document_id=NULL WHERE id='m'",[hash]);await assert.rejects(read(),/Unregistered/,'unsaved member is not proof');
  await db.query("UPDATE upload_batch_members SET state='saved',document_id='doc',name='Wrong name.txt' WHERE id='m'");await assert.rejects(read(),/Unregistered/,'receipt must match document identity');
  await db.query("UPDATE upload_batch_members SET name='Lease.txt' WHERE id='m'");
  let approved=await read();verifyPilotBlob('lease-key',bytes,approved);
  assert.throws(()=>verifyPilotBlob('lease-key',Buffer.from('tampered'),approved),/Blob outside/);assert.throws(()=>verifyPilotBlob('/arbitrary/file',bytes,approved),/Blob outside/);
  await db.query("UPDATE upload_batches SET state='finalized' WHERE id='own'");
  const otherBytes=Buffer.from('Second saved file'),otherHash=createHash('sha256').update(otherBytes).digest('hex');
  await db.query("INSERT INTO documents(id,application_id,original_name,storage_key,content_type,size_bytes,sha256,uploaded_by,created_at) VALUES('doc2','a','Roll.txt','roll-key','text/plain',$1,$2,'Borrower',now())",[otherBytes.length,otherHash]);
  await db.query("INSERT INTO upload_batches(id,application_id,user_id,manifest_hash) VALUES('open-b','a','u','hash')");
  await db.query("INSERT INTO upload_batch_members(batch_id,id,application_id,name,sha256,state,document_id) VALUES('open-b','b','a','Roll.txt',$1,'saved','doc2')",[otherHash]);
  approved=await read();verifyPilotBlob('lease-key',bytes,approved);verifyPilotBlob('roll-key',otherBytes,approved);assert.equal(approved.size,2,'completed A is not blocked by saved bytes in open B');
  await db.query("INSERT INTO draft_document_removals(application_id,document_id,removed_by) VALUES('a','doc','u')");approved=await read();assert.equal(approved.has('lease-key'),false,'deleted file loses dynamic receipt authorization');
  assert.throws(()=>verifyPilotBlob('lease-key',bytes,approved),/Blob outside/);
  const replacementBytes=Buffer.from('Replacement roll'),replacementHash=createHash('sha256').update(replacementBytes).digest('hex');
  await db.query("INSERT INTO documents(id,application_id,original_name,storage_key,content_type,size_bytes,sha256,uploaded_by,created_at,replaces_document_id,series_id,version_number) VALUES('replacement','a','Replacement.txt','replacement-key','text/plain',$1,$2,'Borrower',now(),'doc2','doc2',2)",[replacementBytes.length,replacementHash]);
  await db.query("INSERT INTO upload_batch_members(batch_id,id,application_id,name,sha256,state,document_id) VALUES('open-b','replacement-member','a','Replacement.txt',$1,'saved','replacement')",[replacementHash]);
  approved=await read();assert.equal(approved.has('roll-key'),false,'superseded file loses dynamic receipt authorization');verifyPilotBlob('replacement-key',replacementBytes,approved);
  const tx=await db.connect();try{const initial=await approvedPilotEvidence(tx,access,[hash]);verifyPilotBlob('lease-key',bytes,initial);}finally{tx.release();}
  await assert.rejects(db.query("INSERT INTO upload_batches(id,application_id,user_id,manifest_hash) VALUES('cross-app','other','u','hash'); INSERT INTO upload_batch_members(batch_id,id,application_id,name,sha256,state,document_id) VALUES('cross-app','cross','other','Lease.txt','hash','saved','doc')"),/foreign key|violates/,'cross-application receipt cannot be forged');
  console.log('PASS trusted pilot uploads: server-saved scoped proof, restart reconstruction, initial hashes, partial batch independence, forged/cross-user/cross-app/unsaved/hash/name/deleted/blob checks');
 }finally{await db.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
