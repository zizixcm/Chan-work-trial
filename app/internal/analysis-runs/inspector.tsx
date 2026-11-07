'use client';
import { useEffect, useState } from 'react';
import type { CapturedText, DebugRun, DebugSummary } from '@/lib/analysis-debug/types';
import styles from './inspector.module.css';

function Capture({label, value}: {label: string; value?: CapturedText}) {
  return <details className={styles.panel} open={label === 'Raw model response'}>
    <summary>{label}</summary>
    {!value ? <p>Not captured.</p> : <>
      <p className={styles.muted}>{value.bytes.toLocaleString()} bytes before clipping
        {value.truncated ? ' · Truncated for diagnostic storage' : ' · Full captured text'}
        {value.redacted ? ' · Credential-like text redacted' : ''}</p>
      <pre>{value.text}</pre>
    </>}
  </details>;
}
export function Inspector({id}: {id?: string}) {
  const [data, setData] = useState<DebugRun | {runs: DebugSummary[]} | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError('');
    void fetch(`/api/internal/analysis-runs${id ? `/${encodeURIComponent(id)}` : ''}`, {cache: 'no-store', signal: controller.signal})
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Could not load analysis diagnostics.');
        setData(body);
      }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not load analysis diagnostics.'); });
    return () => controller.abort();
  }, [id, reload]);
  const run = data && !('runs' in data) ? data : null;
  return <main className={styles.main}>
    <header className={styles.header}>
      <div><a href="/internal/analysis-runs">Developer tools / Analysis runs</a>
        <p><a href="/internal/ai-workflows">Workflow metrics and exports</a></p>
        <h1>{id ? 'Analysis run' : 'Analysis runs'}</h1>
        <p>Private diagnostics · Read only · Retained for up to seven days</p></div>
      <button onClick={() => setReload(value => value + 1)}>Refresh</button>
    </header>
    <p className={styles.notice}>Model responses are untrusted evidence. A validated response is not proof that application changes were committed. No provider calls are made from this screen.</p>
    {error && <p role="alert" className={styles.panel}>{error}</p>}
    {!data && !error && <p role="status">Loading analysis runs…</p>}
    {data && 'runs' in data && <>
      {!data.runs.length ? <section className={styles.panel}><h2>No captured analysis runs</h2><p>Runs appear after a worker uses the diagnostic capture adapter. This screen does not enqueue work or display sample runs.</p></section> : <>
        <p className={styles.muted}>Latest {data.runs.length} runs (up to 200). Refresh to see new results.</p>
        <ul className={styles.list}>{data.runs.map(row => <li key={row.id} className={styles.panel}>
          <a className={styles.runLink} href={`/internal/analysis-runs/${row.id}`}><strong>{row.task}</strong><span>{row.state}</span></a>
          <p>{new Date(row.createdAt).toLocaleString()} · Attempt {row.attempt} · {row.model}</p>
          <p className={styles.muted}>Job {row.jobId}{row.durationMs !== undefined ? ` · ${row.durationMs} ms provider duration` : ''}</p>
        </li>)}</ul>
      </>}
    </>}
    {run && <>
      <section className={styles.panel}><h2>Overview</h2><dl className={styles.facts}>
        {Object.entries({Status: run.state, Task: run.task, Model: run.model, Job: run.jobId, Application: run.applicationId,
          Attempt: run.attempt, 'Prompt version': run.promptVersion, 'Schema version': run.schemaVersion,
          Created: run.createdAt, Updated: run.updatedAt, Expires: run.expiresAt,
          'Provider duration': run.durationMs === undefined ? 'Not recorded' : `${run.durationMs} ms`,
          'Input tokens': run.usage?.inputTokens ?? 'Unknown', 'Output tokens': run.usage?.outputTokens ?? 'Unknown',
          'Outcome code': run.code ?? 'Not recorded'}).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl></section>
      <Capture label="Prepared instructions" value={run.input?.instructions}/>
      <Capture label="Prepared input" value={run.input?.prompt}/>
      <Capture label="Output schema sent to provider" value={run.input?.schema}/>
      <Capture label="Raw model response" value={run.response}/>
      <Capture label="Parsed JSON" value={run.parsed}/>
      <section className={styles.panel}><h2>Validation</h2><p>{run.validation?.message ?? 'Validation has not been recorded.'}</p><p className={styles.muted}>{run.validation?.status}</p></section>
      <Capture label="Validated output" value={run.validated}/>
      <section className={styles.panel}><h2>Application outcome</h2>
        <p>{run.state === 'applied' ? 'The integration reported a successful fenced commit.' : run.state === 'discarded' ? 'The integration reported that the result was not committed. The repository may have rejected stale evidence, revoked consent, or a lost lease; see the safe outcome code when available.' : 'No successful application commit is recorded.'}</p>
        {!run.appliedChanges && <p>Detailed change receipt was not provided. Validated output must not be treated as applied changes.</p>}
      </section>
      <Capture label="Applied change receipt" value={run.appliedChanges}/>
    </>}
  </main>;
}
