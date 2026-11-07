"use client";
import { useApplication } from "./use-application";
import { reviewState } from "@/lib/review-state";
export default function LenderHome() {
  const {data, error, refresh} = useApplication();
  const ready = data?.requirements.filter(r => reviewState(r.id, data.documents, data.reviews).status === "Ready to review") || [];
  const changes = data?.requirements.filter(r => reviewState(r.id, data.documents, data.reviews).status === "Changes requested") || [];
  return <main className="l-main simple-queue"><div className="l-page-heading"><h1>Your applications</h1><p>Open an application to review its documents.</p></div>
    {error && <div className="l-error" role="alert">{error}<button onClick={refresh}>Try again</button></div>}
    {!data && !error && <p role="status">Loading applications…</p>}
    {data && <article className="queue-item"><div><h2>{data.application.property_name}</h2><p>{data.application.borrower_name} · {data.application.transaction_type}</p><p className="queue-status">{!data.submission ? "Waiting for borrower to send for review" : ready.length ? `${ready.length} document request${ready.length === 1 ? " is" : "s are"} ready for review` : changes.length ? "Waiting for borrower changes" : data.documents.length ? "No new files to review" : "Waiting for documents"}</p>{ready.length > 0 && <p>{ready.slice(0, 2).map(r => r.title).join(" · ")}{ready.length > 2 ? ` · and ${ready.length - 2} more` : ""}</p>}</div><a className="l-primary" href={`/lender/review?applicationId=${encodeURIComponent(data.application.id)}`}>{ready.length ? "Review documents" : "Open application"}</a></article>}
  </main>;
}
