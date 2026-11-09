"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import BatchUpload from "./batch-upload";
import type { ApplicationSnapshot, Requirement } from "@/lib/model";

type Result={assessment?:string;checks?:{state:string;reason?:string}[];limitations?:string[];missingEvidence?:string[];value?:Result};
type Job={id:string;task:string;state:string;freshness:string;ownedByCurrentUser:boolean;consentScope:string;requirementId?:string;documentId?:string;result?:Result;message?:string;safeCode?:string};
export default function BulkUploadWorkspace({data,disabled,showProcessing=true,onBusy,onPendingChange,onUpdated}:{data:ApplicationSnapshot;disabled:boolean;showProcessing?:boolean;onBusy:(busy:boolean)=>void;onPendingChange:(count:number)=>void;onUpdated:()=>Promise<ApplicationSnapshot|undefined>;onDetails:(requirement:Requirement)=>void}) {
  const [error,setError]=useState("");
  const latest=useRef(onUpdated);latest.current=onUpdated;const fingerprint=useRef<string|null>(null);
  const load=useCallback(async()=>{
    const response=await fetch(`/api/applications/${encodeURIComponent(data.application.id)}/analysis`,{cache:"no-store"});const body=await response.json();if(!response.ok)throw new Error(body.error||"Could not load AI status. Your files are still saved.");
    setError("");const next=body.jobs.filter((job:Job)=>job.ownedByCurrentUser&&job.consentScope==="borrower").map((job:Job)=>`${job.id}:${job.state}:${job.freshness}`).join("|");
    if(fingerprint.current!==null&&fingerprint.current!==next)void latest.current().catch(()=>setError("Could not refresh file links. Try refreshing status."));fingerprint.current=next;
  },[data.application.id]);
  useEffect(()=>{let stopped=false;let timer:ReturnType<typeof setTimeout>;async function tick(){try{if(!stopped&&document.visibilityState!=="hidden")await load();}catch(e){if(!stopped)setError(e instanceof Error?e.message:"Could not load status.");}if(!stopped)timer=setTimeout(tick,3000);}void tick();return()=>{stopped=true;clearTimeout(timer);};},[load]);
  return <div className="bulk-workspace bulk-processing-workspace"><section className="bulk-upload-column" aria-label="Upload documents">
    {error&&<p role="alert">{error}<button className="simple-link" onClick={()=>load().catch(e=>setError(e.message))}>Refresh status</button></p>}
    <BatchUpload showProcessing={showProcessing} key={data.application.id} processingDocuments={data.documents} dropzone disabled={disabled} applicationId={data.application.id} batchKey="bulk" requirementId={null} hidden={false} general onBusy={onBusy} onPendingChange={onPendingChange} onLocked={()=>{}} onComplete={async()=>{const snapshot=await onUpdated();await load().catch(e=>setError(e.message));return snapshot;}} onStartNew={()=>{}} />
  </section></div>;
}
