import '../scripts/env';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { PreparationRepository } from '../lib/preparation-pilot/repository';
import { buildFixture } from './fixtures/preparation-pilot/fixture';
import { simulatedActions } from './fixtures/preparation-pilot/simulation';
import { gold } from './fixtures/preparation-pilot/oracle';

async function main() {
 if(!process.env.DATABASE_URL)throw new Error('Local DATABASE_URL required');
 const url=new URL(process.env.DATABASE_URL);
 if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new Error('Harness requires local PostgreSQL');
 const schema=`prep_pilot_${randomUUID().replaceAll('-','')}`;
 const admin=new Pool({connectionString:url.toString()});url.searchParams.set('options',`-c search_path=${schema},public`);
 const db=new Pool({connectionString:url.toString(),max:4});
 try {
  await admin.query(`CREATE SCHEMA ${schema}`);
  await db.query('CREATE TABLE applications(id text PRIMARY KEY); CREATE TABLE application_memberships(application_id text,user_id text,role text,active boolean);');
  await db.query(await readFile(new URL('../lib/preparation-pilot/schema.sql',import.meta.url),'utf8'));
  await db.query("INSERT INTO applications VALUES('prep01'),('other'); INSERT INTO application_memberships VALUES('prep01','borrower','borrower',true),('other','other','borrower',true)");
  const actor={applicationId:'prep01',userId:'borrower'},repo=new PreparationRepository(db),fixture=await buildFixture();
  await repo.initialize(actor,fixture.checkpoints[0],{runMicros:100000,totalMicros:1000000,totalActions:300});
  const first=await repo.delegate(actor,'opening',1,'Assess all evidence');
  assert.equal((await repo.delegate(actor,'opening',1,'Assess all evidence')).id,first.id);
  await assert.rejects(repo.delegate(actor,'opening',1,'Different objective'),/Replay conflict/);
  const lease=await repo.claim(actor,first.id);
  const firstAction=simulatedActions(fixture.checkpoints[0])[0];
  await repo.executeSimulated(actor,first.id,lease.token,'first',firstAction,100);
  const spent=(await repo.read(actor))!.spentMicros;
  await repo.executeSimulated(actor,first.id,lease.token,'first',firstAction,100);
  assert.equal((await repo.read(actor))!.spentMicros,spent);
  await assert.rejects(repo.executeSimulated(actor,first.id,lease.token,'first',firstAction,101),/replay conflict/);
  // Lease loss/restart must preserve checkpoints and reservations while fencing old workers.
  await db.query("UPDATE preparation_pilot SET state=jsonb_set(state,'{runs,0,expiresAt}','0') WHERE application_id='prep01'");
  const restarted=new PreparationRepository(db),newLease=await restarted.claim(actor,first.id);
  await assert.rejects(repo.executeSimulated(actor,first.id,lease.token,'late',firstAction,100),/Stale execution/);
  const actions=simulatedActions(fixture.checkpoints[0]);
  for(let i=1;i<actions.length;i++)await restarted.executeSimulated(actor,first.id,newLease.token,`a${i}`,actions[i],100);
  assert.equal((await repo.read(actor))!.result?.readiness,gold[0].readiness);
  // Current snapshots advance without scheduling. Completed result remains in run actions as history.
  for(let c=1;c<6;c++){
   const previous=(await repo.read(actor))!,revision=previous.revision;
   await repo.updateSnapshot(actor,revision,fixture.checkpoints[c]);
   assert.equal((await repo.read(actor))!.result,null);
   assert.equal((await repo.read(actor))!.runs.length,c);
   const run=await repo.delegate(actor,`checkpoint${c}`,revision+1,'Assess all evidence'),claim=await repo.claim(actor,run.id);
   for(const [i,action] of simulatedActions(fixture.checkpoints[c]).entries())await repo.executeSimulated(actor,run.id,claim.token,`a${i}`,action,100);
   assert.equal((await repo.read(actor))!.result?.readiness,gold[c].readiness);
  }
  assert.equal((await repo.delegate(actor,'opening',1,'Assess all evidence')).id,first.id,'stale replay is historical');
  await assert.rejects(repo.read({applicationId:'other',userId:'borrower'}),/unavailable/);
  const current=(await repo.read(actor))!;
  const [a,b]=await Promise.all([repo.delegate(actor,'concurrent',current.revision,'Check'),repo.delegate(actor,'concurrent',current.revision,'Check')]);assert.equal(a.id,b.id);
  const token=await repo.claim(actor,a.id);await repo.cancel(actor,a.id);
  await assert.rejects(repo.executeSimulated(actor,a.id,token.token,'resurrect',firstAction,100),/Stale execution/);
  const next=await repo.delegate(actor,'new',current.revision,'Check again'),nextToken=await repo.claim(actor,next.id);
  await assert.rejects(repo.executeSimulated(actor,next.id,nextToken.token,'cost',firstAction,1000001),/Budget/);
  await repo.updateSnapshot(actor,current.revision,{...fixture.checkpoints[5],pendingUploads:true});
  await assert.rejects(repo.executeSimulated(actor,next.id,nextToken.token,'stale',firstAction,100),/Stale execution/);
  await db.query("UPDATE application_memberships SET active=false WHERE user_id='borrower'");
  await assert.rejects(repo.read(actor),/unavailable/);
  console.log('PASS preparation pilot: C0–C5, durable restart, lease/revision fences, replay, budgets, authorization, cancellation. Simulated only.');
 } finally {await db.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Pilot failed');process.exitCode=1;});
