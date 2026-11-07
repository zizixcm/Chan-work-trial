import 'server-only';
import { accessFor, type Role } from './authorization';
import { PostgresRepository } from './postgres';
import { LocalBlobStorage } from './storage/local';
export async function adapters(request: Request, roles: readonly Role[], documentId?: string) {
  const access = await accessFor(request, roles, documentId);
  return { access, repository: new PostgresRepository(access), storage: new LocalBlobStorage() };
}
