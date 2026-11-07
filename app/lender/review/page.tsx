"use client";
import AiReview from "@/app/components/ai-review";
import RequirementGuidance from "@/app/components/requirement-guidance";
import { useEffect, useRef, useState } from "react";
import { useApplication } from "../use-application";
import { reviewState } from "@/lib/review-state";
import type { PublicDocument } from "@/lib/model";
import DocumentPreview from "../../components/document-preview";

import WorkspaceDialog from "./workspace-dialog";

export default function ReviewApplication() {
  const { data, setData, error, refresh } = useApplication();
  const [userId, setUserId] = useState("");
  const [sessionPending, setSessionPending] = useState(true);
  const [sessionError, setSessionError] = useState("");
  useEffect(() => {
    const controller=new AbortController();
    fetch("/api/session",{cache:"no-store",signal:controller.signal}).then(async response=>{
      if(!response.ok)throw new Error("Could not load your workspace identity. Refresh this page to try again.");
      const session=await response.json();
      if(!session.userId)throw new Error("Could not identify your draft workspace. Refresh this page to try again.");
      if(!controller.signal.aborted)setUserId(session.userId);
    }).catch(error=>{if(!controller.signal.aborted)setSessionError(error.message);}).finally(()=>{if(!controller.signal.aborted)setSessionPending(false);});
    return ()=>controller.abort();
  }, []);
  const [selected, setSelected] = useState("");
  const [selectedFile, setSelectedFile] = useState("");
  const [modal, setModal] = useState<"review" | null>(null);
  const [changing, setChanging] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [feedbackFiles, setFeedbackFiles] = useState<Record<string, string>>({});
  const [loadedScope, setLoadedScope] = useState("");
  const [draftWarning, setDraftWarning] = useState("");
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [notice, setNotice] = useState("");
  const [saveError, setSaveError] = useState("");
  const [downloading, setDownloading] = useState("");
  const messageField = useRef<HTMLTextAreaElement>(null);
  const changeButton = useRef<HTMLButtonElement>(null);
  const returnToDecision = useRef(false);
  const scope = userId && data?.application.id ? `lender-drafts:${userId}:${data.application.id}` : "";
  const draftsReady = !!scope && loadedScope === scope;

  useEffect(() => {
    if (!scope) { setLoadedScope(""); setDrafts({}); setFeedbackFiles({}); return; }
    setDrafts({}); setFeedbackFiles({}); setDraftWarning("");
    try {
      const saved = JSON.parse(localStorage.getItem(scope) || "{}");
      if (saved.reviews && typeof saved.reviews === "object" && !Array.isArray(saved.reviews) && Object.values(saved.reviews).every(value => typeof value === "string")) setDrafts(saved.reviews);
      if (saved.feedbackFiles && typeof saved.feedbackFiles === "object" && !Array.isArray(saved.feedbackFiles) && Object.values(saved.feedbackFiles).every(value => typeof value === "string")) setFeedbackFiles(saved.feedbackFiles);
    } catch { setDraftWarning("Browser draft storage is unavailable. Keep this page open until you save."); }
    setLoadedScope(scope);
  }, [scope]);
  function persist(nextDrafts: Record<string, string>, nextFiles = feedbackFiles) {
    if (!scope) return;
    try { localStorage.setItem(scope, JSON.stringify({ ...JSON.parse(localStorage.getItem(scope) || "{}"), reviews: nextDrafts, feedbackFiles: nextFiles })); }
    catch { setDraftWarning("Your draft remains on this page. Browser storage is unavailable, so save before leaving."); }
  }
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (Object.values(drafts).some(value => value.trim())) event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [drafts]);
  const req = data?.requirements.find(r => r.id === selected) || data?.requirements.find(r => reviewState(r.id, data.documents, data.reviews).status === "Ready to review") || data?.requirements[0];
  const current = data && req ? reviewState(req.id, data.documents, data.reviews) : null;
  const feedbackFileId = req ? feedbackFiles[req.id] || "" : "";
  const feedbackFile = current?.files.find(document => document.id === feedbackFileId);
  const feedbackFileMissing = !!feedbackFileId && !feedbackFile;
  const feedbackPrefix = feedbackFile ? `Document needing attention: ${feedbackFile.original_name}\n\n` : "";
  const feedbackMessage = feedbackPrefix + (req ? drafts[req.id] || "" : "");
  const file = current?.files.find(document => document.id === selectedFile) || current?.files[0];
  useEffect(() => {
    if (changing && modal === "review") messageField.current?.focus();
    else if (!changing && returnToDecision.current) { changeButton.current?.focus(); returnToDecision.current = false; }
  }, [changing]);
  function choose(id: string) {
    setSelected(id); setSelectedFile(""); setChanging(false); setSaveError(""); setNotice("");
  }
  function chooseFile(requestId: string, documentId: string) {
    setSelected(requestId); setSelectedFile(documentId);
    setChanging(false); setSaveError(""); setNotice("");
  }
  function draft(value: string) {
    if (!req || !draftsReady) return;
    const next = { ...drafts, [req.id]: value }; setDrafts(next); persist(next);
  }
  function backToReview() { returnToDecision.current = true; setChanging(false); }
  async function save(payload: unknown) {
    if (saving.current || !draftsReady) return;
    saving.current = true; setBusy(true); setSaveError(""); setNotice("");
    if (req) setSelected(req.id);
    try {
      const response = await fetch(`/api/lender?applicationId=${encodeURIComponent(data!.application.id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save. Please try again.");
      setData(result);
        setChanging(false);
        const next = { ...drafts }; if (req) delete next[req.id]; setDrafts(next); const nextFiles = { ...feedbackFiles }; if (req) delete nextFiles[req.id]; setFeedbackFiles(nextFiles); persist(next, nextFiles);
        setNotice("Review saved. The borrower checklist has been updated.");
        requestAnimationFrame(() => changeButton.current?.focus());

    } catch (error) { setSaveError(error instanceof Error ? error.message : "Could not save. Please try again."); }
    finally { saving.current = false; setBusy(false); }
  }
  async function download(document: PublicDocument) {
    setDownloading(document.id); setSaveError("");
    try {
      const response = await fetch(`/api/documents/${encodeURIComponent(document.id)}?applicationId=${encodeURIComponent(data!.application.id)}`, { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error("Download failed. Refresh the application or try again.");
      const url = URL.createObjectURL(await response.blob());
      const link = window.document.createElement("a"); link.href = url; link.download = document.original_name;
      window.document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (error) { setSaveError(error instanceof Error ? error.message : "Download failed. Please try again."); }
    finally { setDownloading(""); }
  }
  function reviewPayload(decision: "accepted" | "changes_requested") {
    return { expectedSubmissionId: data?.submission?.id, requirementId: req?.id, decision, message: decision === "changes_requested" ? feedbackMessage : "", documentIds: current?.files.map(document => document.id) || [], expectedReviewId: current?.review?.id || null };
  }
  return <main className="l-main l-review-main">
    <a className="l-back" href={data ? `/lender?applicationId=${encodeURIComponent(data.application.id)}` : "/lender"}>← All applications</a>
    {error && <div className="l-error" role="alert">{error}<button onClick={refresh}>Refresh application</button></div>}
    {!data ? <p role="status">Loading application…</p> : <>
      <div className="l-review-heading"><div><h1>{data.application.property_name}</h1></div><div className="review-page-tools"><details><summary>Application details</summary><p>{data.application.borrower_name} · {data.application.transaction_type}</p><p>{data.application.address}</p><p>Requested loan: ${data.application.requested_amount.toLocaleString()}</p></details></div></div>
      {!data.submission && <section className="l-waiting-submission"><h2>Waiting for the borrower</h2><p>Documents will appear here after the borrower sends this application for review.</p></section>}
      {data.submission && <>
      <div className="review-requirement-bar"><nav className="requirement-strip" aria-label="Requirements">{data.requirements.map(request => <button key={request.id} aria-pressed={req?.id === request.id} disabled={busy} onClick={() => choose(request.id)}>{request.title}</button>)}</nav>{req && <p className="review-requirement-period"><strong>Required period:</strong> {req.period}</p>}</div>
      <div className="document-review-layout">
        <aside className="document-navigation" aria-labelledby="document-navigation-title">
          <h2 id="document-navigation-title">Documents</h2>
          <nav aria-label="Documents for selected requirement">
            <ul>{current?.files.map(document => <li key={document.id}><button className="document-navigation-file" disabled={busy} aria-pressed={file?.id === document.id} onClick={() => req && chooseFile(req.id, document.id)}><strong>{document.original_name}</strong><span>Uploaded {new Date(document.created_at).toLocaleDateString()}</span></button></li>)}</ul>
            {!current?.files.length && <p>No files uploaded for this requirement.</p>}
          </nav>
        </aside>
        <div className="document-review-content">
      {!modal && notice && <p className="l-notice" role="status">{notice}</p>}
      {!modal && saveError && <div className="l-error" role="alert">{saveError} Your unsaved text is still here.<button onClick={refresh}>Refresh application</button></div>}
      {draftWarning && <p className="l-error" role="status">{draftWarning}</p>}
      {!draftsReady && <p role="status">{sessionPending ? "Loading your draft workspace…" : sessionError || "Loading your private draft workspace…"}</p>}
      {req && current && <>
        <section className="document-workspace" aria-label="Document workspace">
          <div className="workspace-heading"><div>{file ? <strong className="workspace-file-name">{file.original_name}</strong> : <h3>No files uploaded yet</h3>}</div>{file && <button className="l-secondary" disabled={downloading === file.id} onClick={() => download(file)}>{downloading === file.id ? "Downloading…" : "Download original"}</button>}</div>
          <div className="workspace-panel">{file ? <DocumentPreview applicationId={data.application.id} key={file.id} document={file} /> : <p>No document is available to preview. Open Review requirement to request a document.</p>}</div>
        </section>
        <div className="review-action-dock"><button className="l-primary floating-review" onClick={() => {setSelected(req.id);setChanging(false);setSaveError("");setNotice("");setModal("review");}}>Review requirement</button></div>
        <WorkspaceDialog open={modal === "review"} title="Review requirement" busy={busy} onClose={() => setModal(null)}>
          {notice && <p className="l-notice" role="status">{notice}</p>}
          {saveError && <div className="l-error" role="alert">{saveError} Your draft is still here.<button disabled={busy} onClick={refresh}>Refresh application</button></div>}
          {draftWarning && <p role="status">{draftWarning}</p>}
          <div className="workspace-review">
              <AiReview submissionId={data.submission?.id} applicationId={data.application.id} requirement={req} onUpdated={refresh} compact /><div className="requirement-review-scope"><h3>{req.title}</h3><p>Applies to this requirement and its {current.files.length} attached document{current.files.length === 1 ? "" : "s"}.</p>{current.files.length > 0 ? <ul aria-label="Documents covered by this review">{current.files.map(document => <li key={document.id}>{document.original_name}</li>)}</ul> : <p>No files have been uploaded. You can ask the borrower to provide them.</p>}</div>
              {changing ? <><button className="l-back" disabled={busy} onClick={backToReview}>← Back to review</button><h3>Request changes</h3><label htmlFor="feedback-file">Which document needs attention?</label><select id="feedback-file" value={feedbackFileId} disabled={busy || !draftsReady} onChange={event => {const next = {...feedbackFiles, [req.id]: event.target.value};setFeedbackFiles(next);persist(drafts, next);}}><option value="">Missing document / entire requirement</option>{feedbackFileMissing && <option value={feedbackFileId} disabled>Previously selected file is no longer attached</option>}{current.files.map(document => <option key={document.id} value={document.id}>{document.original_name}</option>)}</select>{feedbackFileMissing && <p role="alert">That file is no longer attached. Choose another document or the entire requirement before sending.</p>}<label htmlFor="review-message">What should the borrower change?</label><textarea ref={messageField} id="review-message" rows={5} maxLength={Math.max(0, 2000 - feedbackPrefix.length)} disabled={busy || !draftsReady} value={drafts[req.id] || ""} onChange={event => draft(event.target.value)} aria-describedby="change-audience" /><p id="change-audience">A selected filename is included in the saved message. This remains a review of the entire requirement. The borrower can see the message after you save; no email is sent.</p>{feedbackMessage.length > 2000 && <p role="alert">Shorten the message to allow space for the filename (2,000 characters total).</p>}<button className="l-primary" disabled={busy || !draftsReady || feedbackFileMissing || feedbackMessage.length > 2000 || !drafts[req.id]?.trim()} onClick={() => save(reviewPayload("changes_requested"))}>{busy ? "Saving…" : "Send change request"}</button></> : <><p>{req.purpose}</p><details className="review-criteria"><summary>Requirement guidance</summary><RequirementGuidance requirement={req} /></details>{current.review && <div className="l-saved-review"><strong>{!current.current ? "Updated files need your review" : current.status === "Accepted" ? "Accepted by lender" : "Changes requested"}</strong>{current.review.message && <p>{current.review.message}</p>}<p>{current.review.reviewer} · {new Date(current.review.created_at).toLocaleString()}</p>{!current.current && <p>The previous decision does not cover the current files or requirement criteria.</p>}</div>}<div className="workspace-decisions"><button className="l-primary" disabled={busy || !draftsReady || !current.files.length || current.current && current.status === "Accepted"} onClick={() => save(reviewPayload("accepted"))}>{busy ? "Saving…" : current.current && current.status === "Accepted" ? "Accepted" : "Accept requirement"}</button><button ref={changeButton} className="l-secondary" disabled={busy || !draftsReady} onClick={() => setChanging(true)}>Request changes</button></div><p className="l-help">Requirement acceptance is not loan approval.</p></>}
            </div>
        </WorkspaceDialog>

        {data.reviews.some(review => review.requirement_id === req.id) && <details className="l-history workspace-history"><summary>Earlier reviews and files</summary>{data.reviews.filter(review => review.requirement_id === req.id).map(review => <div key={review.id}><strong>{review.decision === "accepted" ? "Accepted" : "Changes requested"}</strong><span>{new Date(review.created_at).toLocaleString()} · {review.document_ids.length} files reviewed</span>{review.message && <p>{review.message}</p>}{review.document_ids.map(id => { const original = data.documents.find(document => document.id === id); return original ? <button className="l-secondary" key={id} onClick={() => download(original)} disabled={downloading === id}>Download {original.original_name}</button> : <p key={id}>This earlier file is not available in the current document list.</p>; })}</div>)}</details>}

      </>}
        </div>
      </div>
      </>}
    </>}
  </main>;
}
