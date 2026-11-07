'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Requirement } from '@/lib/model';
import styles from './ai-review.module.css';

type Job = {id:string;consentScope?:'borrower'|'lender';ownedByCurrentUser?:boolean;task:string;state:string;requirementId?:string;documentId?:string;message?:string;result?:unknown;freshness?:string;revision?:string;canCancel?:boolean;canRetry?:boolean};
type State = {preference:{enabled:boolean;epoch:string};jobs:Job[];links?:Array<{documentId:string;requirementId:string;origin:string}>};
const active = new Set(['queued','running','retry_wait']);
const labels:Record<string,string>={queued:'Waiting to check',running:'Checking documents',retry_wait:'Waiting to retry',succeeded:'Check finished',failed:'Could not complete check',blocked:'Checks unavailable',stale:'Documents changed; check again',cancelled:'Check cancelled',expired:'Check interrupted; try again',dead_letter:'Check failed; try again'};

export default function AiReview({applicationId,requirement,borrower=false,onUpdated,compact=false,submissionId}:{applicationId:string;requirement?:Requirement;borrower?:boolean;onUpdated?:()=>unknown;compact?:boolean;submissionId?:string}) {
  const [state,setState]=useState<State|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const updated=useRef(onUpdated); updated.current=onUpdated;
  const lastCompleted=useRef<string|null>(null);
  const load=useCallback(async()=>{
    const response=await fetch(`/api/applications/${encodeURIComponent(applicationId)}/analysis`,{cache:'no-store'});
    const body=await response.json(); if(!response.ok)throw new Error(body.error||'Could not load AI checks.');
    setState(body);
    const fingerprint=body.jobs.filter((j:Job)=>j.state==='succeeded').map((j:Job)=>j.id).join(',');
    if(lastCompleted.current!==null&&lastCompleted.current!==fingerprint)void updated.current?.();
    lastCompleted.current=fingerprint;
  },[applicationId]);
  useEffect(()=>{let stopped=false;let timer:ReturnType<typeof setTimeout>;
    const tick=async()=>{if(!stopped&&document.visibilityState!=='hidden'){try{await load();setError('');}catch(e){if(!stopped)setError(e instanceof Error?e.message:'Could not load checks.');}}if(!stopped)timer=setTimeout(tick,4000);};
    void tick();return()=>{stopped=true;clearTimeout(timer);};
  },[load]);
  async function command(url:string,method:string,body:unknown){setBusy(true);setError('');try{
    const response=await fetch(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const value=await response.json();if(!response.ok)throw new Error(value.error||'Could not start the check.');await load();
  }catch(e){setError(e instanceof Error?e.message:'Please try again.');}finally{setBusy(false);}}
  const jobs=(state?.jobs||[]).filter(j=>j.ownedByCurrentUser === true && (j.consentScope || 'borrower') === (borrower ? 'borrower' : 'lender') && (!requirement||j.requirementId===requirement.id));
  const current=jobs[0];
  const output=current?.result as {value?:unknown;assessment?:string;checks?:Array<{criterionId:string;state:string;reason:string;evidence?:Array<{documentId:string;record:number;column:number;quote:string}>}>;missingEvidence?:string[];limitations?:string[];conflicts?:Array<{reason:string}>}|undefined;
  const result=(output?.value||output) as typeof output;
  return <section className={compact ? styles.compact : styles.panel} aria-label={requirement?'AI requirement assessment':'AI assistance'}>
    <div className={styles.heading}><strong>{requirement?'AI assessment':'AI assistance'}</strong>
      {!requirement&&borrower&&state&&<label><input type="checkbox" checked={state.preference.enabled} disabled={busy} onChange={e=>void command(`/api/ai/preference?applicationId=${encodeURIComponent(applicationId)}`,'PUT',{enabled:e.target.checked,expectedEpoch:state.preference.epoch})}/> AI mode for my uploads</label>}
    </div>
    {!requirement&&<p>Your personal setting applies across applications. Optional: send supported CSV rent rolls to OpenRouter and its model provider to suggest document links and check requirements. PDF, XLSX and photos remain available for manual review. Turning off stops your automatic checks; it does not change other users’ AI settings. Already-started processing may not be retractable.</p>}
    {borrower&&state&&!state.preference.enabled&&<p>AI checks are off. You can continue uploading and organizing files manually.</p>}
    {requirement&&!borrower&&<p>Uses supported CSV evidence with OpenRouter and its model provider. AI findings support your review; they do not accept the requirement.</p>}
    {requirement&&<button type="button" disabled={busy||!state||(borrower&&!state.preference.enabled)||!!current&&active.has(current.state)} onClick={()=>void command(`/api/requirements/${requirement.id}/verify-completeness?applicationId=${applicationId}`,'POST',{...(submissionId ? {expectedSubmissionId:submissionId} : {}),expectedDefinitionRevision:requirement.definition_revision,expectedEvidenceRevision:requirement.evidence_revision,...(borrower ? {consentEpoch:state?.preference.epoch} : {}),idempotencyKey:crypto.randomUUID()})}>{busy?'Starting…':borrower?'Verify completeness':'Use AI to verify completeness'}</button>}
    {current&&<p role="status">{current.freshness==='stale'?'Documents changed; check again':labels[current.state]||current.state}{current.message?` — ${current.message}`:''}</p>}
    {current&&(current.canCancel||current.canRetry)&&<button type="button" disabled={busy} onClick={()=>void command(`/api/jobs/${current.id}/${current.canCancel?'cancel':'retry'}?applicationId=${applicationId}`,'POST',{expectedJobRevision:current.revision,idempotencyKey:crypto.randomUUID()})}>{current.canCancel?'Cancel check':'Retry check'}</button>}
    {requirement&&state?.links?.filter(link=>link.requirementId===requirement.id&&link.origin==='model').map(link=><p key={link.documentId}><a href={`/api/documents/${link.documentId}?applicationId=${encodeURIComponent(applicationId)}`}>Document</a> · Linked by AI. You can remove an incorrect link in the document list.</p>)}
    {requirement&&result&&<div><strong>{result.assessment==='appears_complete'?'Appears complete':result.assessment==='incomplete'?'Missing information':'Needs review'}</strong><p>This is an AI assessment, not lender acceptance.</p>
      {result.missingEvidence?.map((item,i)=><p key={`missing-${i}`}>Missing: {item}</p>)}
      {result.limitations?.map((item,i)=><p key={`limitation-${i}`}>{item}</p>)}
      {result.conflicts?.map((item,i)=><p key={`conflict-${i}`}>Conflict: {item.reason}</p>)}
      <details><summary>View checks and evidence</summary>{result.checks?.map(check=><div key={check.criterionId}><strong>{check.state==='met'?'Supported':check.state==='unmet'?'Missing':'Uncertain'}</strong><p>{check.reason}</p>{check.evidence?.map((source,i)=><p key={i}><a href={`/api/documents/${encodeURIComponent(source.documentId)}?applicationId=${encodeURIComponent(applicationId)}`}>Source document</a> · row {source.record}, column {source.column}: “{source.quote}”</p>)}</div>)}</details></div>}
    {!requirement&&jobs.length>0&&<details><summary>Recent checks ({jobs.length})</summary>{jobs.slice(0,10).map(job=><p key={job.id}>{job.task==='match_document.v1'?'Document matching':'Requirement check'}: {labels[job.state]||job.state}{job.message?` — ${job.message}`:''}</p>)}</details>}
    {error&&<p role="alert">{error}</p>}
  </section>;
}
