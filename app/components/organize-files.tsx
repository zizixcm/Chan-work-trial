"use client";
import { useRef, useState } from "react";
import type { ApplicationSnapshot } from "@/lib/model";
export default function OrganizeFiles({data,disabled,onBusy,onUpdated}:{data:ApplicationSnapshot;disabled:boolean;onBusy:(busy:boolean)=>void;onUpdated:()=>Promise<ApplicationSnapshot|undefined>}) {
  const [busy,setBusy]=useState(false),[message,setMessage]=useState("");const running=useRef(false);
  async function link(documentId:string,requirementId:string,checked:boolean) {
    if(disabled||running.current)return;
    const req=data.requirements.find(r=>r.id===requirementId);if(!req?.evidence_revision){setMessage("Refresh files before changing links.");return;}
    running.current=true;setBusy(true);onBusy(true);setMessage("");
    try {
      const response=await fetch(`/api/documents/${encodeURIComponent(documentId)}/requirements/${encodeURIComponent(requirementId)}?applicationId=${encodeURIComponent(data.application.id)}&expectedEvidenceRevision=${encodeURIComponent(req.evidence_revision)}`,{method:checked?"PUT":"DELETE"});
      const body=await response.json();if(!response.ok)throw new Error(body.error||"Could not change this link. Refresh files and try again.");
      await onUpdated();setMessage(checked?"File linked to the requirement.":"Link removed. The original file and earlier submissions are kept.");
    } catch(e){setMessage(e instanceof Error?e.message:"Could not change this link.");}
    finally {running.current=false;setBusy(false);onBusy(false);}
  }
  async function check(documentId:string) {
    if(disabled||running.current)return;running.current=true;setBusy(true);onBusy(true);setMessage("");
    try {const response=await fetch(`/api/documents/${encodeURIComponent(documentId)}/coverage-analysis?applicationId=${encodeURIComponent(data.application.id)}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idempotencyKey:crypto.randomUUID()})});const body=await response.json();if(!response.ok)throw new Error(body.error||"Could not request a check.");setMessage("Check requested. See Bulk upload for live assessment status.");}
    catch(e){setMessage(e instanceof Error?e.message:"Could not request a check.");}
    finally{running.current=false;setBusy(false);onBusy(false);}
  }
  return <section className="organize-files"><div className="organize-heading"><div><h2>Organize your files</h2><p>A file can support several requirements, or stay unlinked. Removing a link keeps the original file.</p></div><button className="secondary" disabled={disabled||busy} onClick={()=>onUpdated().then(()=>setMessage("Files refreshed.")).catch(()=>setMessage("Could not refresh. Please try again."))}>Refresh files</button></div>
    {message&&<p role="status" className="batch-notice">{message}</p>}
    {!data.documents.length&&<p className="simple-empty">No saved files yet. Add documents in Bulk upload or By requirement.</p>}
    {data.documents.map(doc=><article className="organize-file" key={doc.id}><h3>{doc.original_name}</h3><p>{doc.requirement_ids.length?doc.requirement_ids.map(id=>data.requirements.find(r=>r.id===id)?.title||"Earlier requirement").join(" · "):"Not linked to a requirement"}</p><div className="organize-actions"><a className="simple-link" href={`/api/documents/${encodeURIComponent(doc.id)}?applicationId=${encodeURIComponent(data.application.id)}`}>Download original</a>{doc.content_type.split(';')[0].trim()==="text/csv"&&<button className="simple-link" disabled={disabled||busy} onClick={()=>check(doc.id)}>Check with AI</button>}</div><details><summary>Edit linked requirements</summary><fieldset disabled={disabled||busy}><legend>Requirements for {doc.original_name}</legend>{data.requirements.filter(r=>r.collection!=="lender").map(req=><label key={req.id}><input type="checkbox" checked={doc.requirement_ids.includes(req.id)} onChange={event=>void link(doc.id,req.id,event.target.checked)} />{req.title}</label>)}</fieldset></details></article>)}
  </section>;
}
