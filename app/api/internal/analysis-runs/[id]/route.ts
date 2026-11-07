import { debugRead } from '@/lib/analysis-debug/server';
export const runtime = 'nodejs';
export async function GET(request: Request, context: {params: Promise<{id: string}>}) {
  return debugRead(request, (await context.params).id);
}
