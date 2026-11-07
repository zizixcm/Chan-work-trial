import { adapters } from "@/lib/runtime";
import { failure, localRequest } from "@/lib/http";
import { UploadError } from "@/lib/validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    localRequest(request);
    return Response.json(await (await adapters(request, ["lender"])).repository.lenderSnapshot(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    localRequest(request, true);
    const { repository: repo, storage } = await adapters(request, ["lender"]);
    const reader = request.body?.getReader();
    if (!reader) throw new UploadError("Enter a review to save.");
    const parts: Uint8Array[] = [];
    let length = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 20000) {
        await reader.cancel();
        throw new UploadError(
          "Your note is too long. Keep it under 5,000 characters.",
          413,
        );
      }
      parts.push(value);
    }
    let body;
    try {
      body = JSON.parse(Buffer.concat(parts).toString());
    } catch {
      throw new UploadError("The review could not be read. Please try again.");
    }
    if (!body || typeof body !== "object")
      throw new UploadError("Invalid review.");
    if (body.action === "note") {
      if (
        typeof body.body !== "string" ||
        body.body.length > 5000 ||
        !(
          body.expectedUpdatedAt === null ||
          typeof body.expectedUpdatedAt === "string"
        )
      )
        throw new UploadError("Notes must be under 5,000 characters.");
      await repo.saveNote(body.body, body.expectedUpdatedAt);
    } else {
      if (
        !["accepted", "changes_requested"].includes(body.decision) ||
        typeof body.requirementId !== "string" ||
        typeof body.message !== "string" ||
        body.message.length > 2000 ||
        !Array.isArray(body.documentIds) ||
        body.documentIds.length > 1000 ||
        !body.documentIds.every((id: unknown) => typeof id === "string") ||
        !(
          body.expectedReviewId === null ||
          typeof body.expectedReviewId === "string"
        )
      )
        throw new UploadError(
          "Choose a review outcome and keep your message under 2,000 characters.",
        );
      // Acceptance requires all referenced files to remain available and intact.
      if (body.decision === "accepted") {
        const { createHash } = await import("node:crypto");
        for (const id of body.documentIds) {
          const d = await repo.document(id);
          if (!d)
            throw new UploadError(
              "A document is unavailable. Refresh the page.",
              409,
            );
          let bytes;
          try {
            bytes = await storage.get(d.storage_key);
          } catch {
            throw new UploadError(
              "A file is missing from storage. Restore it before accepting this request.",
              409,
            );
          }
          if (createHash("sha256").update(bytes).digest("hex") !== d.sha256)
            throw new UploadError(
              "A file failed its integrity check. Restore it before accepting.",
              409,
            );
        }
      }
      await repo.saveReview(
        body.requirementId,
        body.decision,
        body.message,
        body.documentIds,
        body.expectedReviewId,
        body.expectedSubmissionId,
      );
    }
    return Response.json(await repo.lenderSnapshot());
  } catch (e) {
    return failure(e);
  }
}
