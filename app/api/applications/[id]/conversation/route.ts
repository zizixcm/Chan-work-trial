import { ConversationRepository } from '@/lib/borrower-chat/repository';
import { parseMessagePage } from '@/lib/borrower-chat/contracts';
import { borrowerAccess, type ApplicationRoute } from '@/lib/borrower-chat/http';
import { failure } from '@/lib/http';
import { json } from '@/lib/jobs/http';
export const runtime = 'nodejs';
export async function GET(request: Request, context: ApplicationRoute) {
  try {
    const access = await borrowerAccess(request, context);
    return json(await new ConversationRepository(access).read(parseMessagePage(new URL(request.url).searchParams)));
  } catch (error) { return failure(error); }
}
export async function POST(request: Request, context: ApplicationRoute) {
  try {
    const result = await new ConversationRepository(await borrowerAccess(request, context)).create();
    return json(result, result.created ? 201 : 200);
  } catch (error) { return failure(error); }
}
