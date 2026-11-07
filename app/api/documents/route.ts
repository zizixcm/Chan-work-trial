import { adapters } from "@/lib/runtime";
import { boundedFormData, failure, localRequest } from "@/lib/http";
import { UploadError } from "@/lib/validation";
import { saveUpload } from "@/lib/upload";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    localRequest(request, true);
    const { repository, storage, access } = await adapters(request, ["borrower"]);
    const form = await boundedFormData(request);
    const file = form.get("file");
    const single = form.get("requirementId");
    const many = form.getAll("requirementIds");
    if((single!==null && typeof single!=="string") || many.some(id=>typeof id!=="string") || (single && many.length))throw new UploadError("Choose one request selection format.");
    const requirementIds = many.length ? many as string[] : single ? [single as string] : [];
    if (
      !(file instanceof File) ||
      form.getAll("file").length !== 1
    )
      throw new UploadError("Choose one file.");
    for(const requirementId of requirementIds) {
      const requirement = await repository.requirement(requirementId);
      if (requirement?.collection === "lender")throw new UploadError("Your lender or approved provider supplies this document.", 403);
    }
    const id = await saveUpload(
      repository,
      storage,
      requirementIds,
      file.name,
      new Uint8Array(await file.arrayBuffer()),
      { applicationId: access.applicationId, actor: access.displayName },
    );
    return Response.json({ id }, { status: 201 });
  } catch (e) {
    return failure(e);
  }
}
