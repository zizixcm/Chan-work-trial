import { createHash } from "node:crypto";
import { adapters } from "@/lib/runtime";
import { failure, localRequest } from "@/lib/http";
import { UploadError } from "@/lib/validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    localRequest(request);
    const { id } = await params;
    const { repository, storage } = await adapters(request, ["borrower", "lender"], id);
    const document = await repository.document(id);
    if (!document)
      throw new UploadError(
        "This document was not found. Refresh the document list.",
        404,
      );
    let bytes: Uint8Array;
    try {
      bytes = await storage.get(document.storage_key);
    } catch {
      throw new UploadError(
        "The stored file is unavailable. Restore the local data folder from backup, then retry.",
        503,
      );
    }
    if (createHash("sha256").update(bytes).digest("hex") !== document.sha256)
      throw new UploadError(
        "The stored file failed its integrity check. Restore it from backup.",
        503,
      );
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": document.content_type,
        "Content-Disposition": `attachment; filename="document.${document.original_name.split(".").pop()}"; filename*=UTF-8''${encodeURIComponent(document.original_name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16)}`)}`,
        "Content-Length": String(bytes.length),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
