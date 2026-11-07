"use client";
import AccountMenu from "./account-menu";
import { reviewState } from "@/lib/review-state";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Check,
  CheckCircle2,
  FileText,
  FolderOpen,
  LoaderCircle,
  Plus,
  RefreshCw,
  UploadCloud,
  X,
} from "lucide-react";
import {
  MAX_FILE_SIZE,
  type ApplicationSnapshot,
  type PublicDocument,
  type Requirement,
} from "@/lib/model";

function size(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function date(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
export default function Portal() {
  const [data, setData] = useState<ApplicationSnapshot | null>(null);
  const [loadError, setLoadError] = useState("");
  const [view, setView] = useState<"checklist" | "documents">("checklist");
  const [filter, setFilter] = useState("All requests");
  const [selected, setSelected] = useState<Requirement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [drag, setDrag] = useState(false);
  const [downloading, setDownloading] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const load = useCallback(async () => {
    const res = await fetch("/api/application", { cache: "no-store" });
    if (res.status === 401) { location.assign("/login"); return; }
    const body = await res.json();
    if (!res.ok)
      throw new Error(body.error || "Could not load your application.");
    setData(body);
    setLoadError("");
  }, []);
  useEffect(() => {
    load().catch((e) => setLoadError(e.message));
  }, [load]);
  function open(requirement?: Requirement) {
    opener.current = document.activeElement as HTMLElement;
    setSelected(requirement || data?.requirements[0] || null);
    setFile(null);
    setError("");
    setProgress(0);
    if (fileInput.current) fileInput.current.value = "";
    dialog.current?.showModal();
  }
  function close() {
    if (busy) return;
    dialog.current?.close();
    opener.current?.focus();
  }
  function choose(files: FileList | null) {
    setError("");
    if (!files?.length) return;
    if (files.length !== 1) {
      setError(
        "Choose one file at a time. You can add more after each upload.",
      );
      return;
    }
    const next = files[0];
    if (!/\.(pdf|xlsx|csv|jpg|jpeg|png|webp)$/i.test(next.name)) {
      setFile(null);
      setError("Choose a PDF, XLSX, CSV, JPG, PNG, or WebP file.");
      return;
    }
    if (!next.size || next.size > MAX_FILE_SIZE) {
      setFile(null);
      setError(
        next.size
          ? "This file exceeds 25 MB. Split it or export a smaller copy."
          : "This file is empty. Choose a file with content.",
      );
      return;
    }
    setFile(next);
  }
  async function upload() {
    if (!file || !selected) return;
    setBusy(true);
    setError("");
    setProgress(0);
    const form = new FormData();
    form.set("file", file);
    form.set("requirementId", selected.id);
    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/documents");
        xhr.timeout = 120000;
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable)
            setProgress(Math.round((event.loaded / event.total) * 100));
        };
        xhr.onload = () => {
          let body;
          try {
            body = JSON.parse(xhr.responseText);
          } catch {
            reject(
              new Error(
                "The server could not finish the upload. Refresh the list, then retry.",
              ),
            );
            return;
          }
          if (xhr.status === 201) resolve();
          else
            reject(new Error(body.error || "Upload failed. Please try again."));
        };
        xhr.onerror = () =>
          reject(
            new Error(
              "Connection lost. Check your connection, then retry. Saved files remain in Uploaded documents.",
            ),
          );
        xhr.ontimeout = () =>
          reject(
            new Error(
              "The upload timed out. Refresh the document list before retrying; it may have been saved.",
            ),
          );
        xhr.send(form);
      });
      const name = file.name;
      try {
        await load();
        setNotice(
          `“${name}” saved. This request is provided, pending lender review.`,
        );
      } catch {
        setLoadError(
          "Your file was saved, but the list could not refresh. Use Retry to reload it.",
        );
      }
      dialog.current?.close();
      opener.current?.focus();
      setFile(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Upload failed. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function download(doc: PublicDocument) {
    setDownloading(doc.id);
    setNotice("");
    try {
      const res = await fetch(`/api/documents/${doc.id}`);
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error);
      }
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = doc.original_name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setNotice(
        `Download failed: ${e instanceof Error ? e.message : "Please try again."}`,
      );
    } finally {
      setDownloading("");
    }
  }
  const provided =
    data?.requirements.filter((r) =>
      data.documents.some((d) => d.requirement_ids.includes(r.id)),
    ).length || 0;
  const total = data?.requirements.length || 9;
  const attentionCount =
    data?.requirements.filter(
      (r) =>
        !data.documents.some((d) => d.requirement_ids.includes(r.id)) ||
        reviewState(r.id, data.documents, data.reviews).status ===
          "Changes requested",
    ).length || 0;
  const categories = ["Property", "Financing", "Borrower", "Guarantor"];
  return (
    <div className="shell">
      <header className="borrower-header">
        <a className="brand" href="/" aria-label="Proximitty home">
          proximitty<span className="brand-dot">.</span>
        </a>
        <span>Borrower portal</span>
        <a href="/login" className="portal-switch">
          Lender portal ↗
        </a>
      </header>
      <AccountMenu />
      <div className="borrower-demo">
        Local workspace · Signed-in account · Synthetic application
      </div>
      <div className="main-shell">
        <main>
          <div className="page-heading">
            <div>
              <h1>
                {view === "checklist" ? "Your documents" : "Uploaded files"}
              </h1>
              <p>
                {view === "checklist"
                  ? "Upload the documents below. Your progress saves automatically."
                  : "Download any file you have already uploaded."}
              </p>
            </div>
            <button className="primary" onClick={() => open()} disabled={!data}>
              <Plus size={18} />
              Upload a file
            </button>
          </div>
          {loadError && (
            <div className="alert error" role="alert">
              {loadError}
              <button
                onClick={() => load().catch((e) => setLoadError(e.message))}
              >
                <RefreshCw size={15} />
                Retry
              </button>
            </div>
          )}
          {notice && (
            <div className="alert" role="status">
              {notice}
              <button
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {!data && !loadError && (
            <div className="loading" role="status">
              <LoaderCircle className="spin" />
              Loading your application…
            </div>
          )}
          {data && (
            <>
              <div className="borrower-context">
                <strong>{data.application.property_name}</strong>
                <span>{data.application.borrower_name}</span>
                <details>
                  <summary>Application details</summary>
                  <p>{data.application.address}</p>
                  <p>
                    ${data.application.requested_amount.toLocaleString()} ·{" "}
                    {data.application.transaction_type}
                  </p>
                </details>
              </div>
              <nav className="borrower-tabs" aria-label="Documents">
                <button
                  aria-pressed={view === "checklist"}
                  onClick={() => setView("checklist")}
                >
                  What to upload
                </button>
                <button
                  aria-pressed={view === "documents"}
                  onClick={() => setView("documents")}
                >
                  Uploaded files ({data.documents.length})
                </button>
              </nav>
              <div className="content-grid">
                <div className="work-area">
                  <section className="documents-panel">
                    <div className="panel-title">
                      <div>
                        <h2>
                          {view === "checklist"
                            ? "Requested documents"
                            : "Uploaded documents"}
                        </h2>
                        <p>
                          {view === "checklist"
                            ? `${provided} of ${total} requests have files. Your lender will review them.`
                            : `${data.documents.length} original file${data.documents.length === 1 ? "" : "s"} · no automated analysis`}
                        </p>
                      </div>
                      <span className="count-badge">
                        {view === "checklist" ? total : data.documents.length}
                      </span>
                    </div>
                    {view === "checklist" ? (
                      <>
                        <div className="filters" aria-label="Filter checklist">
                          {["All requests", "Still needed"].map((item) => (
                            <button
                              aria-pressed={filter === item}
                              className={filter === item ? "selected" : ""}
                              key={
                                item === "Still needed"
                                  ? "Needs attention"
                                  : item === "Provided"
                                    ? "Uploaded"
                                    : "All documents"
                              }
                              onClick={() => setFilter(item)}
                            >
                              {item === "Still needed"
                                ? "Needs attention"
                                : item === "Provided"
                                  ? "Uploaded"
                                  : "All documents"}
                              {item === "Still needed" && (
                                <span>{attentionCount}</span>
                              )}
                            </button>
                          ))}
                        </div>
                        {categories.map((category) => {
                          const requirements = data.requirements
                            .filter((r) => r.category === category)
                            .filter((r) => {
                              const supplied = data.documents.some((d) =>
                                d.requirement_ids.includes(r.id),
                              );
                              return (
                                filter === "All requests" ||
                                (filter === "Provided"
                                  ? supplied
                                  : !supplied ||
                                    reviewState(
                                      r.id,
                                      data.documents,
                                      data.reviews,
                                    ).status === "Changes requested")
                              );
                            });
                          if (!requirements.length) return null;
                          return (
                            <div className="category" key={category}>
                              <h3>
                                {category}
                                <span>{requirements.length}</span>
                              </h3>
                              {requirements.map((r) => {
                                const docs = data.documents.filter((d) =>
                                  d.requirement_ids.includes(r.id),
                                );
                                return (
                                  <article className="request" key={r.id}>
                                    <div
                                      className={
                                        docs.length
                                          ? "request-icon supplied"
                                          : "request-icon"
                                      }
                                    >
                                      {docs.length ? (
                                        <Check size={18} />
                                      ) : (
                                        <FileText size={19} />
                                      )}
                                    </div>
                                    <div className="request-body">
                                      <div className="request-title">
                                        <h4>{r.title}</h4>
                                        <span
                                          className={
                                            docs.length
                                              ? "status provided"
                                              : "status"
                                          }
                                        >
                                          {reviewState(
                                            r.id,
                                            data.documents,
                                            data.reviews,
                                          ).status === "Accepted"
                                            ? "Accepted"
                                            : reviewState(
                                                  r.id,
                                                  data.documents,
                                                  data.reviews,
                                                ).status === "Changes requested"
                                              ? "Changes requested"
                                              : docs.length
                                                ? "Uploaded"
                                                : "Needed"}
                                        </span>
                                      </div>

                                      {(() => {
                                        const state = reviewState(
                                          r.id,
                                          data.documents,
                                          data.reviews,
                                        );
                                        return state.review?.message ? (
                                          <div className="borrower-feedback">
                                            <strong>
                                              {state.current
                                                ? "From your lender"
                                                : "Earlier lender feedback"}
                                            </strong>
                                            <p>{state.review.message}</p>
                                            {!state.current && (
                                              <small>
                                                Your new files are ready for
                                                lender review.
                                              </small>
                                            )}
                                          </div>
                                        ) : null;
                                      })()}
                                      <div className="period">{r.period}</div>
                                      <details>
                                        <summary>
                                          Details & files
                                          {docs.length
                                            ? ` · ${docs.length} file${docs.length > 1 ? "s" : ""}`
                                            : ""}
                                        </summary>
                                        <div className="details-content">
                                          <p>{r.purpose}</p>
                                          <p>
                                            <strong>Responsible party:</strong>{" "}
                                            {r.owner}
                                          </p>
                                          <p>
                                            {r.applicability}. Reporting periods
                                            are demo assumptions.
                                          </p>
                                          <p>
                                            Accepted: PDF, XLSX, CSV, JPG, PNG,
                                            WebP · 25 MB per file. Files are
                                            stored without financial analysis.
                                          </p>
                                          {docs.map((doc) => (
                                            <button
                                              className="file-link"
                                              key={doc.id}
                                              disabled={downloading === doc.id}
                                              onClick={() => download(doc)}
                                            >
                                              <ArrowDownToLine size={14} />
                                              {doc.original_name}
                                              <span>
                                                {size(doc.size_bytes)}
                                              </span>
                                            </button>
                                          ))}
                                        </div>
                                      </details>
                                    </div>
                                    <button
                                      className="upload-small"
                                      aria-label={`Upload ${r.title}`}
                                      onClick={() => open(r)}
                                    >
                                      <Plus size={16} />
                                      <span>
                                        {docs.length ? "Add file" : "Upload"}
                                      </span>
                                    </button>
                                  </article>
                                );
                              })}
                            </div>
                          );
                        })}
                        {((filter === "Provided" && !provided) ||
                          (filter === "Still needed" &&
                            attentionCount === 0)) && (
                          <div className="empty">
                            <CheckCircle2 />
                            <h3>
                              {filter === "Provided"
                                ? "Your first upload starts here."
                                : "All requests have files."}
                            </h3>
                            <p>
                              {filter === "Provided"
                                ? "Choose All documents to find a document to upload."
                                : "Files are provided and still need lender review."}
                            </p>
                          </div>
                        )}
                      </>
                    ) : data.documents.length ? (
                      <div className="file-list">
                        {data.documents.map((doc) => (
                          <article className="file-row" key={doc.id}>
                            <div className="request-icon">
                              <FileText size={21} />
                            </div>
                            <div>
                              <h3>{doc.original_name}</h3>
                              <p>
                                {
                                  data.requirements.find((r) =>
                                    doc.requirement_ids.includes(r.id),
                                  )?.title
                                }
                              </p>
                              <small>
                                {size(doc.size_bytes)} · Uploaded{" "}
                                {date(doc.created_at)} · Stored, not analyzed
                              </small>
                            </div>
                            <button
                              aria-label={`Download ${doc.original_name}`}
                              disabled={downloading === doc.id}
                              onClick={() => download(doc)}
                            >
                              {downloading === doc.id ? (
                                <LoaderCircle className="spin" size={18} />
                              ) : (
                                <>
                                  <ArrowDownToLine size={18} />
                                  <span>Download</span>
                                </>
                              )}
                            </button>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <div className="empty">
                        <FolderOpen size={36} />
                        <h3>A home for every document.</h3>
                        <p>
                          Upload your first file to get started.
                          <br />
                          Your originals will be available here.
                        </p>
                        <button className="primary" onClick={() => open()}>
                          <Plus size={16} />
                          Upload document
                        </button>
                      </div>
                    )}
                  </section>
                </div>
              </div>
              <footer>
                <span>Proximitty · Borrower workspace</span>
                <span>
                  Synthetic application · Private storage · Authenticated access
                </span>
              </footer>
            </>
          )}
        </main>
      </div>
      <dialog
        ref={dialog}
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        aria-labelledby="upload-title"
      >
        <div className="modal-heading">
          <div className="modal-icon">
            <UploadCloud size={24} />
          </div>
          <button aria-label="Close upload" disabled={busy} onClick={close}>
            <X size={20} />
          </button>
        </div>
        <h2 id="upload-title">Add a document</h2>
        <p className="modal-description">
          Save an original file to your application checklist.
        </p>
        <label className="field-label" htmlFor="requirement">
          Document type
        </label>
        <select
          id="requirement"
          disabled={busy}
          value={selected?.id || ""}
          onChange={(e) =>
            setSelected(
              data?.requirements.find((r) => r.id === e.target.value) || null,
            )
          }
        >
          {data?.requirements.map((r) => (
            <option value={r.id} key={r.id}>
              {r.title}
            </option>
          ))}
        </select>
        <input
          ref={fileInput}
          id="file"
          type="file"
          accept=".pdf,.xlsx,.csv,.jpg,.jpeg,.png,.webp"
          disabled={busy}
          onChange={(e) => choose(e.target.files)}
          className="file-input"
        />
        <label
          htmlFor="file"
          className={`dropzone ${drag ? "drag" : ""} ${busy ? "disabled" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            if (!busy) setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            if (!busy) choose(e.dataTransfer.files);
          }}
        >
          <UploadCloud size={28} />
          <strong>{file ? file.name : "Choose a file or drag it here"}</strong>
          <span>
            {file
              ? `${size(file.size)} · Click to choose another file`
              : "PDF, XLSX, CSV, JPG, PNG, WebP · Up to 25 MB per file"}
          </span>
        </label>
        <p className="upload-help">
          Use synthetic files only. Password-protected files are not supported.
          Files are saved without financial analysis.
        </p>
        {busy && (
          <div className="upload-progress" role="status">
            <span>
              {progress === 100
                ? "Validating and saving…"
                : `Uploading… ${progress}%`}
            </span>
            <progress value={progress} max={100} />
          </div>
        )}
        {error && (
          <div className="inline-error" role="alert">
            {error}
            <span>You can choose another file or retry below.</span>
          </div>
        )}
        <div className="modal-actions">
          <button className="secondary" disabled={busy} onClick={close}>
            Cancel
          </button>
          <button
            className="primary"
            disabled={busy || !file || !selected}
            onClick={upload}
          >
            {busy ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <UploadCloud size={17} />
            )}{" "}
            {busy ? "Saving…" : error ? "Retry upload" : "Upload document"}
          </button>
        </div>
      </dialog>
    </div>
  );
}
