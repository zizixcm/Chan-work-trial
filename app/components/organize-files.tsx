"use client";
import {useState} from "react";
import type {ApplicationSnapshot} from "@/lib/model";
import FilePreviewPane from "./file-preview-pane";
import {useFileLinks} from "./use-file-links";
export default function OrganizeFiles(props:{data:ApplicationSnapshot;disabled:boolean;onBusy:(busy:boolean)=>void;onUpdated:()=>Promise<ApplicationSnapshot|undefined>}) {
  const {data,disabled}=props,actions=useFileLinks(props);
  const [selected,setSelected]=useState(""),[confirm,setConfirm]=useState("");
  const doc=data.documents.find(d=>d.id===selected)||data.documents[0];
  return <section className="organize-files organize-workspace">
    <nav className="workspace-list" aria-label="Saved files">{data.documents.map(file=><button key={file.id} aria-pressed={doc?.id===file.id} disabled={actions.busy} onClick={()=>{setSelected(file.id);setConfirm("");}}><strong>{file.original_name}</strong><span>{file.requirement_ids.length} linked requirement{file.requirement_ids.length===1?"":"s"}</span></button>)}{!doc&&<p>No files yet. Add files in Upload.</p>}</nav>
    {doc&&<div className="organize-selected file-editor">
      {actions.error&&<p className="inline-error" role="alert">{actions.error} <button className="simple-link" disabled={actions.busy||disabled} onClick={actions.refresh}>Refresh files</button></p>}
      {confirm===doc.id&&<div className="file-remove-confirm" role="group" aria-label="Confirm file removal"><p>Remove <strong>{doc.original_name}</strong> from this draft? Previously sent copies stay with your lender until you send again.</p><div><button className="secondary" disabled={disabled||actions.busy} onClick={()=>setConfirm("")}>Keep file</button><button className="primary" disabled={disabled||actions.busy} onClick={async()=>{if(await actions.remove(doc.id)){setConfirm("");setSelected("");}}}>{actions.busy?"Removing…":"Remove file"}</button></div></div>}
      <div className="organize-editor"><FilePreviewPane document={doc} applicationId={data.application.id} actions={<button className="simple-link" disabled={disabled||actions.busy} onClick={()=>setConfirm(doc.id)}>Remove file</button>}/><section className="organize-links"><h2>Linked requirements</h2><p>Select any that apply.</p><fieldset disabled={disabled||actions.busy}><legend className="visually-hidden">Requirements for {doc.original_name}</legend>{data.requirements.filter(r=>r.collection!=="lender").map(req=><label key={req.id}><input type="checkbox" checked={doc.requirement_ids.includes(req.id)} onChange={event=>void actions.link(doc.id,req.id,event.target.checked)}/>{req.title}</label>)}</fieldset></section></div>
    </div>}
  </section>;
}
