import { accessFor } from '../authorization';
import { UploadError } from '../validation';

export type ApplicationRoute = {params: Promise<{id: string}>};
export async function borrowerAccess(request: Request, context: ApplicationRoute) {
  const {id} = await context.params;
  const url = new URL(request.url);
  const selected = url.searchParams.get('applicationId');
  if (selected !== null && selected !== id) throw new UploadError('Application scope does not match the route.', 400);
  url.searchParams.set('applicationId', id);
  return accessFor(new Request(url, {method: request.method, headers: request.headers}), ['borrower']);
}
