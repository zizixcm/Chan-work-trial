// Prepare a frozen, synthetic local preview without touching existing servers/data.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import path from 'node:path';
const source = process.cwd();
const destination = process.argv[2];
const dependencies = process.argv[3];
if (!destination || !dependencies || !path.isAbsolute(destination) || existsSync(destination)) throw new Error('Usage: node scripts/prepare-isolated-preview.mjs <new absolute destination> <dependency checkout>');
for (const port of [3101, 5434]) await new Promise((resolve,reject)=>{ const server=createServer(); server.once('error',reject); server.listen(port,'127.0.0.1',()=>server.close(resolve)); });
const lock=readFileSync(path.join(source,'package-lock.json'));
if (!lock.equals(readFileSync(path.join(dependencies,'package-lock.json')))) throw new Error('Dependency lock mismatch');
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:source}).toString().split('\0').filter(f=>f && !f.startsWith('artifacts/') && f!=='.DS_Store');
mkdirSync(destination,{recursive:true,mode:0o700});
const manifest={source,head:execFileSync('git',['rev-parse','HEAD'],{cwd:source}).toString().trim(),createdAt:new Date().toISOString(),files:{}};
for(const file of [...new Set(files)].sort()) { const bytes=readFileSync(path.join(source,file)); const target=path.join(destination,file); mkdirSync(path.dirname(target),{recursive:true}); copyFileSync(path.join(source,file),target); manifest.files[file]=createHash('sha256').update(bytes).digest('hex'); }
writeFileSync(path.join(destination,'candidate.json'),JSON.stringify(manifest,null,2));
execFileSync('cp',['-cR',path.join(dependencies,'node_modules'),path.join(destination,'node_modules')]);
const password=randomBytes(24).toString('hex');
const data=path.join(destination,'.data'); mkdirSync(data,{mode:0o700});
writeFileSync(path.join(destination,'.env.local'),`DATABASE_URL=postgresql://preview:${password}@127.0.0.1:5434/preview\nBETTER_AUTH_SECRET=${randomBytes(32).toString('hex')}\nBETTER_AUTH_URL=http://localhost:3101\nPORTAL_DATA_DIR=${data}\nBORROWER_CONVERSATION_UPLOADS=1\nBORROWER_GROUNDED_RETRIEVAL=1\nOPENROUTER_API_KEY=\nAI_SMOKE_REAL=0\nNEXT_TELEMETRY_DISABLED=1\n`,{mode:0o600});
writeFileSync(path.join(data,'postgres.env'),`POSTGRES_USER=preview\nPOSTGRES_PASSWORD=${password}\nPOSTGRES_DB=preview\n`,{mode:0o600});
writeFileSync(path.join(data,'local-accounts.json'),JSON.stringify(['borrower','lender'].map(role=>({email:`${role}@proximitty.example`,name:`Synthetic preview ${role}`,role,password:randomBytes(18).toString('base64url')})),null,2),{mode:0o600});
console.log(JSON.stringify({destination,web:'http://localhost:3101',databasePort:5434,fileCount:Object.keys(manifest.files).length,workers:'none; no provider credentials'}));
