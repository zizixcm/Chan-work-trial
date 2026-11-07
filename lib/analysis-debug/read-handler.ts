import { UploadError } from '../validation';
import { localRequest } from '../http';
import type { DebugStore } from './types';

export const debugHeaders = {'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Vary': 'Cookie'};
/** Authorization precedes even store construction; failures never include source data. */
export async function readDebugRequest(request: Request, dependencies: {
  authorize(headers: Headers): Promise<unknown>;
  store(): DebugStore;
}, id?: string) {
  try {
    localRequest(request);
    await dependencies.authorize(request.headers);
    const store = dependencies.store();
    const data = id === undefined ? {runs: await store.list()} : await store.get(id);
    if (!data) return Response.json({error: 'Analysis run not found.'}, {status: 404, headers: debugHeaders});
    return Response.json(data, {headers: debugHeaders});
  } catch (error) {
    return Response.json({error: error instanceof UploadError ? error.message : 'Analysis diagnostics are unavailable.'},
      {status: error instanceof UploadError ? error.status : 503, headers: debugHeaders});
  }
}
