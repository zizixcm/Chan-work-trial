import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { requireDebugDeveloper } from '@/lib/analysis-debug/server';
import { Inspector } from './inspector';
export const runtime = 'nodejs';
export default async function Page() {
  try { await requireDebugDeveloper(await headers()); } catch { notFound(); }
  return <Inspector/>;
}
