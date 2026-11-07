import { UploadError } from "./validation";
import { MAX_FILE_SIZE } from "./model";
export function localRequest(request: Request, mutation = false) {
  const url = new URL(request.url);
  const external = new URL(
    `${url.protocol}//${request.headers.get("host") || url.host}`,
  );
  if (
    ![url.hostname, external.hostname].every((host) =>
      ["localhost", "127.0.0.1", "[::1]"].includes(host),
    )
  )
    throw new UploadError("This demo is available on localhost only.", 403);
  if (mutation) {
    const origin = request.headers.get("origin");
    // Next may normalize the internal URL to localhost; match the validated Host
    // header so a browser opened at 127.0.0.1 has the correct same-origin target.
    if (!origin || origin !== external.origin)
      throw new UploadError("Upload from the local portal tab.", 403);
  }
}
export function failure(error: unknown) {
  if (error instanceof UploadError)
    return Response.json({ error: error.message }, { status: error.status });
  console.error(
    "Portal operation failed:",
    error instanceof Error ? error.name : "Unknown error",
  );
  return Response.json(
    {
      error:
        "The local service could not complete this action. Check that PostgreSQL is running and local configuration is present, then retry. Existing files are preserved.",
    },
    { status: 500 },
  );
}
export async function boundedFormData(request: Request) {
  const limit = MAX_FILE_SIZE + 1024 * 1024;
  if (Number(request.headers.get("content-length")) > limit)
    throw new UploadError("Upload one file at a time, up to 25 MB.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new UploadError("Choose a file to upload.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new UploadError("Upload one file at a time, up to 25 MB.", 413);
    }
    chunks.push(value);
  }
  try {
    return await new Response(Buffer.concat(chunks), {
      headers: { "content-type": request.headers.get("content-type") || "" },
    }).formData();
  } catch {
    throw new UploadError(
      "The upload was interrupted or malformed. Select your file and try again.",
    );
  }
}
