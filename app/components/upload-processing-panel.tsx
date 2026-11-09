"use client";
import {useEffect,useId,useRef,useState} from "react";
import type {BatchJob,BatchProcessingStatus,BatchStatusMember} from "@/lib/jobs/batch-status";
import type {MatchResult,VerifyResult} from "@/lib/analysis/types";
import type {ApplicationSnapshot} from "@/lib/model";
import {deriveFulfillment} from "@/lib/analysis/fulfillment";
import styles from "./upload-processing-panel.module.css";

export type ProcessingUpload={sequence:number;files:Array<{id:string;name:string}>;batchIds:string[];error?:string;restored?:boolean};
type BatchStatus={id:string;state:string;members:BatchStatusMember[];processing:BatchProcessingStatus};
type Mark={tone:"pending"|"active"|"passed"|"failed";text:string;detail?:string};
const failureDetail=(code?:string)=>({provider_timeout:"The service timed out.",provider_unavailable:"The service is unavailable.",rate_limited:"The service is busy.",configuration_required:"Service configuration needs attention.",budget_exhausted:"The analysis budget is exhausted.",invalid_output:"The response could not be validated.",input_too_large:"The file was read, but the evidence and checklist exceed the analysis input limit.",unsupported_input:"The analysis input could not be processed.",lease_lost:"Processing was interrupted.",internal_error:"Processing was interrupted."}[code||""]||"No result is available.");
const waiting:Mark={tone:"pending",text:"Waiting"};
function execution(job:BatchJob|null,state=job?.state):Mark|null {
  if(job?.freshness==="stale")return {tone:"pending",text:"Out of date"};
  if(state==="running")return {tone:"active",text:"Checking"};
  if(state==="not_requested")return {tone:"pending",text:"Not checked",detail:"No matching check has been requested for this saved file."};
  if(["queued","waiting_for_upload"].includes(state||""))return waiting;
  if(state==="retry_wait")return {tone:"pending",text:"Retry pending"};
  if(["failed","dead_letter","cancelled","expired","blocked","unsupported","not_saved","removed"].includes(state||""))return {tone:"failed",text:state==="not_saved"?"Not uploaded":state==="removed"?"Removed":state==="blocked"?"Unavailable":state==="unsupported"?"Unsupported":state==="cancelled"?"Cancelled":"Could not finish",detail:failureDetail(job?.safeCode)};
  return null;
}
function validity(member?:BatchStatusMember):Mark {
  if(!member)return waiting;
  const state=member.validity.state;
  return {tone:state==="passed"?"passed":state==="failed"?"failed":state==="checking"?"active":"pending",text:state==="passed"?"Passed":state==="failed"?"Cannot process":state==="checking"?"Reading":state==="unknown"?"Not confirmed":"Waiting",detail:member.validity.message};
}
function matching(member:BatchStatusMember|undefined,documents:ApplicationSnapshot["documents"]):Mark {
  if(!member)return waiting;
  const job=member.matching.job,progress=execution(job,member.matching.state);
  if(progress)return progress;
  if(member.matching.state!=="succeeded")return {tone:"pending",text:"Not confirmed"};
  // A completed model call alone is not a successful assignment. Confirm an
  // actual current association from the authorized application snapshot.
  const raw=job?.result as MatchResult|{value:MatchResult}|undefined;
  const result=raw&&"value" in raw?raw.value:raw;
  const links=documents.find(doc=>doc.id===member.document_id)?.requirement_ids||[];
  const candidates=result?.schemaVersion==="match.v1"?result.requirements:[];
  const assigned=!candidates.some(candidate=>candidate.relevance.state==="ambiguous")&&candidates.some(candidate=>candidate.relevance.state==="relevant"&&links.includes(candidate.requirementId));
  if(assigned&&job?.freshness==="current")return {tone:"passed",text:"Matched"};
  return {tone:"failed",text:"Needs review",detail:"No confirmed match. Link under By file."};
}
function completeness(job:BatchJob|null,settled:boolean):Mark {
  if(!settled)return {tone:"pending",text:"Waiting for files"};
  if(!job)return waiting;
  const progress=execution(job);if(progress)return progress;
  if(job.state!=="succeeded")return waiting;
  const raw=job.result as VerifyResult|{value:VerifyResult}|undefined,result=raw&&"value" in raw?raw.value:raw;
  const fulfillment=result?.schemaVersion==="verify.v1"?deriveFulfillment(result):"unable_to_determine";
  if(fulfillment==="fulfilled")return {tone:"passed",text:"Appears complete"};
  return {tone:"failed",text:fulfillment==="partially_fulfilled"?"Partly complete":fulfillment==="not_fulfilled"?"Missing information":"Needs review"};
}
function StatusMark({label,mark,compact=false}:{label:string;mark:Mark;compact?:boolean}) {
  if(compact)return <span role="img" tabIndex={0} className={`${styles.icon} ${styles[mark.tone]}`} title={`${label}: ${mark.text}`} aria-label={`${label}: ${mark.text}`}><span aria-hidden="true">{mark.tone==="passed"?"✓":mark.tone==="failed"?"!":mark.tone==="active"?"◷":"○"}</span></span>;
  return <span className={`${styles.mark} ${styles[mark.tone]}`} title={mark.detail} aria-label={`${label}: ${mark.text}${mark.detail?`. ${mark.detail}`:""}`}><span aria-hidden="true" className={styles.symbol}>{mark.tone==="passed"?"✓":mark.tone==="failed"?"!":mark.tone==="active"?"◷":"○"}</span><span><span className={styles.markLabel}>{label}</span>{mark.text}{mark.tone==="failed"&&mark.detail&&<small className={styles.detail}>{mark.detail}</small>}</span></span>;
}
export default function UploadProcessingPanel({applicationId,upload,uploading,documents}:{applicationId:string;upload:ProcessingUpload;uploading:boolean;documents:ApplicationSnapshot["documents"]}) {
  const [open,setOpen]=useState(!upload.restored),[batches,setBatches]=useState<BatchStatus[]>([]),[error,setError]=useState("");
  const [refresh,setRefresh]=useState(0),dialog=useRef<HTMLDialogElement>(null),heading=useRef<HTMLHeadingElement>(null),maximize=useRef<HTMLButtonElement>(null);
  const titleId=useId(),key=upload.batchIds.join("|");
  useEffect(()=>{setOpen(!upload.restored);setBatches([]);setError("");},[upload.sequence,upload.restored]);
  useEffect(()=>{
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
    async function poll(){let delay=2000;
      try{if(!key)return;const next=await Promise.all(key.split("|").map(async id=>{const response=await fetch(`/api/upload-batches?id=${encodeURIComponent(id)}&applicationId=${encodeURIComponent(applicationId)}`,{cache:"no-store",signal:controller.signal});const body=await response.json();if(!response.ok)throw new Error(body.error||"Processing status is unavailable.");if(!Array.isArray(body.members)||!body.processing)throw new Error("Processing status is unavailable.");return body as BatchStatus;}));if(!controller.signal.aborted){setBatches(next);setError("");delay=Math.max(1000,Math.min(10000,Math.min(...next.map(batch=>batch.processing.pollAfterMs||2000))));}}
      catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Processing status is unavailable.");}
      finally{if(!controller.signal.aborted&&key)timer=setTimeout(poll,delay);}
    }
    void poll();return()=>{controller.abort();clearTimeout(timer);};
  },[applicationId,key,upload.sequence,refresh]);
  useEffect(()=>{
    if(!open||!dialog.current)return;
    const element=dialog.current,opener=document.activeElement as HTMLElement|null,body=document.body,x=scrollX,y=scrollY;
    const names=["position","top","left","width","overflow","padding-right"],previous=names.map(name=>[name,body.style.getPropertyValue(name),body.style.getPropertyPriority(name)]);
    const gap=innerWidth-document.documentElement.clientWidth,padding=parseFloat(getComputedStyle(body).paddingRight)||0;
    body.style.position="fixed";body.style.top=`-${y}px`;body.style.left=`-${x}px`;body.style.width="100%";body.style.overflow="hidden";if(gap)body.style.paddingRight=`${padding+gap}px`;
    element.showModal();heading.current?.focus({preventScroll:true});
    return()=>{element.close();for(const[name,value,priority]of previous)value?body.style.setProperty(name,value,priority):body.style.removeProperty(name);window.scrollTo({left:x,top:y,behavior:"instant"});requestAnimationFrame(()=>{if(opener?.isConnected&&!opener.hasAttribute("disabled")&&opener.getClientRects().length)opener.focus({preventScroll:true});else maximize.current?.focus({preventScroll:true});});};
  },[open]);
  const members=new Map(batches.flatMap(batch=>batch.members.map(member=>[member.id,member] as const)));
  const files=[...new Map([...upload.files,...batches.flatMap(batch=>batch.members)].map(file=>[file.id,{id:file.id,name:file.name}])).values()];
  const requirements=[...new Map(batches.flatMap(batch=>batch.processing.requirements.map(req=>[req.id,req] as const))).values()];
  const settled=!uploading&&!error&&!upload.error&&upload.files.every(file=>members.has(file.id))&&batches.length===upload.batchIds.length&&batches.length>0&&batches.every(batch=>batch.processing.documentsSettled);
  const phase=error?"Status unavailable":upload.error?"Upload needs attention":uploading?"Uploading files":batches.some(batch=>batch.processing.stage==="attention_required")?"Needs attention":!settled?"Processing files":batches.some(batch=>batch.processing.stage==="checking_requirements")?"Checking requirements":batches.some(batch=>batch.processing.needsReview)?"Needs review":"Checks finished";
  const unavailable:Mark={tone:"pending",text:"Status unavailable"};
  const requirementMarks=requirements.map(req=>completeness(req.job,settled));
  const passed=requirementMarks.filter(mark=>mark.tone==="passed").length;
  const attention=requirementMarks.filter(mark=>mark.tone==="failed").length;
  const requirementSummary=error?"Requirements · Status unavailable":upload.error?"Requirements · Upload needs attention":!settled?"Requirements · Waiting for files":!requirements.length?"No affected requirements":`Requirements · ${passed}/${requirements.length} complete${attention?` · ${attention} need review`:passed<requirements.length?" · Checking":""}`;
  const compactContent=<><ul className={styles.compactFiles}>{files.map(file=><li key={file.id}><strong title={file.name}>{file.name}</strong><StatusMark compact label="Readable" mark={error?unavailable:validity(members.get(file.id))}/><StatusMark compact label="Matching" mark={error?unavailable:matching(members.get(file.id),documents)}/></li>)}</ul><p className={styles.compactSummary} role="status">{requirementSummary}</p></>;
  const content=<>
    {(error||upload.error)&&<p className={styles.error} role="alert">{error||upload.error}{error?<button type="button" onClick={()=>setRefresh(n=>n+1)}>Refresh status</button>:" Minimize to return to uploads."}</p>}
    <ul className={styles.files}>{files.map(file=><li key={file.id}><strong>{file.name}</strong><div className={styles.checks}><StatusMark label="Readable" mark={error?unavailable:validity(members.get(file.id))}/><StatusMark label="Matching" mark={error?unavailable:matching(members.get(file.id),documents)}/></div></li>)}</ul>
    <section className={styles.requirements} aria-label="Requirement completeness"><h3>Requirement checks</h3>{!settled&&<p>Waiting for all files to finish.</p>}{!requirements.length&&settled&&<p>No affected requirements.</p>}{requirements.map(req=><div className={styles.requirement} key={req.id}><strong>{req.title}</strong><StatusMark label="Completeness" mark={error?unavailable:completeness(req.job,settled)}/></div>)}<p className={styles.note}>AI checks are not lender acceptance.</p></section>
  </>;
  return <><section className={styles.summary} aria-label="Document processing summary"><div className={styles.heading}><h2>Processing</h2><button ref={maximize} type="button" aria-label="Maximize document processing" onClick={()=>setOpen(true)}>Expand</button></div>{compactContent}</section>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId} onCancel={event=>{event.preventDefault();setOpen(false);}}><div className={styles.heading}><h2 id={titleId} ref={heading} tabIndex={-1}>Document processing</h2><button type="button" onClick={()=>setOpen(false)}>Minimize</button></div><p className={styles.phase} role="status">{phase}</p><div className={styles.body}>{content}</div></dialog></>;
}
