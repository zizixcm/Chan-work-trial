"use client";
import ConnectedProcessingConversation from "./connected-processing-conversation";
import ConversationAnswers from "./conversation-answers";
import ConversationUploads from "./conversation-uploads";
import SendForReview from "./send-for-review";
import BulkUploadWorkspace from "./bulk-upload-workspace";
import RequirementWorkspace from "./requirement-workspace";
import OrganizeFiles from "./organize-files";
import AiReview from "./ai-review";
import RequirementGuidance from "./requirement-guidance";
import WorkspaceHeader from "./workspace-header";
import BatchUpload from "./batch-upload";
import DocumentPreview from "./document-preview";
import { reviewState } from "@/lib/review-state";
import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { ApplicationSnapshot, PublicDocument, Requirement } from "@/lib/model";

function size(bytes: number) { return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`; }
function date(value: string) { return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
export default function Portal({ applicationId, conversationUploads = false, groundedRetrieval = false, processingChat = false }: { applicationId: string; conversationUploads?: boolean; groundedRetrieval?: boolean; processingChat?: boolean }) {
  const [view,setView]=useState<"Upload"|"By requirement"|"By file">("Upload");
  const [focusedRequirement,setFocusedRequirement]=useState({id:"",request:0});
  const viewButtons=useRef<(HTMLButtonElement|null)[]>([]);
  const [bulkBusy,setBulkBusy]=useState(false);
  const [bulkPending,setBulkPending]=useState(0);
  const [data, setData] = useState<ApplicationSnapshot | null>(null);
  const [loadError, setLoadError] = useState("");
  const [showAll, setShowAll] = useState(true);
  const [generalUpload, setGeneralUpload] = useState(false);
  const [generalRequirementId, setGeneralRequirementId] = useState("");
  const [selected, setSelected] = useState<Requirement | null>(null);
  const [mode, setMode] = useState<"upload" | "details">("upload");
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  const [pendingFiles, setPendingFiles] = useState(0);
  const [batchLocked, setBatchLocked] = useState(false);
  const [downloading, setDownloading] = useState("");
  const [previewId, setPreviewId] = useState("");
  const [removing, setRemoving] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<{ document: PublicDocument; requirementId: string; revision: string } | null>(null);
  const removingRef = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const backdropPointer = useRef<number | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const removeOpener = useRef<HTMLElement | null>(null);
  const previewOpener = useRef<HTMLElement | null>(null);
  const listScroll = useRef(0);
  const unlockPage = useRef<(() => void) | null>(null);
  useEffect(() => () => unlockPage.current?.(), []);
  function lockPage() {
    if (unlockPage.current) return;
    const x = window.scrollX, y = window.scrollY;
    const body = document.body;
    const properties = ["position", "top", "left", "width", "overflow", "padding-right"];
    const previous = properties.map(name => [name, body.style.getPropertyValue(name), body.style.getPropertyPriority(name)]);
    const gap = window.innerWidth - document.documentElement.clientWidth;
    const padding = parseFloat(getComputedStyle(body).paddingRight) || 0;
    body.style.position = "fixed"; body.style.top = `-${y}px`; body.style.left = `-${x}px`;
    body.style.width = "100%"; body.style.overflow = "hidden";
    if (gap > 0) body.style.paddingRight = `${padding + gap}px`;
    unlockPage.current = () => {
      for (const [name, value, priority] of previous) {
        if (value) body.style.setProperty(name, value, priority); else body.style.removeProperty(name);
      }
      window.scrollTo({ left: x, top: y, behavior: "instant" });
      unlockPage.current = null;
    };
  }
  function finishClose() {
    backdropPointer.current = null;
    unlockPage.current?.(); setPreviewId(""); setRemoveTarget(null);
    const target = opener.current?.isConnected ? opener.current : document.getElementById("request-list-title");
    target?.focus({ preventScroll: true });
  }
  function backToDocuments() {
    setPreviewId("");
    requestAnimationFrame(() => {
      if (dialog.current) dialog.current.scrollTop = listScroll.current;
      previewOpener.current?.focus({ preventScroll: true });
    });
  }
  const load = useCallback(async () => {
    const response = await fetch(`/api/application?applicationId=${encodeURIComponent(applicationId)}`, { cache: "no-store" });
    if (response.status === 401) { location.assign("/login"); return; }
    const body = await response.json();
    if (response.status === 403 || response.status === 404) { setData(null); setSelected(null); }
    if (!response.ok) throw new Error(body.error || "Could not load your application.");
    if (body.application?.id !== applicationId) throw new Error("Could not load the selected application.");
    setData(body); setLoadError(""); return body as ApplicationSnapshot;
  }, [applicationId]);
  useEffect(() => { load().catch(error => setLoadError(error.message)); }, [load]);
  function open(requirement?: Requirement, nextMode: "upload" | "details" = "upload") {
    if (sending) return;
    opener.current = document.activeElement as HTMLElement;
    setGeneralUpload(!requirement); setSelected(requirement || data?.requirements.find(request => request.id === generalRequirementId && request.collection !== "lender") || null);
    setMode(nextMode); setPreviewId(""); setRemoveTarget(null); setActionError(""); setNotice("");
    lockPage(); dialog.current?.showModal(); if (dialog.current) dialog.current.scrollTop = 0; requestAnimationFrame(() => document.getElementById("upload-title")?.focus());
  }
  function close() {
    if (busy || removing) return;
    dialog.current?.close();
  }
  function viewDetails() { setMode("details"); requestAnimationFrame(() => document.getElementById("upload-title")?.focus()); }
  async function download(document: PublicDocument) {
    setDownloading(document.id); setActionError("");
    try {
      const response = await fetch(`/api/documents/${encodeURIComponent(document.id)}?applicationId=${encodeURIComponent(applicationId)}`, { cache: "no-store" });
      if (response.status === 403 || response.status === 404) { setData(null); setSelected(null); }
    if (!response.ok) throw new Error("Download failed. Refresh the files or try again.");
      const url = URL.createObjectURL(await response.blob()); const link = window.document.createElement("a");
      link.href = url; link.download = document.original_name; window.document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (error) { setActionError(error instanceof Error ? error.message : "Download failed. Please retry."); }
    finally { setDownloading(""); }
  }
  async function removeDocument() {
    if (!removeTarget || removingRef.current) return;
    removingRef.current = true; setRemoving(true); setActionError("");
    try {
      const response = await fetch(`/api/documents/${encodeURIComponent(removeTarget.document.id)}/requirements/${encodeURIComponent(removeTarget.requirementId)}?applicationId=${encodeURIComponent(applicationId)}&expectedEvidenceRevision=${encodeURIComponent(removeTarget.revision)}`, { method: "DELETE" });
      let result;
      try { result = await response.json(); } catch { throw new Error("Could not confirm removal. Refresh uploaded files before retrying; the saved original is kept."); }
      if (response.status === 403 || response.status === 404) { setData(null); setSelected(null); }
    if (!response.ok) throw new Error(result.error || "Could not remove this file from the request. Please retry.");
      setData(result.snapshot); setNotice(`“${removeTarget.document.original_name}” removed from this request. The saved original and earlier history are kept.`);
      if (previewId === removeTarget.document.id) setPreviewId("");
      setRemoveTarget(null); requestAnimationFrame(() => document.getElementById("uploaded-documents-title")?.focus());
    } catch (error) { setActionError(error instanceof Error ? error.message : "Could not remove this file. Please retry."); }
    finally { removingRef.current = false; setRemoving(false); }
  }
  const requests = data?.requirements.map(r => ({...r, ...reviewState(r.id, data.documents, data.reviews)})) || [];
  const uploadRequests = requests.filter(r => r.collection !== "lender");
  const attention = uploadRequests.filter(r => r.status === "Changes requested" || (!r.files.length && !r.condition && r.stage !== "Before funding"));
  const visible = showAll ? requests : attention;
  const withFiles = requests.filter(r => r.files.length > 0).length;
  const coverage = [
    {label: "Need your files", count: attention.filter(r => r.status === "Not uploaded").length},
    {label: "Changes requested", count: requests.filter(r => r.status === "Changes requested").length},
    {label: "Requests with files", count: requests.filter(r => r.files.length > 0).length},
    {label: "Accepted by lender", count: requests.filter(r => r.status === "Accepted").length},
  ];
  const task = requests.find(r => r.id === selected?.id);
  function status(r: typeof requests[number]) {
    return !r.files.length && r.collection === "lender" ? "Lender / provider item" : !r.files.length && r.condition ? "If applicable" : !r.files.length && r.stage === "Before funding" ? "Before funding" : r.status === "Accepted" ? "Accepted by lender" : r.status === "Changes requested" ? "Change requested" : r.files.length ? "Files saved" : "Needed";
  }
  return <div className="portal-simple borrower-workspace">
    <WorkspaceHeader role="borrower" />
    <main className="simple-main">
      <a className="simple-link borrower-back" href="/">← Back to applications</a>
      {loadError && <div className="alert error" role="alert">{loadError}<button onClick={() => load().catch(e => setLoadError(e.message))}>Retry</button></div>}
      {notice && <div className="alert" role="status">{notice}<button aria-label="Dismiss notification" onClick={() => setNotice("")}><X size={18}/></button></div>}
      {!data && !loadError && <p role="status">Loading your application…</p>}
      {data && <>
        <div className="simple-identity"><div><h1>{data.application.property_name}</h1><p>{data.application.borrower_name} · {data.application.transaction_type}</p></div><details><summary>Application details</summary><p>{data.application.address}</p><p>Requested loan: ${data.application.requested_amount.toLocaleString()}</p><p>Letter of intent: {data.application.loi_reference}</p></details></div>
        <div className="borrower-view-tabs" role="tablist" aria-label="Document views">{(["Upload","By file","By requirement"] as const).map((name,index)=><button key={name} role="tab" id={`borrower-tab-${index}`} aria-controls={`borrower-view-${index}`} aria-selected={view===name} tabIndex={view===name?0:-1} ref={element=>{viewButtons.current[index]=element;}} onClick={()=>setView(name)} onKeyDown={event=>{const names=["Upload","By file","By requirement"] as const;let next=index;if(event.key==="ArrowRight")next=(index+1)%3;else if(event.key==="ArrowLeft")next=(index+2)%3;else if(event.key==="Home")next=0;else if(event.key==="End")next=2;else return;event.preventDefault();setView(names[next]);viewButtons.current[next]?.focus();}}>{name}</button>)}</div>
        <div id="borrower-view-0" role="tabpanel" aria-labelledby="borrower-tab-0" hidden={view!=="Upload"}>{processingChat?<ConnectedProcessingConversation key={applicationId} applicationId={applicationId} onUpdated={load} uploadSlot={<BulkUploadWorkspace showProcessing={false} data={data} disabled={sending||organizing} onBusy={setBulkBusy} onPendingChange={setBulkPending} onUpdated={load} onDetails={requirement=>{setFocusedRequirement(previous=>({id:requirement.id,request:previous.request+1}));setView("By requirement");requestAnimationFrame(()=>viewButtons.current[2]?.focus());}} />}/>:<><BulkUploadWorkspace data={data} disabled={sending||organizing} onBusy={setBulkBusy} onPendingChange={setBulkPending} onUpdated={load} onDetails={requirement=>{setFocusedRequirement(previous=>({id:requirement.id,request:previous.request+1}));setView("By requirement");requestAnimationFrame(()=>viewButtons.current[2]?.focus());}} />{groundedRetrieval&&<ConversationAnswers key={`answers-${applicationId}`} applicationId={applicationId}/>} {conversationUploads&&<ConversationUploads key={applicationId} applicationId={applicationId}/>}</>}</div>
        <div id="borrower-view-1" role="tabpanel" aria-labelledby="borrower-tab-1" hidden={view!=="By file"}><OrganizeFiles data={data} onUpdated={load} disabled={sending||busy||bulkBusy||pendingFiles>0||bulkPending>0} onBusy={setOrganizing} /></div>
        <div id="borrower-view-2" role="tabpanel" aria-labelledby="borrower-tab-2" hidden={view!=="By requirement"}><RequirementWorkspace focus={focusedRequirement} data={data} disabled={sending||busy||bulkBusy||organizing} onBusy={setOrganizing} onUpdated={load} onUpload={r=>open(r,"upload")} /></div>
      </>}
    </main>
    {data && <SendForReview snapshot={data} blocked={busy || bulkBusy || removing || organizing || pendingFiles > 0 || bulkPending > 0} onBusy={setSending} onSent={setData} onRefresh={load} />}
    <dialog className="simple-task borrower-document-task" ref={dialog} onClose={finishClose} onCancel={event => {event.preventDefault();close();}}
      onPointerDown={event => {
        const bounds = event.currentTarget.getBoundingClientRect();
        const outside = event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
        backdropPointer.current = event.isPrimary && event.button === 0 && event.target === event.currentTarget && outside ? event.pointerId : null;
      }}
      onPointerUp={event => {
        const startedOutside = backdropPointer.current === event.pointerId;
        backdropPointer.current = null;
        const bounds = event.currentTarget.getBoundingClientRect();
        const outside = event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
        if (startedOutside && event.target === event.currentTarget && outside) close();
      }}
      onPointerCancel={() => { backdropPointer.current = null; }} aria-labelledby="upload-title">
      <button className="simple-link task-back" disabled={busy || removing} onClick={close}>{previewId ? "Close document details" : "← Back to your documents"}</button>
      <h2 id="upload-title" tabIndex={-1}>{generalUpload && mode === "upload" ? "Upload documents" : selected?.title}</h2>
      <div hidden={!!previewId}>
      {selected && <details className="compact-guidance"><summary>Requirement guidance</summary><p>{selected.purpose}</p><p><strong>Required period:</strong> {selected.period}</p><RequirementGuidance requirement={task || selected} /></details>}
      {task?.review?.message && <div className="task-feedback"><strong>{task.current ? "From your lender" : "Earlier lender feedback"}</strong><p>{task.review.message}</p>{!task.current && <p>Send your updated files for a new lender review.</p>}</div>}
      {actionError && <div role="alert" className="inline-error">{actionError}<button className="simple-link" disabled={removing} onClick={() => load().then(() => {setRemoveTarget(null);setActionError("");}).catch(error => setActionError(error.message))}>Refresh uploaded files</button></div>}
      {notice && <p className="batch-notice" role="status">{notice}</p>}

      {mode === "upload" && selected && <button className="simple-link" disabled={busy} onClick={viewDetails}>View request details and uploaded files ({task?.files.length || 0})</button>}
      <BatchUpload disabled={sending||bulkBusy||organizing} onPendingChange={setPendingFiles} applicationId={applicationId} mapping={generalUpload && <div className="upload-mapping"><label className="field-label" htmlFor="upload-request">Which request are these files for?</label><select id="upload-request" value={selected?.id || ""} disabled={busy || batchLocked} onChange={event => {setGeneralRequirementId(event.target.value);setSelected(data?.requirements.find(request => request.id === event.target.value) || null);}}><option value="">Let AI find requests / organize later</option>{uploadRequests.map(request => <option key={request.id} value={request.id}>{request.title} — {status(request)}</option>)}</select><p>Choosing a request is optional. New supported CSV uploads are automatically checked for relevant requests.</p></div>} batchKey={generalUpload ? "general" : selected?.id || "general"} requirementId={selected?.id || null} hidden={mode !== "upload" || selected?.collection === "lender"} general={generalUpload} onBusy={setBusy} onLocked={setBatchLocked} onComplete={load} onStartNew={() => {setGeneralRequirementId("");setSelected(null);}} />
      {mode === "details" && task && <>
        <section className="task-files"><div className="task-files-heading"><h3 id="uploaded-documents-title" tabIndex={-1}>Uploaded documents ({task.files.length})</h3>{task.collection !== "lender" && <button className="primary" disabled={removing} onClick={() => {setMode("upload");setRemoveTarget(null);requestAnimationFrame(() => dialog.current?.querySelector<HTMLButtonElement>(".batch-upload > button")?.focus());}}>Add more documents</button>}</div>
          {task.files.length ? <p className="simple-status">{status(task)}</p> : <p>No documents are linked to this request yet.</p>}
          {task.files.map(document => <article className="borrower-file-card" key={document.id}><div className="borrower-file-heading"><div><h4>{document.original_name}</h4><p>{size(document.size_bytes)} · Uploaded {date(document.created_at)}</p>{document.requirement_ids.length > 1 && <p>Also linked to {document.requirement_ids.length - 1} other request{document.requirement_ids.length > 2 ? "s" : ""}.</p>}</div><div className="borrower-file-actions"><button className="secondary" aria-label={`Preview ${document.original_name}`} aria-pressed={previewId === document.id} onClick={event => {previewOpener.current = event.currentTarget;listScroll.current = dialog.current?.scrollTop || 0;setPreviewId(document.id);requestAnimationFrame(() => {if (dialog.current) dialog.current.scrollTop = 0;window.document.getElementById("borrower-preview-title")?.focus({preventScroll:true});});}}>Preview</button><button className="simple-link" disabled={downloading === document.id} aria-label={`Download ${document.original_name}`} onClick={() => download(document)}>{downloading === document.id ? "Downloading…" : "Download"}</button><button className="simple-link remove-file-action" disabled={removing} aria-label={`Remove ${document.original_name} from this request`} onClick={event => {removeOpener.current = event.currentTarget;setActionError("");if (!task.evidence_revision) {setActionError("Refresh this request before removing a document.");return;}setRemoveTarget({document,requirementId:task.id,revision:task.evidence_revision});}}>Remove document</button></div></div>
            {removeTarget?.document.id === document.id && <div className="remove-document-confirm" role="group" aria-label={`Confirm removal of ${document.original_name}`}><p><strong>Remove this document from {task.title}?</strong></p><p>The original stays saved. Links to other requests and any earlier submitted copies or history are kept. This request may need another document.</p><div><button className="secondary" disabled={removing} onClick={() => {setRemoveTarget(null);requestAnimationFrame(() => removeOpener.current?.focus());}}>Keep document</button><button className="primary" disabled={removing} onClick={removeDocument}>{removing ? "Removing…" : "Remove from this request"}</button></div></div>}
          </article>)}
        </section>
        <details className="compact-guidance"><summary>Automatic assessment</summary><AiReview applicationId={data!.application.id} requirement={task} borrower onUpdated={load} compact /></details>
      </>}
      </div>
      {mode === "details" && task?.files.find(document => document.id === previewId) && <section className="borrower-document-preview">
        <button className="simple-link" onClick={backToDocuments}>← Back to documents</button>
        <h3 id="borrower-preview-title" tabIndex={-1}>{task.files.find(document => document.id === previewId)!.original_name}</h3>
        <button className="secondary" disabled={downloading === previewId} onClick={() => download(task.files.find(document => document.id === previewId)!)}>Download original</button>
        <DocumentPreview applicationId={applicationId} key={previewId} document={task.files.find(document => document.id === previewId)!} />
      </section>}
    </dialog>
  </div>;
}
