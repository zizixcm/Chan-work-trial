import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const bundled='/Applications/Docker.app/Contents/Resources/bin/docker';
const binary=existsSync(bundled)?bundled:'docker';
const result=spawnSync(binary,['compose','--env-file','.env.local',...process.argv.slice(2)],{stdio:'inherit',env:{...process.env,PATH:existsSync(bundled)?'/Applications/Docker.app/Contents/Resources/bin:'+process.env.PATH:process.env.PATH}});
if(result.error) console.error('Docker is unavailable. Install/start Docker Desktop, then retry.');
process.exit(result.status ?? 1);
