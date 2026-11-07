/** No credential interaction: isolated demo runtime, fixed identities and role boundaries. */
import '../scripts/env';
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {mkdtemp,readdir,readFile,rm} from 'node:fs/promises';
import {spawn,type ChildProcess} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {get as httpGet} from 'node:http';
import os from 'node:os';
import path from 'node:path';

async function main(){
 const schema='demo_'+randomUUID().replaceAll('-',''),admin=new Pool({connectionString:process.env.DATABASE_URL});
 const url=new URL(process.env.DATABASE_URL!);url.searchParams.set('options','-c search_path='+schema+',public');
 const db=new Pool({connectionString:url.toString()}),root=await mkdtemp(path.join(os.tmpdir(),'portal-demo-'));
 const probe=createServer().listen(0,'127.0.0.1');await once(probe,'listening');const address=probe.address();assert(address&&typeof address!=='string');const port=address.port;await new Promise<void>(r=>probe.close(()=>r()));
 const base='http://127.0.0.1:'+port;let server:ChildProcess|undefined,cookie='';
 const request=(route:string,options:RequestInit={})=>fetch(base+route,{...options,headers:{cookie,...Object.fromEntries(new Headers(options.headers))}});
 const post=(route:string,value:unknown,extra:Record<string,string>={})=>request(route,{method:'POST',headers:{origin:base,'Content-Type':'application/json',...extra},body:JSON.stringify(value)});
 const switchRole=async(role:string,applicationId?:string)=>{const r=await post('/api/demo/role',{role,...(applicationId?{applicationId}:{})});assert.equal(r.status,200,await r.clone().text());const set=r.headers.getSetCookie();assert(set.some(c=>c.includes('HttpOnly')&&c.includes('SameSite=Strict')));cookie=set.map(c=>c.split(';')[0]).join('; ');return r.json();};
 async function stop(){if(server&&server.exitCode===null){const end=once(server,'exit');server.kill('SIGTERM');await end;}}
 async function start(enabled:string){server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{cwd:process.env.PORTAL_TEST_BUILD_DIR||process.cwd(),env:{...process.env,LOCAL_DEMO_MODE:enabled,DATABASE_URL:url.toString(),PORTAL_DATA_DIR:root,BETTER_AUTH_URL:base},stdio:'ignore'});for(let i=0;i<100;i++){try{const r=await request('/api/session');if([200,401].includes(r.status))return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('Demo test server did not start');}
 try{
  await admin.query(`CREATE SCHEMA ${schema}`);
  for(const f of (await readdir('migrations/postgres')).filter(f=>f.endsWith('.sql')).sort())await db.query(await readFile('migrations/postgres/'+f,'utf8'));
  await db.query(`INSERT INTO "user"(id,name,email,"emailVerified") VALUES('borrower','Demo Borrower','borrower@proximitty.example',true),('lender','Demo Lender','lender@proximitty.example',true)`);
  for(const id of ['a','private'])await db.query("INSERT INTO applications(id,borrower_name,property_name,address,transaction_type,requested_amount,loi_reference,created_at) VALUES($1,'Synthetic','Demo','Address','Refinance',1,'LOI',now())",[id]);
  await db.query("INSERT INTO application_memberships(application_id,user_id,role) VALUES('a','borrower','borrower'),('a','lender','lender'),('private','borrower','borrower')");
  await db.query("INSERT INTO requirements(id,application_id,title,category,purpose,period,owner,applicability,sort_order) VALUES('r','a','Rent roll','Property','Evidence','Current','Borrower','Required',1)");
  await start('1');
  const session=await (await request('/api/session')).json();assert.equal(session.userId,'borrower');assert.equal(session.demoMode,true);assert.equal(session.demoRole,'borrower');
  const landing=await request('/');assert.equal(landing.status,200);assert(!landing.url.includes('/login'));
  const login=await request('/login');assert.equal(login.status,200);assert(!login.url.includes('/login'),'demo login route redirects away');
  assert.equal((await request('/borrower/a')).status,200);
  assert.equal((await request('/api/lender?applicationId=a')).status,403);
  assert.equal((await request('/api/demo/role')).status,405,'no unsafe GET switch');
  assert.equal((await post('/api/demo/role',{role:'admin'})).status,400);
  assert.equal((await post('/api/demo/role',{role:'lender',userId:'someone'})).status,400);
  assert.equal((await post('/api/demo/role',{role:'lender'},{origin:'https://example.com'})).status,403);
  const externalHostStatus=await new Promise<number|undefined>((resolve,reject)=>{httpGet(base+'/api/session',{headers:{host:'example.com'}},r=>{r.resume();resolve(r.statusCode);}).on('error',reject);});
  assert.equal(externalHostStatus,403,'nonlocal Host cannot enable demo');
  assert.equal((await request('/api/session',{headers:{cookie:'proximity_demo_role=admin'}})).status,400);
  const form=new FormData();form.set('file',new File(['Property,Tenant\nDemo,Test\n'],'draft.csv',{type:'text/csv'}));form.set('requirementId','r');
  const upload=await request('/api/documents?applicationId=a',{method:'POST',headers:{origin:base},body:form});assert.equal(upload.status,201,await upload.clone().text());const doc=(await upload.json()).id;
  const switched=await switchRole('lender','a');assert.equal(switched.redirectTo,'/lender/review?applicationId=a');assert.equal((await (await request('/api/session')).json()).userId,'lender');
  assert.equal((await request('/api/documents/'+doc+'?applicationId=a')).status,404,'role switch cannot expose unsent draft');
  assert.deepEqual((await (await request('/api/lender?applicationId=a')).json()).documents,[]);
  assert.equal((await request('/borrower/a')).status,404);
  assert.equal((await request('/api/application?applicationId=private')).status,404);
  assert.equal((await switchRole('lender','private')).redirectTo,'/lender','inaccessible selection falls back safely');
  assert.equal((await switchRole('borrower','a')).redirectTo,'/borrower/a');
  const draft=await (await request('/api/application?applicationId=a')).json();
  const sent=await post('/api/applications/a/submit',{idempotencyKey:randomUUID(),expectedRevision:draft.draft.revision,expectedContentRevision:draft.draft.contentRevision});assert.equal(sent.status,200,await sent.clone().text());
  await switchRole('lender','a');assert.equal((await request('/api/documents/'+doc+'?applicationId=a')).status,200,'sent evidence available in lender role');
  await db.query("UPDATE \"user\" SET email='temporarily-missing@example.test' WHERE id='lender'");
  assert.equal((await request('/api/session')).status,503,'no arbitrary identity fallback if seed missing');
  await db.query("UPDATE \"user\" SET email='lender@proximitty.example' WHERE id='lender'");
  await stop();await start('0');
  assert.equal((await request('/api/session')).status,401,'demo cookie does not authenticate normal mode');
  assert.equal((await post('/api/demo/role',{role:'borrower'})).status,404);
  assert((await request('/')).url.includes('/login'),'normal mode still requires login');
  console.log('PASS: no-cookie demo entry/login redirect, fixed role switch, selected-app isolation, draft publication boundary, malformed/cross-origin/nonlocal guards, missing seed fail-closed, disabled mode normal auth.');
 }finally{await stop();await db.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();await rm(root,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e instanceof Error?e.stack:'Demo integration failed');process.exitCode=1;});
