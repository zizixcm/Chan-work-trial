import '../scripts/env';
import {Pool} from 'pg';
import {betterAuth} from 'better-auth';
import {randomUUID} from 'node:crypto';
import {mkdtemp,readFile,readdir,rm,mkdir,writeFile} from 'node:fs/promises';
import {spawn,type ChildProcess} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {runAnalysisWorker} from '../workers/analysis-worker';
import {createAnalysisPreparer} from '../lib/backend/prepare-analysis';
import {DEFAULT_BUDGET,type ProviderTransport} from '../lib/backend/provider-executor';
import {mastraTransport} from '../lib/backend/mastra-transport';

async function main(){
 const originalUrl=process.env.DATABASE_URL!;
 const admin=new Pool({connectionString:originalUrl});
 const schema='ai_'+randomUUID().replaceAll('-','');
 const url=new URL(originalUrl);url.searchParams.set('options','-c search_path='+schema+',public');
 process.env.DATABASE_URL=url.toString();
 const root=await mkdtemp(path.join(os.tmpdir(),'proximity-ai-'));process.env.PORTAL_DATA_DIR=root;
 process.env.ANALYSIS_DEBUG_CAPTURE='1';
 const database=new Pool({connectionString:url.toString()});
 const probe=createServer().listen(0,'127.0.0.1');await once(probe,'listening');const address=probe.address();assert(address&&typeof address!=='string');const port=address.port;await new Promise<void>(resolve=>probe.close(()=>resolve()));
 const base=`http://127.0.0.1:${port}`;const password=randomUUID()+'Aa1!';
 let server:ChildProcess|undefined;let worker:Promise<void>|undefined;const shutdown=new AbortController();
 let calls=0;let privateDocumentId:string|undefined;
 const real=process.env.AI_SMOKE_REAL==='1';
 if(!real)process.env.OPENROUTER_API_KEY='synthetic-admission-only-no-provider-call';
 const transport:ProviderTransport={async generate(args){calls++;if(calls>5)throw new Error('Smoke call cap reached');if(real)return mastraTransport.generate(args);
   if(privateDocumentId)assert(!args.prompt.includes(privateDocumentId),'lender prompt excludes unsent upload');
   const parsed=JSON.parse(args.prompt);const scope=parsed.evidence||parsed;const document=scope.documents[0];const evidence=document?[{documentId:document.id,record:2,column:1,quote:document.records[1].cells[0].value}]:[];
   const checks=(r:{criteria:{id:string}[]})=>r.criteria.map(c=>({criterionId:c.id,state:'met',reason:'Synthetic fixture supports this criterion.',evidence}));
   const result=parsed.evidence?{schemaVersion:'verify.v1',requirementId:scope.requirements[0].id,assessment:'appears_complete',checks:checks(scope.requirements[0]),missingEvidence:[],conflicts:[],limitations:parsed.preparationLimitations}:{schemaVersion:'match.v1',classification:{kind:'rent_roll',reason:'Synthetic table.',evidence},requirements:scope.requirements.map((r:{id:string;criteria:{id:string}[]})=>({requirementId:r.id,relevance:{state:'relevant',reason:'Matching property table.',evidence},checks:checks(r)}))};
   return {text:JSON.stringify(result),usage:{inputTokens:100,outputTokens:100}};
 }};
 async function request(route:string,cookie:string,body?:unknown,method=body?'POST':'GET'){
  return fetch(base+route,{method,headers:{cookie,origin:base,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 }
 async function signIn(email:string){const response=await request('/api/auth/sign-in/email','',{email,password});assert.equal(response.status,200);return response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');}
 try{
  await admin.query(`CREATE SCHEMA ${schema}`);
  for(const file of (await readdir('migrations/postgres')).filter(f=>f.endsWith('.sql')).sort())await database.query(await readFile('migrations/postgres/'+file,'utf8'));
  const auth=betterAuth({database,secret:process.env.BETTER_AUTH_SECRET!,baseURL:base,emailAndPassword:{enabled:true},logger:{disabled:true}});
  const borrower=(await auth.api.signUpEmail({body:{email:'borrower@ai.test',password,name:'Synthetic borrower'}})).user;
  const lender=(await auth.api.signUpEmail({body:{email:'lender@ai.test',password,name:'Synthetic lender'}})).user;
  process.env.ANALYSIS_DEBUG_USER_IDS=lender.id;
  await database.query("INSERT INTO applications(id,borrower_name,property_name,address,transaction_type,requested_amount,loi_reference,created_at) VALUES('ai-app','Synthetic borrower','Demo Plaza','Synthetic address','Refinance',1000,'LOI',now())");
  await database.query("INSERT INTO application_memberships(application_id,user_id,role) VALUES('ai-app',$1,'borrower'),('ai-app',$2,'lender')",[borrower.id,lender.id]);
  await database.query("INSERT INTO requirements(id,application_id,title,category,purpose,period,owner,applicability,sort_order,criteria) VALUES('ai-req','ai-app','Rent roll','Property','Show current tenants and rent','November 2026','Borrower','Required',1,$1)",[['Identifies Demo Plaza as the property','Shows tenants and monthly rent']]);
  await database.query("INSERT INTO requirements(id,application_id,title,category,purpose,period,owner,applicability,sort_order,criteria) VALUES('ai-req2','ai-app','Tenant schedule','Property','Show tenants','November 2026','Borrower','Required',2,$1)",[['Identifies tenant names']]);
  server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{cwd:process.env.PORTAL_TEST_BUILD_DIR||process.cwd(),env:{...process.env,LOCAL_DEMO_MODE:"0",BETTER_AUTH_URL:base},stdio:['ignore','ignore','ignore']});
  for(let i=0;i<100;i++){try{const r=await fetch(base+'/api/application');if(r.status===401)break;}catch{}await new Promise(r=>setTimeout(r,200));}
  const borrowerCookie=await signIn('borrower@ai.test'),lenderCookie=await signIn('lender@ai.test');
  const status=async()=>{const r=await request('/api/applications/ai-app/analysis',borrowerCookie);assert.equal(r.status,200);return r.json();};
  assert.equal((await status()).preference.enabled,false);
  assert.equal((await request('/api/internal/analysis-runs',borrowerCookie)).status,403);
  let r=await request('/api/applications/ai-app/ai-preference',borrowerCookie,{enabled:true,expectedEpoch:(await status()).preference.epoch},'PUT');assert.equal(r.status,200);
  const form=new FormData();form.set('file',new File(['Property,Tenant,Monthly rent,As of date\nDemo Plaza,Synthetic Bakery,3500,2026-11-01\n'],'synthetic-rent-roll.csv',{type:'text/csv'}));
  r=await fetch(base+'/api/documents?applicationId=ai-app',{method:'POST',headers:{cookie:borrowerCookie,origin:base},body:form});assert.equal(r.status,201,await r.clone().text());const upload=await r.json();
  const {PostgresJobRepository}=await import('../lib/jobs/postgres');const repository=new PostgresJobRepository();
  worker=runAnalysisWorker('integration-'+randomUUID(),{repository,prepare:createAnalysisPreparer(repository.readEvidence.bind(repository)),transport,budget:DEFAULT_BUDGET},shutdown.signal);
  async function waitFor(predicate:(s:any)=>boolean){for(let i=0;i<180;i++){const s=await status();if(predicate(s))return s;if(s.jobs.some((j:any)=>['failed','dead_letter','blocked'].includes(j.state))){const {LocalDebugStore}=await import('../lib/analysis-debug/store');const store=new LocalDebugStore(path.join(root,'analysis-debug'));const runs=await store.list();await mkdir('artifacts/ai-smoke',{recursive:true});await writeFile('artifacts/ai-smoke/last-failure.json',JSON.stringify(await Promise.all(runs.map(run=>store.get(run.id))),null,2));throw new Error('Analysis failed: '+s.jobs.map((j:any)=>j.state+':'+j.safeCode).join(',')+'; synthetic diagnostic saved in artifacts/ai-smoke/last-failure.json');}await new Promise(r=>setTimeout(r,500));}throw new Error('Timed out waiting for analysis');}
  const completed=await waitFor(s=>['ai-req','ai-req2'].every(id=>s.jobs.some((j:any)=>j.task==='verify_requirement.v1'&&j.targetId===id&&j.state==='succeeded'&&j.freshness==='current')));
  for(const id of ['ai-req','ai-req2']){
    assert(completed.links.some((l:any)=>l.documentId===upload.id&&l.requirementId===id&&l.origin==='model'),'unassigned upload can match multiple requirements');
    const assessment=completed.jobs.find((j:any)=>j.task==='verify_requirement.v1'&&j.targetId===id&&j.state==='succeeded'&&j.freshness==='current');assert(assessment.ownedByCurrentUser);assert.equal(assessment.consentScope,'borrower');assert.equal(assessment.result.schemaVersion,'verify.v1');assert.equal(assessment.result.assessment,'appears_complete');
  }
  const snapshot=await (await request('/api/application?applicationId=ai-app',borrowerCookie)).json();const req=snapshot.requirements[0];
  r=await request('/api/requirements/ai-req/verify-completeness?applicationId=ai-app',borrowerCookie,{idempotencyKey:randomUUID(),expectedDefinitionRevision:req.definition_revision,expectedEvidenceRevision:req.evidence_revision});assert.equal(r.status,202);
  r=await request('/api/applications/ai-app/submit',borrowerCookie,{idempotencyKey:randomUUID(),expectedRevision:snapshot.draft.revision,expectedContentRevision:snapshot.draft.contentRevision});assert.equal(r.status,200,await r.clone().text());const sent=(await r.json()).submission;
  const personal=(await status()).preference;
  r=await request('/api/ai/preference?applicationId=ai-app',borrowerCookie,{enabled:false,expectedEpoch:personal.epoch},'PUT');assert.equal(r.status,200);
  const privateForm=new FormData();privateForm.set('file',new File(['Property,Tenant,Monthly rent,As of date\nPrivate Draft,Private Tenant,9999,2026-11-02\n'],'private-draft.csv',{type:'text/csv'}));
  r=await fetch(base+'/api/documents?applicationId=ai-app',{method:'POST',headers:{cookie:borrowerCookie,origin:base},body:privateForm});assert.equal(r.status,201);privateDocumentId=(await r.json()).id;
  assert.equal((await request('/api/documents/'+privateDocumentId,lenderCookie)).status,404);
  r=await request('/api/requirements/ai-req/verify-completeness?applicationId=ai-app',lenderCookie,{idempotencyKey:randomUUID(),expectedSubmissionId:sent.id,expectedDefinitionRevision:req.definition_revision,expectedEvidenceRevision:req.evidence_revision});assert.equal(r.status,202,await r.clone().text());
  await waitFor(s=>s.jobs.every((j:any)=>!['queued','running','retry_wait'].includes(j.state)));
  const diagnostics=await request('/api/internal/analysis-runs',lenderCookie);assert.equal(diagnostics.status,200);const visibleRuns=(await diagnostics.json()).runs;assert(visibleRuns.length>0);assert(visibleRuns.every((run:any)=>run.task==='verify_requirement.v1'));
  const {LocalDebugStore}=await import('../lib/analysis-debug/store');const captured=await new LocalDebugStore(path.join(root,'analysis-debug')).list();const draftRun=captured.find(run=>run.task==='match_document.v1');assert(draftRun);assert.equal((await request('/api/internal/analysis-runs/'+draftRun.id,lenderCookie)).status,404,'direct diagnostic draft trace denied');
  assert.equal((await request('/internal/analysis-runs',lenderCookie)).status,200);
  const pref=(await status()).preference;
  r=await request('/api/applications/ai-app/ai-preference',borrowerCookie,{enabled:false,expectedEpoch:pref.epoch},'PUT');assert.equal(r.status,200);
  const before=calls;r=await request(`/api/documents/${upload.id}/coverage-analysis?applicationId=ai-app`,borrowerCookie,{idempotencyKey:randomUUID()});assert(r.status>=400);assert.equal(calls,before);
  console.log(JSON.stringify({ok:true,provider:real?'real OpenRouter':'simulated',providerCalls:calls,checks:['authenticated upload','background match','AI link provenance','multi-requirement aggregate verification and current borrower result DTO','borrower and lender Verify','developer inspector authorization','AI off gate','submitted-only lender prompt','unsent document and diagnostic URL denial']}));
 }finally{
  shutdown.abort();await worker?.catch(()=>{});
  if(server&&server.exitCode===null){const stopped=once(server,'exit');server.kill('SIGTERM');await stopped;}
  const {pool}=await import('../lib/db');await pool().end();await database.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();await rm(root,{recursive:true,force:true});
 }
}
main().catch(error=>{console.error(error instanceof Error?error.message:'AI integration failed');process.exitCode=1;});
