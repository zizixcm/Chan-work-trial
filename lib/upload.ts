import { createHash, randomUUID } from "node:crypto";
import {
  APPLICATION_ID,
  DEMO_ACTOR,
  type DocumentRepository,
  type BlobStorage,
} from "./model";
import { UploadError, validateFile } from "./validation";
export async function saveUpload(
  repository: DocumentRepository,
  storage: BlobStorage,
  requirementId: string | string[],
  name: string,
  bytes: Uint8Array,
  identity = { applicationId: APPLICATION_ID, actor: DEMO_ACTOR },
) {
  const requirementIds = [...new Set(Array.isArray(requirementId) ? requirementId : requirementId ? [requirementId] : [])];
  if(requirementIds.length>50)throw new UploadError("Choose at most 50 requests.");
  for(const id of requirementIds)if (!(await repository.requirement(id)))
    throw new UploadError("Choose a checklist request before uploading. Refresh the page if the request is missing.",400);
  const multi = repository as DocumentRepository & {insertMany?: (document: import('./model').DocumentRecord, ids:string[])=>Promise<void>};
  if(!multi.insertMany && requirementIds.length!==1)throw new UploadError("Choose a checklist request.");
  const cleanName = name
    .split(/[\\/]/)
    .pop()
    ?.replace(/[\x00-\x1F\x7F]/g, "")
    .trim();
  if (!cleanName || cleanName.length > 200)
    throw new UploadError("Use a filename between 1 and 200 characters.");
  const contentType = await validateFile(cleanName, bytes);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const duplicate = await repository.byChecksum(sha256);
  if (duplicate)
    throw new UploadError(
      `This file is already saved as “${duplicate.original_name}”. Find it in Uploaded files.`,
      409,
    );
  const id = randomUUID();
  const record = {
    id,
    application_id: identity.applicationId,
    original_name: cleanName,
    storage_key: id,
    content_type: contentType,
    size_bytes: bytes.length,
    sha256,
    uploaded_by: identity.actor,
    created_at: new Date().toISOString(),
  };
  await storage.put(id, bytes);
  try {
    if(multi.insertMany)await multi.insertMany(record,requirementIds);
    else await repository.insert(record, requirementIds[0]);
  } catch (error) {
    // Reconcile an uncertain commit before removing any bytes.
    const committed = await repository.document(id) || await repository.byChecksum(sha256);
    if (committed?.id===id) return id;
    await storage.remove(id).catch(() => {});
    if (await repository.byChecksum(sha256))
      throw new UploadError(
        "This file was already saved by another upload. Refresh to see it.",
        409,
      );
    throw error;
  }
  return id;
}
