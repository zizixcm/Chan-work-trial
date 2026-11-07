'use client';
import {useEffect,useState} from 'react';
import type {workflowMetrics} from '@/lib/analysis-metrics/data';
import styles from './dashboard.module.css';
type Report=Awaited<ReturnType<typeof workflowMetrics>>;
const duration=(ms:number|null)=>ms===null?'Not recorded':ms<1000?`${Math.round(ms)} ms`:ms<60000?`${(ms/1000).toFixed(1)} s`:`${(ms/60000).toFixed(1)} min`;
const money=(value:number)=>`$${value.toFixed(4)}`;
export function Dashboard(){
 const [days,setDays]=useState('7'),[task,setTask]=useState(''),[applicationId,setApplicationId]=useState(''),[filterApp,setFilterApp]=useState(''),[refresh,setRefresh]=useState(0),[auto,setAuto]=useState(false);
 const [report,setReport]=useState<Report|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const query=new URLSearchParams({days,...(task?{task}:{}),...(filterApp?{applicationId:filterApp}:{})}).toString();
 useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');setReport(null);
  fetch(`/api/internal/ai-workflows?${query}`,{cache:'no-store',signal:controller.signal}).then(async r=>{const value=await r.json();if(!r.ok)throw Error(value.error||'Could not load metrics');setReport(value);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();
 },[query,refresh]);
 useEffect(()=>{if(!auto)return;const timer=setInterval(()=>setRefresh(x=>x+1),30000);return()=>clearInterval(timer);},[auto]);
 const s=report?.summary;
 return <main className={styles.main}>
  <header className={styles.header}><div><a href="/internal/analysis-runs">Developer tools / Analysis runs</a><h1>AI workflow visibility</h1><p>Operational metadata from the durable queue. No document text is exported.</p></div><button onClick={()=>setRefresh(x=>x+1)} disabled={loading}>Refresh</button></header>
  <form className={styles.filters} onSubmit={e=>{e.preventDefault();setFilterApp(applicationId.trim());}}>
   <label>Window<select value={days} onChange={e=>setDays(e.target.value)}><option value="1">Last 24 hours</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option></select></label>
   <label>Task<select value={task} onChange={e=>setTask(e.target.value)}><option value="">All tasks</option><option value="match_document.v1">Document matching</option><option value="verify_requirement.v1">Requirement assessment</option></select></label>
   <label>Application ID<input value={applicationId} onChange={e=>setApplicationId(e.target.value)} placeholder="All authorized applications" maxLength={160}/></label><button type="submit">Apply</button>
   <label className={styles.check}><input type="checkbox" checked={auto} onChange={e=>setAuto(e.target.checked)}/>Refresh every 30 seconds</label>
  </form>
  {error&&<p role="alert" className={styles.notice}>{error}</p>}{loading&&<p role="status">Loading workflow metrics…</p>}
  {report&&s&&<>
   <div className={styles.exports}><span>{report.exportedJobs.toLocaleString()} jobs · Updated {new Date(report.generatedAt).toLocaleString()}</span><a href={`/api/internal/ai-workflows?${query}&download=1`}>Download JSON + timelines</a><a href={`/api/internal/ai-workflows?${query}&format=csv`}>Download CSV</a></div>
   {report.truncated&&<p className={styles.notice}>Showing/exporting the newest {report.limit} of {report.totalMatchingJobs} matching jobs. All statistics below use this sample. Narrow the window or application filter for complete coverage.</p>}
   {!s.jobs&&<section className={styles.panel}><h2>No workflows in this selection</h2><p>Choose another time window or upload a supported document. This page does not start model calls. Metrics do not require raw diagnostic capture.</p></section>}
   <section className={styles.cards} aria-label="Workflow summary">{[
    ['Jobs',String(s.jobs)],['Pending in selection',String(s.pending)],['Oldest pending',duration(s.oldestPendingMs)],['Jobs with provider retries',String(s.retriedJobs)],['Known token cost',money(s.knownCostUsd)],['Unknown cost ceiling',money(s.unknownReservedUsd)]
   ].map(([label,value])=><div className={styles.card} key={label}><span>{label}</span><strong>{value}</strong></div>)}</section>
   <section className={styles.panel}><h2>How long jobs take</h2><div className={styles.scroll}><table><thead><tr><th>Measurement</th><th>Samples</th><th>p50</th><th>p95</th><th>p99</th></tr></thead><tbody>{[
    ['Initial queue wait',s.queueWait],['Terminal job latency',s.terminalLatency],['Evidence preparation',s.preparation],['Model + output validation',s.modelAndValidation]
   ].map(([name,values])=>{const v=values as typeof s.queueWait;return <tr key={String(name)}><td>{String(name)}</td><td>{v.count}</td><td>{duration(v.p50Ms)}</td><td>{duration(v.p95Ms)}</td><td>{duration(v.p99Ms)}</td></tr>;})}</tbody></table></div>
   <p className={styles.muted}>Terminal latency includes waiting/retries and all terminal outcomes, not only successes. Pending jobs are excluded. Preparation/model phases are recorded for new worker attempts; missing historical phases are not zero. Model timing includes output validation and only completed responses. These are job timings, not upload-to-final-requirement latency.</p></section>
   <div className={styles.columns}><section className={styles.panel}><h2>Outcomes</h2>{Object.entries(s.outcomes).map(([state,count])=><div className={styles.outcome} key={state}><span>{state}</span><div className={styles.track}><div style={{width:`${count/Math.max(1,s.jobs)*100}%`}}/></div><strong>{count}</strong></div>)}<p className={styles.muted}>Succeeded means the job committed. It does not guarantee its assessment is still current or that a requirement is fulfilled.</p></section>
   <section className={styles.panel}><h2>Usage and exports</h2><p>{s.inputTokens.toLocaleString()} known input tokens · {s.outputTokens.toLocaleString()} known output tokens</p><p>{s.unknownUsageAttempts} attempts have incomplete usage. Unknown charges remain reserved; they are not counted as free.</p><p>JSON includes metadata, summary statistics and each job’s event timeline. CSV provides one row per job. Both exports use the current filters and authorization, capped at 2,000 jobs.</p><p className={styles.muted}>Read API: <code>/api/internal/ai-workflows</code>. Requires your signed-in session and developer access.</p></section></div>
   <section className={styles.panel}><h2>Daily volume · UTC creation date</h2><div className={styles.scroll}><table><thead><tr><th>Date</th><th>Jobs created</th><th>Now succeeded</th><th>Now failed / exhausted / expired</th></tr></thead><tbody>{Object.entries(s.days).sort(([a],[b])=>b.localeCompare(a)).map(([date,v])=><tr key={date}><td>{date}</td><td>{v.jobs}</td><td>{v.succeeded}</td><td>{v.failed}</td></tr>)}</tbody></table></div></section>
   <section className={styles.panel}><h2>Recent jobs</h2><p className={styles.muted}>Latest 100 shown; downloads include all {report.exportedJobs} selected jobs. Expand a job for its timeline.</p>{report.jobs.slice(0,100).map(job=><details className={styles.job} key={job.id}><summary><strong>{job.task==='match_document.v1'?'Match document':'Assess requirement'}</strong><span>{job.state}</span><span>{new Date(job.createdAt).toLocaleString()}</span></summary><dl><dt>Job</dt><dd>{job.id}</dd><dt>Application</dt><dd>{job.applicationId}</dd><dt>Model / prompt</dt><dd>{job.model} / {job.version}</dd><dt>Attempts / provider calls</dt><dd>{job.attempts} / {job.providerAttempts}</dd><dt>Outcome code</dt><dd>{job.safeCode||'None'}</dd></dl><ol>{job.events.map((e,i)=><li key={i}>{new Date(e.at).toLocaleString()} · {e.event} · lease {e.token}</li>)}</ol></details>)}</section>
  </>}
 </main>;
}
