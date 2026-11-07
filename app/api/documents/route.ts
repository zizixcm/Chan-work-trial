import { adapters } from "@/lib/runtime";
import { boundedFormData, failure, localRequest } from "@/lib/http";
import { UploadError } from "@/lib/validation";
import { saveUpload } from "@/lib/upload";
import { PostgresRepository } from '@/lib/postgres';
import { UploadBatchService } from '@/lib/jobs/batches';
import { createHash } from 'node:crypto';
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
    const bytes=new Uint8Array(await file.arrayBuffer());
    const batchId=form.get('batchId'),memberId=form.get('memberId');
    if((batchId||memberId)&&(typeof batchId!=='string'||!batchId||typeof memberId!=='string'||!memberId))throw new UploadError('Invalid batch reference.');
    const ref=typeof batchId==='string'&&typeof memberId==='string'?{batchId,memberId}:undefined;
    if(ref) {
      const hash=createHash('sha256').update(bytes).digest('hex');
      const prior=await repository.byChecksum(hash);
      if(prior)return Response.json({id:await new UploadBatchService(access).attachExisting(ref,prior.id,hash,file.name,requirementIds)},{status:201});
    }
    const id = await saveUpload(
      ref?new PostgresRepository(access,ref):repository,
      storage,
      requirementIds,
      file.name,
      bytes,
      { applicationId: access.applicationId, actor: access.displayName },
    );
    return Response.json({ id }, { status: 201 });
  } catch (e) {
    return failure(e);
  }
}
