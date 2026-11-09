import { ConversationUploads } from '@/lib/borrower-chat/uploads';
import { borrowerAccess, type ApplicationRoute } from '@/lib/borrower-chat/http';
import { failure } from '@/lib/http';
import { json } from '@/lib/jobs/http';
export const runtime = 'nodejs';
export async function GET(request: Request, context: ApplicationRoute) {
  try {
    const access=await borrowerAccess(request,context);
    return json(await new ConversationUploads(access).read(new URL(request.url).searchParams.get('before')??undefined));
  } catch(error) { return failure(error); }
}
