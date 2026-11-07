"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import BatchUpload from "./batch-upload";
import type { ApplicationSnapshot, Requirement } from "@/lib/model";

type Result={assessment?:string;checks?:{state:string}[];limitations?:string[];missingEvidence?:string[];value?:Result};
type Job={id:string;task:string;state:string;freshness:string;ownedByCurrentUser:boolean;consentScope:string;requirementId?:string;documentId?:string;result?:Result;message?:string};
type Analysis={preference:{enabled:boolean;epoch:string};jobs:Job[]};
const active=new Set(["queued","running","retry_wait"]);
function jobLabel(job:Job){return ({queued:"Queued",running:"Checking",retry_wait:"Waiting to retry",blocked:"Check unavailable",failed:"Check failed",dead_letter:"Check failed",cancelled:"Check cancelled",expired:"Check interrupted",stale:"Changed — check again",succeeded:"Matching finished"} as Record<string,string>)[job.state]||"Not checked";}
export default function BulkUploadWorkspace({data,disabled,onBusy,onPendingChange,onUpdated,onDetails}:{data:ApplicationSnapshot;disabled:boolean;onBusy:(busy:boolean)=>void;onPendingChange:(count:number)=>void;onUpdated:()=>Promise<ApplicationSnapshot|undefined>;onDetails:(requirement:Requirement)=>void}) {
  const [analysis,setAnalysis]=useState<Analysis|null>(null),[error,setError]=useState(""),[preferenceError,setPreferenceError]=useState(""),[saving,setSaving]=useState(false);
  const latest=useRef(onUpdated);latest.current=onUpdated;const fingerprint=useRef<string|null>(null);
  const load=useCallback(async()=>{
    const response=await fetch(`/api/applications/${encodeURIComponent(data.application.id)}/analysis`,{cache:"no-store"});const body=await response.json();if(!response.ok)throw new Error(body.error||"Could not load AI status. Your files are still saved.");
    setAnalysis(body);setError("");const next=body.jobs.filter((job:Job)=>job.ownedByCurrentUser&&job.consentScope==="borrower").map((job:Job)=>`${job.id}:${job.state}:${job.freshness}`).join("|");
    if(fingerprint.current!==null&&fingerprint.current!==next)void latest.current().catch(()=>setError("Could not refresh file links. Try refreshing status."));fingerprint.current=next;
  },[data.application.id]);
  useEffect(()=>{let stopped=false;let timer:ReturnType<typeof setTimeout>;async function tick(){try{if(!stopped&&document.visibilityState!=="hidden")await load();}catch(e){if(!stopped)setError(e instanceof Error?e.message:"Could not load status.");}if(!stopped)timer=setTimeout(tick,3000);}void tick();return()=>{stopped=true;clearTimeout(timer);};},[load]);
  async function toggle(){if(!analysis||saving)return;setSaving(true);setPreferenceError("");try{const response=await fetch(`/api/ai/preference?applicationId=${encodeURIComponent(data.application.id)}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({enabled:!analysis.preference.enabled,expectedEpoch:analysis.preference.epoch})});const body=await response.json();if(!response.ok)throw new Error(body.error||"Could not save your AI preference.");await load();}catch(e){setPreferenceError(e instanceof Error?e.message:"Could not save your preference.");}finally{setSaving(false);}}
  const jobs=analysis?.jobs.filter(job=>job.ownedByCurrentUser&&job.consentScope==="borrower")||[];
  const matching=jobs.some(job=>job.task==="match_document.v1"&&active.has(job.state));
  function status(requirement:Requirement){
    const files=data.documents.filter(doc=>doc.requirement_ids.includes(requirement.id));
    const job=jobs.find(job=>job.task==="verify_requirement.v1"&&job.requirementId===requirement.id);
    if(requirement.collection==="lender")return {label:"Lender / provider item",icon:"—",tone:"neutral"};
    if(error)return {label:"Status unavailable",icon:"!",tone:"warning"};
    if(!analysis)return {label:"Loading status",icon:"…",tone:"neutral"};
    if(job){
      if(job.freshness!=="current")return {label:"Changed — check again",icon:"↻",tone:"neutral"};
      if(job.state!=="succeeded")return {label:jobLabel(job),icon:active.has(job.state)?"◷":"!",tone:active.has(job.state)?"pending":"warning"};
      const result=job.result?.value||job.result;
      if(result?.assessment==="appears_complete")return {label:"AI: appears complete",icon:"✓",tone:"complete"};
      if(result?.assessment==="incomplete")return {label:result.checks?.some(check=>check.state==="met")?"AI: partly complete":"AI: missing information",icon:"◐",tone:"warning"};
      return {label:"AI: needs review",icon:"?",tone:"warning"};
    }
    if(!files.length)return {label:matching?"Matching files…":"Missing files",icon:matching?"◷":"○",tone:"neutral"};
    if(files.every(doc=>doc.content_type.split(';')[0].trim()!=="text/csv"))return {label:"Manual review needed",icon:"—",tone:"neutral"};
    return {label:analysis.preference.enabled?"Not checked":"Not checked · AI off",icon:"○",tone:"neutral"};
  }
  return <div className="bulk-workspace"><section className="bulk-upload-column"><h2>Upload your documents</h2><p>Drop several files together. You can organize them into requirements later.</p>
    <BatchUpload mapping={<><div className="bulk-ai-option"><label><input type="checkbox" role="switch" checked={analysis?.preference.enabled===true} disabled={!analysis||saving||disabled} onChange={toggle}/> AI for my uploads</label><details><summary>How it works</summary><p>This is your personal preference across applications. New CSV uploads are sent to OpenRouter and its model provider to match requirements and assess completeness. PDF, XLSX and photos need manual linking and review. Enabling does not check older files; use Check with AI in Organize files. Turning off stops your automatic checks; processing already started may not be retractable.</p></details></div>
    <p className="bulk-format-note">AI checks CSV files. Organize PDFs, spreadsheets and photos manually.</p>
    {preferenceError&&<p role="alert">{preferenceError}</p>}</>} dropzone disabled={disabled} applicationId={data.application.id} batchKey="bulk" requirementId={null} hidden={false} general onBusy={onBusy} onPendingChange={onPendingChange} onLocked={()=>{}} onComplete={async()=>{const snapshot=await onUpdated();await load().catch(e=>setError(e.message));return snapshot;}} onStartNew={()=>{}} />
    {!!data.documents.length&&<details className="bulk-file-processing"><summary>Saved file processing ({data.documents.length})</summary><ul>{data.documents.map(doc=>{const job=jobs.find(job=>job.task==="match_document.v1"&&job.documentId===doc.id);return <li key={doc.id}><strong>{doc.original_name}</strong><span>{job?job.freshness!=="current"?"Changed — check again":jobLabel(job):doc.content_type.split(';')[0].trim()!=="text/csv"?"AI unsupported · organize manually":analysis?.preference.enabled?"Not checked":"Not checked · AI off"}</span></li>;})}</ul></details>}
  </section><aside className="bulk-requirements" aria-label="Requirement assessments"><h2>Requirements</h2><p>Live AI assessments, not lender acceptance.</p>{error&&<p role="alert">{error}<button className="simple-link" onClick={()=>load().catch(e=>setError(e.message))}>Refresh status</button></p>}<div className="requirement-tiles">{data.requirements.map(requirement=>{const state=status(requirement);return <button className={`requirement-tile ${state.tone}`} key={requirement.id} disabled={disabled} onClick={()=>onDetails(requirement)}><strong>{requirement.title}</strong><span><b aria-hidden="true">{state.icon}</b>{state.label}</span></button>;})}</div></aside></div>;
}
