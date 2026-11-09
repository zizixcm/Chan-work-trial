// Equivalent full checks for an isolated frozen candidate; never stops a server.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
const candidate = path.resolve(process.argv[2] || '');
const manifest = JSON.parse(readFileSync(path.join(candidate, 'candidate.json'), 'utf8'));
if (candidate === path.resolve(manifest.source) || candidate === process.cwd()) throw new Error('Refusing shared source build');
const nodeCwds = execFileSync('lsof', ['-a','-c','node','-d','cwd','-Fn'], {encoding:'utf8'});
if (nodeCwds.split('\n').includes('n'+candidate)) throw new Error('A Node process owns this candidate; coordinate stopping only that candidate before build');
const localEnv = readFileSync(path.join(candidate, '.env.local'), 'utf8');
const databaseUrl=new URL(localEnv.match(/^DATABASE_URL=(.*)$/m)?.[1]||'invalid:');
if(databaseUrl.hostname!=='127.0.0.1'||databaseUrl.port!=='5434'||databaseUrl.pathname!=='/preview')throw new Error('Expected isolated preview database');
if(databaseUrl.search && !/^-c search_path=preview_v[0-9]+$/.test(databaseUrl.searchParams.get('options')||''))throw new Error('Unexpected preview schema configuration');
if (!/^OPENROUTER_API_KEY=$/m.test(localEnv)) throw new Error('Checks require an empty provider key');
const out = path.join(candidate, 'verification'); mkdirSync(out, {recursive:true});
// Synthetic-only suite admission limits; these never authorize provider spend.
const env = {...process.env, OPENROUTER_API_KEY:'', AI_SMOKE_REAL:'0', AI_DAILY_BUDGET_USD:'1', AI_APPLICATION_DAILY_BUDGET_USD:'0.5', PORTAL_TEST_BUILD_DIR:candidate};
const steps = [
 ['quick',['run','test:agent']],
 ['build',['run','build','--','--webpack']],
 ['http',['run','test:integration']],
 ['jobs',['run','test:jobs-integration']],
 ['workflow',['run','test:workflow-integration']],
 ['chat',['run','test:chat-integration']],
 ['ai-complete',['run','test:ai-integration']],
 ['ai-missing',['run','test:ai-integration']],
];
const results=[];
for (const [name,args] of steps) {
 let output='';
 const exitCode=await new Promise((resolve,reject)=>{
  const child=spawn('npm',args,{cwd:candidate,env:{...env,AI_SMOKE_CASE:name==='ai-missing'?'missing-rent':'complete'},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',v=>output+=v); child.stderr.on('data',v=>output+=v);
  child.once('error',reject); child.once('exit',resolve);
 });
 writeFileSync(path.join(out,name+'.log'),output);
 results.push({name,command:['npm',...args].join(' '),exitCode});
 writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));
 console.log(name+': '+(exitCode===0?'PASS':'FAIL'));
 if(exitCode!==0){process.exitCode=1;break;}
}
