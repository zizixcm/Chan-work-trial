"use client";
import ApplicationList from "../components/application-list";
import { useApplication } from "./use-application";
import { reviewState } from "@/lib/review-state";
export default function LenderHome() {
  const {data, error, refresh} = useApplication();
  const ready = data?.requirements.filter(r => reviewState(r.id, data.documents, data.reviews).status === "Ready to review") || [];
  const changes = data?.requirements.filter(r => reviewState(r.id, data.documents, data.reviews).status === "Changes requested") || [];
  return <ApplicationList items={data ? [{id:data.application.id,name:data.application.property_name,secondary:`${data.application.borrower_name} · ${data.application.transaction_type}`,href:`/lender/review?applicationId=${encodeURIComponent(data.application.id)}`,status:!data.submission ? "Awaiting submission" : ready.length ? `${ready.length} ready to review` : changes.length ? "Awaiting changes" : data.documents.length ? "No new files" : "Awaiting documents"}] : null} error={error} onRetry={()=>void refresh()} emptyMessage="Applications will appear here when you have access." />;
}
