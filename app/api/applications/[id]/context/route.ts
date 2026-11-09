import { BorrowerContextService } from '@/lib/borrower-chat/context';
import { borrowerAccess, type ApplicationRoute } from '@/lib/borrower-chat/http';
import { failure } from '@/lib/http';
import { json } from '@/lib/jobs/http';
export const runtime = 'nodejs';
export async function GET(request: Request, context: ApplicationRoute) {
  try { return json(await new BorrowerContextService(await borrowerAccess(request, context)).read()); }
  catch (error) { return failure(error); }
}
