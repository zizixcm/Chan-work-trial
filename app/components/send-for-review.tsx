"use client";
import { useRef, useState } from "react";
import type { ApplicationSnapshot } from "@/lib/model";

type Snapshot = ApplicationSnapshot;
export default function SendForReview({snapshot,blocked,onBusy,onSent,onRefresh}:{snapshot:Snapshot;blocked:boolean;onBusy:(busy:boolean)=>void;onSent:(snapshot:ApplicationSnapshot)=>void;onRefresh:()=>Promise<unknown>}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const [needsRefresh,setNeedsRefresh]=useState(false);
  const running=useRef(false);
  const attempt=useRef<{version:string;key:string}|null>(null);
  const draft=snapshot.draft,submission=snapshot.submission;
  async function refresh() {
    setBusy(true);onBusy(true);
    try {await onRefresh();setNeedsRefresh(false);setError("");}
    catch {setError("Could not refresh your files. Please try again before sending.");}
    finally {setBusy(false);onBusy(false);}
  }
  async function send() {
    if(running.current||blocked||!draft||needsRefresh)return;
    const version=`${snapshot.application.id}:${draft.revision}:${draft.contentRevision}`;
    if(attempt.current?.version!==version)attempt.current={version,key:crypto.randomUUID()};
    running.current=true;setBusy(true);onBusy(true);setError("");
    try {
      const response=await fetch(`/api/applications/${encodeURIComponent(snapshot.application.id)}/submit`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idempotencyKey:attempt.current.key,expectedRevision:draft.revision,expectedContentRevision:draft.contentRevision})});
      const body=await response.json();
      if(response.status===409){setNeedsRefresh(true);throw new Error("Your application changed. Refresh your files, then send the updated version.");}
      if(!response.ok)throw new Error(body.error || "Could not confirm sending. Please retry; saved files are safe.");
      if(body.snapshot?.application?.id!==snapshot.application.id)throw new Error("Could not confirm sending. Refresh the application to check its status.");
      onSent(body.snapshot);attempt.current=null;
    } catch(e){setError(e instanceof Error?e.message:"Could not confirm sending. Please retry; saved files are safe.");}
    finally{running.current=false;setBusy(false);onBusy(false);}
  }
  const unchanged=!!submission && !draft?.hasUnsentChanges;
  return <section className="borrower-send-dock" aria-label="Send application for review">
    <div className="borrower-send-content"><div>
      <p role="status">{busy?"Please wait…":submission?draft?.hasUnsentChanges?"Unsent changes":"Sent":"Private draft"}</p>
      {blocked && <p>Finish uploading or remove selected files before sending.</p>}
      {!draft && <p>Refresh the application to load its send status.</p>}
      {!submission && snapshot.documents.length===0 && <p>No files saved yet. You can send the application with documents still missing.</p>}
      {error && <p className="send-error" role="alert">{error}</p>}
    </div><div className="borrower-send-actions">
      {(needsRefresh||!draft) && <button className="secondary" disabled={busy||blocked} onClick={refresh}>Refresh files</button>}
      <button className="primary" disabled={busy||blocked||!draft||unchanged||needsRefresh} onClick={send}>{busy?"Please wait…":unchanged?"Sent for review":submission?"Send updated files":"Send for review"}</button>
    </div></div>
  </section>;
}
