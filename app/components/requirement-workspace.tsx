"use client";
import {useEffect,useState} from "react";
import type {ApplicationSnapshot,Requirement} from "@/lib/model";
import AiReview from "./ai-review";
import RequirementGuidance from "./requirement-guidance";
import FilePreviewPane from "./file-preview-pane";
import {useFileLinks} from "./use-file-links";
import {reviewState} from "@/lib/review-state";
export default function RequirementWorkspace(props:{focus?:{id:string;request:number};data:ApplicationSnapshot;disabled:boolean;onBusy:(busy:boolean)=>void;onUpdated:()=>Promise<ApplicationSnapshot|undefined>;onUpload:(r:Requirement)=>void}) {
  const {data,disabled,onUpload}=props,actions=useFileLinks(props);
  const [selected,setSelected]=useState(""),[preview,setPreview]=useState(""),[mode,setMode]=useState<"preview"|"edit"|"details">("preview");
  useEffect(()=>{if(props.focus?.id){setSelected(props.focus.id);setPreview("");setMode("preview");}},[props.focus]);
  const requirement=data.requirements.find(r=>r.id===selected)||data.requirements[0];
  if(!requirement)return <p>No requirements are available.</p>;
  const state=reviewState(requirement.id,data.documents,data.reviews),doc=state.files.find(d=>d.id===preview)||state.files[0];
  const readOnly=requirement.collection==="lender";
  return <div className="requirement-workspace"><nav className="workspace-list" aria-label="Borrower requirements">{data.requirements.map(r=>{const count=data.documents.filter(d=>d.requirement_ids.includes(r.id)).length;return <button key={r.id} aria-pressed={requirement.id===r.id} disabled={actions.busy} onClick={()=>{setSelected(r.id);setPreview("");setMode("preview");}}><strong>{r.title}</strong><span>{count?`${count} file${count===1?"":"s"}`:"No files"}</span></button>;})}</nav>
    <section className="requirement-file-pane requirement-editor" tabIndex={0} aria-label={`${requirement.title} details`}><div className="pane-heading"><h2>{requirement.title}</h2><div className="pane-actions">{mode!=="preview"?<button className="secondary" disabled={actions.busy} onClick={()=>setMode("preview")}>Done</button>:<>{!readOnly&&<><button className="primary" disabled={disabled} onClick={()=>onUpload(requirement)}>Add files</button><button className="secondary" disabled={disabled} onClick={()=>setMode("edit")}>Edit files</button></>}<button className="simple-link" onClick={()=>setMode("details")}>Details</button></>}</div></div>
      {!readOnly&&<AiReview key={requirement.id} applicationId={data.application.id} requirement={requirement} borrower onUpdated={props.onUpdated}/> }
      {actions.error&&<p className="inline-error" role="alert">{actions.error} <button className="simple-link" disabled={disabled||actions.busy} onClick={actions.refresh}>Refresh files</button></p>}
      {mode==="details"?<div className="requirement-details-pane"><p><strong>Required period:</strong> {requirement.period}</p><p>{requirement.purpose}</p><RequirementGuidance requirement={requirement}/></div>:mode==="edit"?<div className="requirement-associations"><p>Choose saved files for this requirement.</p>{!data.documents.length&&<p>No saved files yet. Use Add files to upload.</p>}<fieldset disabled={disabled||actions.busy}><legend className="visually-hidden">Files for {requirement.title}</legend>{data.documents.map(file=><label key={file.id}><input type="checkbox" checked={file.requirement_ids.includes(requirement.id)} onChange={event=>void actions.link(file.id,requirement.id,event.target.checked)}/><span>{file.original_name}</span></label>)}</fieldset></div>:<>
      {state.review?.message&&<p className="requirement-feedback"><strong>{state.current?"Lender feedback":"Earlier feedback"}:</strong> {state.review.message}</p>}
      {doc?<FilePreviewPane document={doc} applicationId={data.application.id} selector={state.files.length>1?<select aria-label="File to preview" value={doc.id} onChange={event=>setPreview(event.target.value)}>{state.files.map(file=><option key={file.id} value={file.id}>{file.original_name}</option>)}</select>:undefined}/>:<p className="empty-file-preview">{readOnly?"Your lender provides this item.":"No files linked yet. Add files or choose from your saved files."}</p>}
      </>}
    </section></div>;
}
