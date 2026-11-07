"use client";
import { useEffect, useState } from "react";
import Papa from "papaparse";
import type { PublicDocument } from "@/lib/model";

type Preview =
  | { kind: "loading" }
  | { kind: "error" | "unsupported"; message: string }
  | { kind: "image" | "pdf"; url: string }
  | { kind: "csv"; rows: string[][]; truncated: boolean }
  | { kind: "text"; text: string; truncated: boolean };

// Read only the authorized original. Never send document bytes to another service.
export default function DocumentPreview({ document: doc, applicationId }: { document: PublicDocument; applicationId?: string }) {
  const [preview, setPreview] = useState<Preview>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [renderError, setRenderError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | undefined;
    setPreview({ kind: "loading" });
    setRenderError(false);
    const contentType = doc.content_type.split(";")[0].trim().toLowerCase();
    const image = ["image/jpeg", "image/png", "image/webp"].includes(contentType);
    const pdf = contentType === "application/pdf";
    const csv = contentType === "text/csv";
    const plain = contentType === "text/plain" && /\.txt$/i.test(doc.original_name);
    const limit = csv || plain ? 1024 * 1024 : 25 * 1024 * 1024;
    async function load() {
      if (!image && !pdf && !csv && !plain) {
        setPreview({ kind: "unsupported", message: "Preview isn’t available for this file type. Download the original to review it." });
        return;
      }
      if (doc.size_bytes > limit) {
        setPreview({ kind: "unsupported", message: "This file is too large for an in-page preview. Download the original to review it." });
        return;
      }
      if (pdf && navigator.pdfViewerEnabled === false) {
        setPreview({ kind: "unsupported", message: "Your browser cannot preview PDFs. Download the original to open it." });
        return;
      }
      try {
        const response = await fetch(`/api/documents/${encodeURIComponent(doc.id)}${applicationId ? `?applicationId=${encodeURIComponent(applicationId)}` : ""}`, { cache: "no-store", credentials: "same-origin", signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "You no longer have access to this document. Sign in again or refresh the application." : "The document could not be loaded. Retry the preview or download the original.");
        if (!response.body) throw new Error("No document content was returned. Retry the preview.");
        const reader = response.body.getReader();
        const chunks: Uint8Array<ArrayBuffer>[] = [];
        let length = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > limit) { await reader.cancel(); throw new Error("This file exceeds the preview size limit. Download the original instead."); }
          chunks.push(new Uint8Array(value));
        }
        if (controller.signal.aborted) return;
        const blob = new Blob(chunks, { type: contentType });
        if (pdf && !new TextDecoder().decode(await blob.slice(0, 1024).arrayBuffer()).includes("%PDF-")) throw new Error("This file could not be recognized as a PDF. Download the original to inspect it.");
        if (controller.signal.aborted) return;
        if (image || pdf) {
          objectUrl = URL.createObjectURL(blob);
          setPreview({ kind: image ? "image" : "pdf", url: objectUrl });
        } else {
          const text = new TextDecoder("utf-8", { fatal: true }).decode(await blob.arrayBuffer());
          if (controller.signal.aborted) return;
          if (csv) {
            const result = Papa.parse<string[]>(text, { preview: 101, skipEmptyLines: "greedy", dynamicTyping: false });
            if (result.errors.some(error => error.type === "Quotes")) throw new Error("The table could not be read reliably. Download the original to review it.");
            setPreview({ kind: "csv", rows: result.data.slice(0, 100).map(row => row.slice(0, 20).map(cell => cell.slice(0, 1000))), truncated: result.data.length > 100 || result.meta.truncated || result.data.some(row => row.length > 20 || row.some(cell => cell.length > 1000)) });
          } else setPreview({ kind: "text", text: text.slice(0, 100000), truncated: text.length > 100000 });
        }
      } catch (error) {
        if (!controller.signal.aborted) setPreview({ kind: "error", message: error instanceof Error ? error.message : "Preview failed. Download the original or try again." });
      }
    }
    const timeout = window.setTimeout(() => {
      controller.abort();
      setPreview({ kind: "error", message: "The preview timed out. Check your connection and retry, or download the original." });
    }, 30000);
    void load().finally(() => window.clearTimeout(timeout));
    return () => { window.clearTimeout(timeout); controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [applicationId, doc.id, doc.sha256, doc.content_type, doc.original_name, doc.size_bytes, attempt]);

  if (preview.kind === "loading") return <p role="status" className="preview-message">Loading document preview…</p>;
  if (preview.kind === "error" || preview.kind === "unsupported" || renderError) return <div className="preview-message" role={preview.kind === "error" || renderError ? "alert" : "status"}><p>{renderError ? "The document could not be displayed. Download the original or retry." : "message" in preview ? preview.message : "Preview unavailable."}</p><button className="l-secondary" onClick={() => setAttempt(value => value + 1)}>Retry preview</button></div>;
  if (preview.kind === "image") return <div className="document-image"><img src={preview.url} alt={`Document preview: ${doc.original_name}`} onError={() => setRenderError(true)} /></div>;
  // Only verified PDF bytes in a typed blob reach the native PDF viewer.
  // iframe sandbox prevents built-in PDF viewers from loading (MDN iframe reference).
  if (preview.kind === "pdf") return <div className="document-pdf"><p>If the PDF does not display, use Download original above.</p><iframe title={`PDF preview: ${doc.original_name}`} src={preview.url} referrerPolicy="no-referrer" onError={() => setRenderError(true)} /></div>;
  if (preview.kind === "text") return <><p>{preview.truncated ? "Partial text preview. Download the original for all content." : "Text preview"}</p><pre className="document-text">{preview.text}</pre></>;
  if (preview.kind === "csv") return <><p className="preview-caption">{preview.truncated ? "Partial table: up to 100 rows, 20 columns and 1,000 characters per cell. Download the original for all content." : "Table preview · Cell values shown as text."} Formulas are not calculated.</p><div className="document-table" tabIndex={0} role="region" aria-label="Document table, scroll horizontally to view more columns"><table><caption>{doc.original_name}</caption><tbody>{preview.rows.map((row, index) => <tr key={index}>{row.map((cell, column) => index === 0 ? <th scope="col" key={column}>{cell}</th> : <td key={column}>{cell}</td>)}</tr>)}</tbody></table></div></>;
  return null;
}
