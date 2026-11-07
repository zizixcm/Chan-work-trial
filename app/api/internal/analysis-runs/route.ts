import { debugRead } from '@/lib/analysis-debug/server';
export const runtime = 'nodejs';
export async function GET(request: Request) { return debugRead(request); }
