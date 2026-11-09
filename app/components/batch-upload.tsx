"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {X} from "lucide-react";
import UploadProcessingPanel, {type ProcessingUpload} from "./upload-processing-panel";
import { MAX_FILE_SIZE, type ApplicationSnapshot } from "@/lib/model";

type Entry = { id: string; file: File; state: "pending" | "uploading" | "saved" | "failed" | "invalid"; progress: number; message?: string };
export type UploadReceipt = {batchId:string;files:{id:string;name:string;documentId?:string}[]};
type Props = { staged?:boolean; onCommitted?:(receipts:UploadReceipt[],complete:boolean)=>void; showProcessing?:boolean; processingDocuments?:ApplicationSnapshot["documents"]; compactDrop?:boolean; dropzone?: boolean; disabled?: boolean; onPendingChange?: (count: number) => void; applicationId: string; mapping?: ReactNode; batchKey: string; requirementId: string | null; hidden: boolean; general: boolean; onBusy: (busy: boolean) => void; onLocked: (locked: boolean) => void; onComplete: () => Promise<ApplicationSnapshot | undefined>; onStartNew: () => void };
export default function BatchUpload({ staged=false,onCommitted,showProcessing=true, processingDocuments=[], compactDrop=false, dropzone=false, disabled=false, onPendingChange, applicationId, mapping, batchKey, requirementId, hidden, general, onBusy, onLocked, onComplete, onStartNew }: Props) {
  const [batches, setBatches] = useState<Record<string, Entry[]>>({});
  const [busy, setBusy] = useState(false);
  const [processing,setProcessing]=useState<ProcessingUpload|null>(null);
  const running = useRef(false);
  const batchRefs=useRef<Record<string,string>>({});
  const manifests=useRef<Record<string,Array<{id:string;name:string;sha256:string;requirementId?:string}>>>({});
  const [notice, setNotice] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const [dragging,setDragging]=useState(false);
  const prefix=dropzone?"bulk":"batch";
  useEffect(()=>{
    if(!dropzone)return;
    const controller=new AbortController();
    void (async()=>{
      try {
        const response=await fetch(`/api/upload-batches?latest=1&applicationId=${encodeURIComponent(applicationId)}`,{cache:"no-store",signal:controller.signal});
        if(!response.ok)throw new Error("Saved processing status is unavailable. Refresh to try again.");
        const {batch}=await response.json();
        if(batch&&!controller.signal.aborted&&!running.current)setProcessing(previous=>previous||{
          sequence:0,restored:true,batchIds:[batch.id],files:batch.members.map((member:{id:string;name:string})=>({id:member.id,name:member.name})),
        });
      } catch(error) {
        if(!controller.signal.aborted&&!running.current)setNotice(error instanceof Error?error.message:"Saved processing status is unavailable.");
      }
    })();
    return()=>controller.abort();
  },[applicationId,dropzone]);
  const entries = batches[batchKey] || [];
  const pendingCount = Object.values(batches).flat().filter(entry => entry.state !== "saved").length;
  useEffect(() => { onPendingChange?.(pendingCount); }, [pendingCount, onPendingChange]);
  const locked = entries.some(entry => entry.state === "saved" || entry.state === "uploading" || entry.state === "failed");
  useEffect(() => { onLocked(locked); }, [locked, onLocked]);
  useEffect(() => { setNotice(""); if (input.current) input.current.value = ""; }, [batchKey]);
  function update(key: string, id: string, patch: Partial<Entry>) {
    setBatches(all => ({ ...all, [key]: (all[key] || []).map(entry => entry.id === id ? { ...entry, ...patch } : entry) }));
  }
  function choose(files: FileList | null) {
    if (!files?.length || running.current || busy || disabled) return;
    const additions = Array.from(files).map(file => {
      const message = !/\.(pdf|docx|xlsx|eml|msg|txt|csv|jpg|jpeg|png|webp)$/i.test(file.name) ? "Choose a PDF, DOCX, XLSX, EML, MSG, TXT, CSV, JPG, PNG or WebP file." : !file.size ? "This file is empty. Choose a file with content." : file.size > MAX_FILE_SIZE ? "This file exceeds 25 MB. Choose a smaller copy." : undefined;
      return { id: crypto.randomUUID(), file, state: message ? "invalid" : "pending", progress: 0, message } as Entry;
    });
    const accepted: Entry[] = [];
    for (const addition of additions) {
      if (![...entries, ...accepted].some(({ file }) => file.name === addition.file.name && file.size === addition.file.size && file.type === addition.file.type && file.lastModified === addition.file.lastModified)) accepted.push(addition);
    }
    if (!accepted.length) { if (input.current) input.current.value = ""; return; }
    setBatches(all => ({ ...all, [batchKey]: [...(all[batchKey] || []), ...accepted] }));
    setNotice("");
    if (input.current) input.current.value = "";
    if (dropzone&&!staged) {
      const ready = accepted.filter(entry => entry.state === "pending");
      if (ready.length) void upload(undefined, ready);
      else setProcessing(previous => ({sequence:(previous?.sequence||0)+1,files:accepted.map(entry=>({id:entry.id,name:entry.file.name})),batchIds:[],error:"These files cannot be uploaded. Minimize to see the file errors."}));
    }
  }

  function send(entry: Entry, target: string | null, key: string) {
    return new Promise<string>((resolve, reject) => {
      const form = new FormData(); form.set("file", entry.file); if (target) form.set("requirementId", target);
      if(batchRefs.current[entry.id]){form.set('batchId',batchRefs.current[entry.id]);form.set('memberId',entry.id);}
      const xhr = new XMLHttpRequest(); xhr.open("POST", `/api/documents?applicationId=${encodeURIComponent(applicationId)}`); xhr.timeout = 120000;
      xhr.upload.onprogress = event => { if (event.lengthComputable) update(key, entry.id, { progress: Math.round(event.loaded / event.total * 100) }); };
      xhr.onload = () => {
        let body;
        try { body = JSON.parse(xhr.responseText); } catch { reject(new Error("The upload response was interrupted. Retry to check whether it was saved.")); return; }
        if (xhr.status === 201 && typeof body.id === "string") resolve(body.id);
        else reject(new Error(body.error || "The file could not be uploaded. Please retry."));
      };
      xhr.onerror = () => reject(new Error("Connection lost. Your file selection is still here. Retry when you are connected."));
      xhr.ontimeout = () => reject(new Error("Upload timed out. Retry will check whether this file was already saved."));
      xhr.send(form);
    });
  }
  async function upload(ids?: string[], selectedEntries?: Entry[]) {
    if (running.current || disabled) return;
    const candidates = (selectedEntries || entries).filter(entry => (entry.state === "pending" || entry.state === "failed") && (!ids || ids.includes(entry.id)));
    if (!candidates.length) return;
    running.current = true; setBusy(true); onBusy(true); setNotice("");
    if(dropzone)setProcessing(previous=>({sequence:(previous?.sequence||0)+1,files:candidates.map(entry=>({id:entry.id,name:entry.file.name})),batchIds:[]}));
    const key = batchKey, target = requirementId;
    let saved = 0, failed = 0;const savedEntries:(Entry & {documentId:string})[]=[];
    const batchCommand=async(value:unknown)=>{
      const response=await fetch(`/api/upload-batches?applicationId=${encodeURIComponent(applicationId)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
      const result=await response.json();if(!response.ok)throw new Error(result.error||'Could not update upload batch.');
    };
    try {
      const fresh=candidates.filter(entry=>!batchRefs.current[entry.id]);
      if(fresh.length){
        const id=crypto.randomUUID();
        const manifest=await Promise.all(fresh.map(async entry=>({id:entry.id,name:entry.file.name,
          sha256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await entry.file.arrayBuffer())),byte=>byte.toString(16).padStart(2,'0')).join(''),
          ...(target?{requirementId:target}:{})})));
        manifests.current[id]=manifest;for(const entry of fresh)batchRefs.current[entry.id]=id;
      }
      for(const id of new Set(candidates.map(entry=>batchRefs.current[entry.id]))) {
        await batchCommand({id,members:manifests.current[id]});
        if(dropzone)setProcessing(previous=>previous?{...previous,batchIds:[...new Set([...previous.batchIds,id])]}:previous);
      }
      // A lost response may follow a successful save. Confirm exact bytes and mapping before resending.
      let snapshot: ApplicationSnapshot | undefined;
      if (candidates.some(entry => entry.state === "failed")) {
        const response = await fetch(`/api/application?applicationId=${encodeURIComponent(applicationId)}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Could not check saved files. Retry when your connection is restored.");
        snapshot = await response.json();
      }
      for (const entry of candidates) {
        update(key, entry.id, { state: "uploading", progress: 0, message: undefined });
        try {
          let alreadySaved = false;
          if (entry.state === "failed" && snapshot) {
            const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await entry.file.arrayBuffer())), byte => byte.toString(16).padStart(2, "0")).join("");
            alreadySaved = snapshot.documents.some(document => document.sha256 === hash && (!target || document.requirement_ids.includes(target)));
          }
          const documentId = await send(entry, target, key);
          saved++;savedEntries.push({...entry,documentId}); update(key, entry.id, { state: "saved", progress: 100, message: alreadySaved ? "Already saved to this request." : undefined });
        } catch (error) {
          failed++; update(key, entry.id, { state: "failed", message: error instanceof Error ? error.message : "Upload failed. Please retry." });
        }
      }
      for(const id of new Set(candidates.map(entry=>batchRefs.current[entry.id])))await batchCommand({action:'finalize',id,...(staged?{requestProcessing:true}:{})});
      if(savedEntries.length)onCommitted?.([...new Set(savedEntries.map(entry=>batchRefs.current[entry.id]))].map(batchId=>({batchId,files:savedEntries.filter(entry=>batchRefs.current[entry.id]===batchId).map(entry=>({id:entry.id,name:entry.file.name,documentId:entry.documentId}))})),failed===0&&entries.every(entry=>entry.state==='saved'||savedEntries.some(saved=>saved.id===entry.id)));
      let refreshWarning = "";
      try { await onComplete(); }
      catch { refreshWarning = " The document list could not refresh. Use Refresh uploaded files below; saved files are safe."; }
      if (failed) setNotice(`${saved} file${saved === 1 ? "" : "s"} saved in this attempt. ${failed} could not be uploaded. Retry the failed files below.${refreshWarning}`);
      else if (saved) setNotice(dropzone ? refreshWarning.trim() : `${saved} file${saved === 1 ? "" : "s"} saved. Send for review when you are ready to share them.${refreshWarning}`);
    } catch (error) { const message=error instanceof Error ? error.message : "Could not upload. Your selected files are still here.";setNotice(message);for (const entry of candidates) update(key, entry.id, {state:"failed",message});if(dropzone)setProcessing(previous=>previous?{...previous,error:message}:previous); }
    finally { if(dropzone)setBatches(all=>({...all,[key]:(all[key]||[]).filter(entry=>entry.state!=="saved")})); running.current = false; setBusy(false); onBusy(false); }
  }
  const pending = entries.filter(entry => entry.state === "pending");
  const failures = entries.filter(entry => entry.state === "failed");
  return <section hidden={hidden} className="batch-upload" aria-label="Upload files" onDragOver={event=>{if(dropzone)event.preventDefault();}} onDrop={event=>{if(dropzone){event.preventDefault();setDragging(false);choose(event.dataTransfer.files);}}}>
    {!dropzone && <><h3>Add documents</h3><p id={`${prefix}-file-help`}>PDF, DOCX, XLSX, EML, MSG, TXT, CSV, JPG, PNG or WebP · Up to 25 MB per file. You can choose several files at once.</p></>}
    <input ref={input} id={`${prefix}-files`} className="batch-file-input" type="file" hidden tabIndex={-1} aria-label="Choose files" multiple accept=".pdf,.docx,.xlsx,.eml,.msg,.txt,.csv,.jpg,.jpeg,.png,.webp" disabled={busy || disabled} onChange={event => choose(event.target.files)} />
    <div className={`upload-processing-layout${dropzone&&processing?" has-processing":""}`}><div className="upload-drop-area">
    <button type="button" className={dropzone ? `bulk-dropzone${dragging?" is-dragging":""}` : "secondary"} onDragOver={event=>{if(dropzone){event.preventDefault();setDragging(true);}}} onDragLeave={()=>setDragging(false)} onDrop={event=>{if(dropzone){event.preventDefault();event.stopPropagation();setDragging(false);choose(event.dataTransfer.files);}}} aria-describedby={`${prefix}-file-help${entries.length ? ` ${prefix}-selection` : ""}`} disabled={busy || disabled} onClick={() => input.current?.click()}>{dropzone?<><strong>{staged&&entries.length?"Add more files":compactDrop?"Choose files":"Drag and drop files here"}</strong>{!staged&&<span>Choose files</span>}</>:"Choose files"}</button>
    {dropzone && <div className="upload-format-help" id={`${prefix}-file-help`}><span>25 MB per file</span><span aria-hidden="true"> · </span><details><summary>Supported formats</summary><p>PDF, DOCX, XLSX, EML, MSG, TXT, CSV, JPG, JPEG, PNG and WebP. Choose several files at once.</p></details></div>}
    </div>{showProcessing&&dropzone&&processing&&<UploadProcessingPanel applicationId={applicationId} upload={processing} uploading={busy} documents={processingDocuments}/>}</div>
    {!staged&&!!entries.length && <p id={`${prefix}-selection`} role="status">{entries.length ? `${entries.length} file${entries.length === 1 ? "" : "s"} in your upload list${entries.some(entry => entry.state === "saved") ? ` · ${entries.filter(entry => entry.state === "saved").length} uploaded` : ""}. See filenames and status below.` : ""}</p>}
    {mapping}
    <ul className="upload-queue">{entries.map(entry => <li key={entry.id}><div><strong>{entry.file.name}</strong><span>{(entry.file.size / 1024 / 1024).toFixed(2)} MB</span><p role="status">{entry.state === "saved" ? "Uploaded" : entry.state === "uploading" ? entry.progress === 100 ? "Checking and saving…" : `Uploading… ${entry.progress}%` : entry.state === "invalid" ? "Cannot upload this file" : entry.state === "failed" ? "Upload failed" : "Ready to upload"}</p>{entry.message && <p className={entry.state === "failed" || entry.state === "invalid" ? "batch-file-error" : ""}>{entry.message}</p>}{entry.state === "uploading" && <progress aria-label={`Upload progress for ${entry.file.name}`} max={100} value={entry.progress} />}</div><div className="batch-file-actions">{entry.state === "failed" && <button className="secondary" disabled={busy || disabled} onClick={() => upload([entry.id])} aria-label={`Retry ${entry.file.name}`}>Retry</button>}{!busy && !disabled && entry.state !== "saved" && <button className="simple-link" aria-label={`Remove ${entry.file.name} from upload list`} onClick={() => setBatches(all => ({ ...all, [batchKey]: all[batchKey].filter(item => item.id !== entry.id) }))}>{staged?<X size={18} aria-hidden="true"/>:"Remove from list"}</button>}</div></li>)}</ul>
    {notice && <p className="batch-notice" role="status">{notice}</p>}

    <div className="batch-actions">{(!dropzone||staged) && pending.length > 0 && <button className="primary" disabled={busy || disabled} onClick={() => upload(pending.map(entry => entry.id))}>{busy ? "Uploading…" : `Upload ${pending.length} file${pending.length === 1 ? "" : "s"}`}</button>}{failures.length > 0 && <button className={pending.length ? "secondary" : "primary"} disabled={busy || disabled} onClick={() => upload(failures.map(entry => entry.id))}>Retry failed files</button>}{entries.some(entry => entry.state === "saved") && <button className="simple-link" disabled={busy || disabled} onClick={() => onComplete().then(() => setNotice("Uploaded files refreshed.")).catch(() => setNotice("Could not refresh. Your uploaded files remain saved."))}>Refresh uploaded files</button>}{general && entries.length > 0 && entries.every(entry => entry.state === "saved") && <button className="secondary" disabled={busy || disabled} onClick={() => {setBatches(all => ({ ...all, [batchKey]: [] }));setNotice("");onStartNew();}}>{dropzone?"Clear completed uploads":"Upload to another request"}</button>}</div>
    {busy && <p className="task-help">Keep this page open until uploads finish.</p>}
  </section>;
}
