import { adapters } from '@/lib/runtime';
import { failure } from '@/lib/http';
import { UploadError } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string; requirementId: string }> };

async function setLink(request: Request, context: Context, linked: boolean) {
  try {
    const { id, requirementId } = await context.params;
    const { repository } = await adapters(request, ['borrower'], id);
    const expected = new URL(request.url).searchParams.get('expectedEvidenceRevision');
    if (!expected || !/^(0|[1-9][0-9]{0,18})$/.test(expected)) {
      throw new UploadError('Refresh this request before changing its documents.');
    }
    const result = await repository.setDocumentRequirement(id, requirementId, linked, expected);
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return failure(error);
  }
}

export function PUT(request: Request, context: Context) { return setLink(request, context, true); }
export function DELETE(request: Request, context: Context) { return setLink(request, context, false); }
