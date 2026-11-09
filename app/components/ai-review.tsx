'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Requirement } from '@/lib/model';
import {assessmentExplanation, failureExplanation, type AssessmentOutput} from '@/lib/analysis-explanation';
import styles from './ai-review.module.css';

type Job = {id:string;consentScope?:'borrower'|'lender';ownedByCurrentUser?:boolean;task:string;state:string;requirementId?:string;documentId?:string;message?:string;result?:unknown;freshness?:string;revision?:string;canCancel?:boolean;canRetry?:boolean;safeCode?:string;updatedAt?:string};
type State = {automaticUploads?:boolean;jobs:Job[];links?:Array<{documentId:string;requirementId:string;origin:string}>};
const labels:Record<string,string>={queued:'Waiting to check',running:'Checking documents',retry_wait:'Waiting to retry',succeeded:'Check finished',failed:'Could not complete check',blocked:'Checks unavailable',stale:'Assessment out of date',cancelled:'Check cancelled',expired:'Check interrupted',dead_letter:'Check failed'};

export default function AiReview({applicationId,requirement,borrower=false,onUpdated,compact=false,submissionId}:{applicationId:string;requirement?:Requirement;borrower?:boolean;onUpdated?:()=>unknown;compact?:boolean;submissionId?:string}) {
  const [retrying,setRetrying]=useState(false);
  const [state,setState]=useState<State|null>(null),[error,setError]=useState('');
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
  const jobs=(state?.jobs||[]).filter(j=>j.ownedByCurrentUser === true && (j.consentScope || 'borrower') === (borrower ? 'borrower' : 'lender') && (!requirement||(j.task==='verify_requirement.v1'&&j.requirementId===requirement.id)));
  const current=jobs[0];
  const output=current?.result as AssessmentOutput|undefined;
  const result=output?.value||output;
  const failed=current&&['failed','dead_letter','blocked','expired'].includes(current.state);
  async function retry(){
    if(!current||retrying)return;
    setRetrying(true);setError('');
    try{
      const response=await fetch(`/api/jobs/${encodeURIComponent(current.id)}/retry?applicationId=${encodeURIComponent(applicationId)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idempotencyKey:crypto.randomUUID()})});
      const body=await response.json();if(!response.ok)throw new Error(body.error||'Could not retry the check.');
      await load();
    }catch(e){setError(e instanceof Error?e.message:'Could not retry the check.');}finally{setRetrying(false);}
  }
  return <section className={compact ? styles.compact : styles.panel} aria-label={requirement?'AI requirement assessment':'AI assistance'}>
    <div className={styles.heading}><strong>{requirement?'AI assessment':'AI assistance'}</strong>
    </div>
    {!requirement&&<p>{borrower?"New supported CSV uploads are checked automatically through OpenRouter and its model provider. PDFs, spreadsheets and photos remain available for manual review.":"Assessments appear here when available. Lender review is separate."}</p>}
    {requirement&&state&&!current&&<p>No AI assessment is available for this requirement yet. Check the linked files; you can continue with manual review.</p>}
    {current&&<p role="status">{current.freshness==='stale'?'Assessment out of date':labels[current.state]||current.state}{current.message?` — ${current.message}`:''}</p>}
    {failed&&<div><p><strong>The check could not finish. This is not a decision that the requirement is unmet.</strong></p><p>{failureExplanation(current.safeCode)}</p></div>}
    {current?.state==='retry_wait'&&<p>{failureExplanation(current.safeCode)} An automatic retry is pending.</p>}
    {current?.canRetry&&<button disabled={retrying} onClick={()=>void retry()}>{retrying?'Requesting check…':'Retry check'}</button>}
    {current&&<details><summary>Diagnostic details</summary><p>Check ID: <code>{current.id}</code></p><p>State: {current.state} · Freshness: {current.freshness||'unknown'}</p>{current.safeCode&&<p>Reason code: <code>{current.safeCode}</code></p>}{current.updatedAt&&<p>Last updated: {current.updatedAt}</p>}</details>}
    {requirement&&state?.links?.filter(link=>link.requirementId===requirement.id&&link.origin==='model').map(link=><p key={link.documentId}><a href={`/api/documents/${link.documentId}?applicationId=${encodeURIComponent(applicationId)}`}>Document</a> · Linked by AI. You can remove an incorrect link in the document list.</p>)}
    {requirement&&result&&<div><strong>{current?.freshness==='stale'?'Previous assessment — outdated':({fulfilled:'Appears fulfilled',partially_fulfilled:'Partially fulfilled',not_fulfilled:'Not fulfilled',unable_to_determine:'Unable to determine'}[result.fulfillment||'']||({appears_complete:'Appears fulfilled',incomplete:'Missing information',unknown:'Unable to determine'}[result.assessment||''])||'Needs review')}</strong><p>This is an AI assessment, not lender acceptance.</p><p><strong>Why:</strong> {assessmentExplanation(result)}</p>
      {result.missingEvidence?.map((item,i)=><p key={`missing-${i}`}>Missing: {item}</p>)}
      {result.limitations?.map((item,i)=><p key={`limitation-${i}`}>{item}</p>)}
      {result.conflicts?.map((item,i)=><p key={`conflict-${i}`}>Conflict: {item.reason}</p>)}
      <details open><summary>Checks and evidence</summary>{result.checks?.map(check=><div key={check.criterionId}><p><strong>{requirement.criteria?.find((_,index)=>`${requirement.id}:criterion:${index+1}`===check.criterionId)||check.criterionId}</strong></p><strong>{check.state==='met'?'Supported':check.state==='unmet'?'Missing':'Uncertain'}</strong><p>{check.reason}</p>{check.evidence?.map((source,i)=><p key={i}><a href={`/api/documents/${encodeURIComponent(source.documentId)}?applicationId=${encodeURIComponent(applicationId)}`}>Source document</a> · {source.sourceLocation||`extracted record ${source.record}, column ${source.column}`}: “{source.quote}”</p>)}</div>)}</details></div>}
    {!requirement&&jobs.length>0&&<details><summary>Recent checks ({jobs.length})</summary>{jobs.slice(0,10).map(job=><p key={job.id}>{job.task==='match_document.v1'?'Document matching':'Requirement check'}: {labels[job.state]||job.state}{job.message?` — ${job.message}`:''}</p>)}</details>}
    {error&&<p role="alert">{error}</p>}
  </section>;
}
