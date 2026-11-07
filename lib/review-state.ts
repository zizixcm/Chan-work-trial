import type { ApplicationSnapshot, RequirementReview } from "./model";
export function reviewState(
  requirementId: string,
  documents: ApplicationSnapshot["documents"],
  reviews: RequirementReview[],
) {
  const files = documents.filter((d) =>
    d.requirement_ids.includes(requirementId),
  );
  const review = reviews.find((r) => r.requirement_id === requirementId);
  const current =
    !!review &&
    review.is_current !== false &&
    JSON.stringify([...review.document_ids].sort()) ===
      JSON.stringify(files.map((d) => d.id).sort());
  const status = current
    ? review.decision === "accepted"
      ? "Accepted"
      : "Changes requested"
    : files.length
      ? "Ready to review"
      : "Not uploaded";
  return { files, review, current, status };
}
