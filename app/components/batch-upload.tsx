"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { MAX_FILE_SIZE, type ApplicationSnapshot } from "@/lib/model";

type Entry = { id: string; file: File; state: "pending" | "uploading" | "saved" | "failed" | "invalid"; progress: number; message?: string };
type Props = { dropzone?: boolean; disabled?: boolean; onPendingChange?: (count: number) => void; applicationId: string; mapping?: ReactNode; batchKey: string; requirementId: string | null; hidden: boolean; general: boolean; onBusy: (busy: boolean) => void; onLocked: (locked: boolean) => void; onComplete: () => Promise<ApplicationSnapshot | undefined>; onStartNew: () => void };
export default function BatchUpload({ dropzone=false, disabled=false, onPendingChange, applicationId, mapping, batchKey, requirementId, hidden, general, onBusy, onLocked, onComplete, onStartNew }: Props) {
  const [batches, setBatches] = useState<Record<string, Entry[]>>({});
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const batchRefs=useRef<Record<string,string>>({});
  const manifests=useRef<Record<string,Array<{id:string;name:string;sha256:string;requirementId?:string}>>>({});
  const [notice, setNotice] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const [dragging,setDragging]=useState(false);
  const prefix=dropzone?"bulk":"batch";
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
    if (!files?.length || busy || disabled) return;
    const additions = Array.from(files).map(file => {
      const message = !/\.(pdf|docx|xlsx|eml|msg|txt|csv|jpg|jpeg|png|webp)$/i.test(file.name) ? "Choose a PDF, DOCX, XLSX, EML, MSG, TXT, CSV, JPG, PNG or WebP file." : !file.size ? "This file is empty. Choose a file with content." : file.size > MAX_FILE_SIZE ? "This file exceeds 25 MB. Choose a smaller copy." : undefined;
      return { id: crypto.randomUUID(), file, state: message ? "invalid" : "pending", progress: 0, message } as Entry;
    });
    setBatches(all => {
      const next = [...(all[batchKey] || [])];
      for (const addition of additions) {
        if (!next.some(({ file }) => file.name === addition.file.name && file.size === addition.file.size && file.type === addition.file.type && file.lastModified === addition.file.lastModified)) next.push(addition);
      }
      return { ...all, [batchKey]: next };
    });
    setNotice("");
    if (input.current) input.current.value = "";
  }
  function send(entry: Entry, target: string | null, key: string) {
    return new Promise<void>((resolve, reject) => {
      const form = new FormData(); form.set("file", entry.file); if (target) form.set("requirementId", target);
      if(batchRefs.current[entry.id]){form.set('batchId',batchRefs.current[entry.id]);form.set('memberId',entry.id);}
      const xhr = new XMLHttpRequest(); xhr.open("POST", `/api/documents?applicationId=${encodeURIComponent(applicationId)}`); xhr.timeout = 120000;
      xhr.upload.onprogress = event => { if (event.lengthComputable) update(key, entry.id, { progress: Math.round(event.loaded / event.total * 100) }); };
      xhr.onload = () => {
        let body;
        try { body = JSON.parse(xhr.responseText); } catch { reject(new Error("The upload response was interrupted. Retry to check whether it was saved.")); return; }
        if (xhr.status === 201) resolve();
        else reject(new Error(body.error || "The file could not be uploaded. Please retry."));
      };
      xhr.onerror = () => reject(new Error("Connection lost. Your file selection is still here. Retry when you are connected."));
      xhr.ontimeout = () => reject(new Error("Upload timed out. Retry will check whether this file was already saved."));
      xhr.send(form);
    });
  }
  async function upload(ids?: string[]) {
    if (running.current || disabled) return;
    const candidates = entries.filter(entry => (entry.state === "pending" || entry.state === "failed") && (!ids || ids.includes(entry.id)));
    if (!candidates.length) return;
    running.current = true; setBusy(true); onBusy(true); setNotice("");
    const key = batchKey, target = requirementId;
    let saved = 0, failed = 0;
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
      for(const id of new Set(candidates.map(entry=>batchRefs.current[entry.id])))await batchCommand({id,members:manifests.current[id]});
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
          if (!alreadySaved||batchRefs.current[entry.id]) await send(entry, target, key);
          saved++; update(key, entry.id, { state: "saved", progress: 100, message: alreadySaved ? "Already saved to this request." : undefined });
        } catch (error) {
          failed++; update(key, entry.id, { state: "failed", message: error instanceof Error ? error.message : "Upload failed. Please retry." });
        }
      }
      for(const id of new Set(candidates.map(entry=>batchRefs.current[entry.id])))await batchCommand({action:'finalize',id});
      let refreshWarning = "";
      try { await onComplete(); }
      catch { refreshWarning = " The document list could not refresh. Use Refresh uploaded files below; saved files are safe."; }
      if (failed) setNotice(`${saved} file${saved === 1 ? "" : "s"} saved in this attempt. ${failed} could not be uploaded. Retry the failed files below.${refreshWarning}`);
      else if (saved) setNotice(`${saved} file${saved === 1 ? "" : "s"} saved. Send for review when you are ready to share them.${refreshWarning}`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not upload. Your selected files are still here."); }
    finally { running.current = false; setBusy(false); onBusy(false); }
  }
  const pending = entries.filter(entry => entry.state === "pending");
  const failures = entries.filter(entry => entry.state === "failed");
  return <section hidden={hidden} className="batch-upload" aria-label="Upload files" onDragOver={event=>{if(dropzone)event.preventDefault();}} onDrop={event=>{if(dropzone){event.preventDefault();setDragging(false);choose(event.dataTransfer.files);}}}>
    {!dropzone && <h3>Add documents</h3>}<p id={`${prefix}-file-help`}>PDF, DOCX, XLSX, EML, MSG, TXT, CSV, JPG, PNG or WebP · Up to 25 MB per file. You can choose several files at once.</p>
    <input ref={input} id={`${prefix}-files`} className="batch-file-input" type="file" hidden tabIndex={-1} aria-label="Choose files" multiple accept=".pdf,.docx,.xlsx,.eml,.msg,.txt,.csv,.jpg,.jpeg,.png,.webp" disabled={busy || disabled} onChange={event => choose(event.target.files)} />
    <button type="button" className={dropzone ? `bulk-dropzone${dragging?" is-dragging":""}` : "secondary"} onDragOver={event=>{if(dropzone){event.preventDefault();setDragging(true);}}} onDragLeave={()=>setDragging(false)} onDrop={event=>{if(dropzone){event.preventDefault();event.stopPropagation();setDragging(false);choose(event.dataTransfer.files);}}} aria-describedby={`${prefix}-file-help ${prefix}-selection`} disabled={busy || disabled} onClick={() => input.current?.click()}>{dropzone?<><strong>Drop your files here</strong><span>Choose files</span><small>Add several documents at once</small></>:"Choose files"}</button>
    <p id={`${prefix}-selection`} role="status">{entries.length ? `${entries.length} file${entries.length === 1 ? "" : "s"} in your upload list${entries.some(entry => entry.state === "saved") ? ` · ${entries.filter(entry => entry.state === "saved").length} uploaded` : ""}. See filenames and status below.` : "No files selected yet."}</p>
    {mapping}
    <ul className="upload-queue">{entries.map(entry => <li key={entry.id}><div><strong>{entry.file.name}</strong><span>{(entry.file.size / 1024 / 1024).toFixed(2)} MB</span><p role="status">{entry.state === "saved" ? "Uploaded" : entry.state === "uploading" ? entry.progress === 100 ? "Checking and saving…" : `Uploading… ${entry.progress}%` : entry.state === "invalid" ? "Cannot upload this file" : entry.state === "failed" ? "Upload failed" : "Ready to upload"}</p>{entry.message && <p className={entry.state === "failed" || entry.state === "invalid" ? "batch-file-error" : ""}>{entry.message}</p>}{entry.state === "uploading" && <progress aria-label={`Upload progress for ${entry.file.name}`} max={100} value={entry.progress} />}</div><div className="batch-file-actions">{entry.state === "failed" && <button className="secondary" disabled={busy || disabled} onClick={() => upload([entry.id])} aria-label={`Retry ${entry.file.name}`}>Retry</button>}{!busy && !disabled && entry.state !== "saved" && <button className="simple-link" aria-label={`Remove ${entry.file.name} from upload list`} onClick={() => setBatches(all => ({ ...all, [batchKey]: all[batchKey].filter(item => item.id !== entry.id) }))}>Remove from list</button>}</div></li>)}</ul>
    {notice && <p className="batch-notice" role="status">{notice}</p>}
    {!requirementId && entries.length > 0 && <p>These files will be saved without a manual link. AI will suggest links if assistance is enabled; otherwise organize them later.</p>}
    <div className="batch-actions">{pending.length > 0 && <button className="primary" disabled={busy || disabled} onClick={() => upload(pending.map(entry => entry.id))}>{busy ? "Uploading…" : `Upload ${pending.length} file${pending.length === 1 ? "" : "s"}`}</button>}{failures.length > 0 && <button className={pending.length ? "secondary" : "primary"} disabled={busy || disabled} onClick={() => upload(failures.map(entry => entry.id))}>Retry failed files</button>}{entries.some(entry => entry.state === "saved") && <button className="simple-link" disabled={busy || disabled} onClick={() => onComplete().then(() => setNotice("Uploaded files refreshed.")).catch(() => setNotice("Could not refresh. Your uploaded files remain saved."))}>Refresh uploaded files</button>}{general && entries.length > 0 && entries.every(entry => entry.state === "saved") && <button className="secondary" disabled={busy || disabled} onClick={() => {setBatches(all => ({ ...all, [batchKey]: [] }));setNotice("");onStartNew();}}>{dropzone?"Clear completed uploads":"Upload to another request"}</button>}</div>
    <p className="task-help">Uploads are saved one file at a time. Keep this page open until they finish. Failed selections stay here while this page is open.</p>
  </section>;
}
