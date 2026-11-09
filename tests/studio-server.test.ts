import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createLocalMastraObservability} from '../lib/evaluation-observability';
import {createPilotStudio} from '../lib/agents/studio-server';
test('native Studio exposes agent configs and traces but cannot bypass the metered controller',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'studio-test-')),observer=await createLocalMastraObservability({directory});
 try{
  const app=await createPilotStudio(observer,4111);
  const request=(path:string,method='GET',host='127.0.0.1:4111')=>app.request(`http://${host}${path}`,{method,headers:{host}});
  const agents=await (await request('/api/agents')).json();
  assert(agents['borrower-preparation']);assert(agents['document-investigation']);
  const html=await (await request('/')).text();assert(html.includes('Mastra Studio'));assert(!html.includes('%%MASTRA'));
  assert.equal((await request('/api/agents/borrower-preparation/generate','POST')).status,403);
  assert.equal((await request('/api/agents','GET','attacker.example')).status,403);
  assert.equal((await request('/api/observability/scores','POST')).status,403);
  // Native read-only POST query passes our boundary (SDK rejects its missing body).
  assert.notEqual((await request('/api/observability/traces/query/fields','POST')).status,403);
  const {trace}=await observer.runOperation('e2e',{caseId:'offline-studio'},async()=>true);
  await observer.recordScore(trace,{scorerId:'offline-check',scorerVersion:'1',score:1});
  await observer.flush();
  assert((await observer.readTrace(trace))!.spans.length);
 }finally{await observer.close();await rm(directory,{recursive:true,force:true});}
});
