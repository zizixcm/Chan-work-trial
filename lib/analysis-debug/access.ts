/** Exact user IDs, never email-domain matching, role inference, or query tokens. */
export function isDebugDeveloper(userId: string, configuredIds: string | undefined): boolean {
  return Boolean(userId) && (configuredIds ?? '').split(',').map(id => id.trim()).filter(Boolean).includes(userId);
}
