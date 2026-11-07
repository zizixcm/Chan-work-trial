import './env';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {pool} from '../lib/db';
import {isDebugDeveloper} from '../lib/analysis-debug/access';
import {workflowMetrics,metricsCsv} from '../lib/analysis-metrics/data';
async function main(){
 const arg=(name:string)=>process.argv.find(v=>v.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
 const userId=arg('user')||process.env.ANALYSIS_DEBUG_USER_IDS?.split(',').map(v=>v.trim()).find(Boolean)||'';
 if(!isDebugDeveloper(userId,process.env.ANALYSIS_DEBUG_USER_IDS))throw Error('Configure an allowlisted developer user before exporting.');
 const days=Number(arg('days')||7);if(![1,7,30].includes(days))throw Error('Use --days=1, 7 or 30.');
 try{
  const report=await workflowMetrics(userId,{days,applicationId:arg('application')});
  const root=path.resolve(process.env.PORTAL_DATA_DIR||'.data','exports');await mkdir(root,{recursive:true,mode:0o700});
  const base=path.join(root,`ai-workflows-${Date.now()}-${randomUUID().slice(0,8)}`);
  await writeFile(base+'.json',JSON.stringify(report,null,2),{flag:'wx',mode:0o600});
  await writeFile(base+'.csv',metricsCsv(report.jobs),{flag:'wx',mode:0o600});
  console.log(JSON.stringify({json:base+'.json',csv:base+'.csv',exportedJobs:report.exportedJobs,totalMatchingJobs:report.totalMatchingJobs,truncated:report.truncated}));
 }finally{await pool().end();}
}
main().catch(()=>{console.error('Metrics export failed. Check developer allowlist, database configuration and filter arguments.');process.exitCode=1;});
