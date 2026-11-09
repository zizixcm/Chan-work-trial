import { ConversationRepository } from '@/lib/borrower-chat/repository';
import { borrowerAccess, type ApplicationRoute } from '@/lib/borrower-chat/http';
import { failure } from '@/lib/http';
import { body, json } from '@/lib/jobs/http';
export const runtime = 'nodejs';
export async function POST(request: Request, context: ApplicationRoute) {
  try {
    const access = await borrowerAccess(request, context);
    const result = await new ConversationRepository(access).append(await body(request, 32768));
    return json(result, result.replayed ? 200 : 201);
  } catch (error) { return failure(error); }
}
