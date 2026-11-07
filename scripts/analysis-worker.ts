import './env';
import { randomUUID } from 'node:crypto';
import { pool } from '../lib/db';
import { PostgresJobRepository } from '../lib/jobs/postgres';
import { createAnalysisPreparer } from '../lib/backend/prepare-analysis';
import { DEFAULT_BUDGET } from '../lib/backend/provider-executor';
import { mastraTransport } from '../lib/backend/mastra-transport';
import { runAnalysisWorker } from '../workers/analysis-worker';

async function main(){
  const shutdown=new AbortController();
  process.once('SIGTERM',()=>shutdown.abort());process.once('SIGINT',()=>shutdown.abort());
  const repository=new PostgresJobRepository();
  await pool().query('SELECT 1 FROM analysis_jobs LIMIT 0');
  console.log('Analysis worker started. Interactive and background lanes enabled.');
  try{await runAnalysisWorker(randomUUID(),{repository,prepare:createAnalysisPreparer(repository.readEvidence.bind(repository)),transport:mastraTransport,budget:{...DEFAULT_BUDGET,model:process.env.OPENROUTER_MODEL?.trim()||DEFAULT_BUDGET.model},emit:event=>console.log(JSON.stringify(event))},shutdown.signal);}
  finally{await pool().end();}
}
main().catch(()=>{console.error('Analysis worker stopped. Check migrations and local configuration; no secrets logged.');process.exitCode=1;});
