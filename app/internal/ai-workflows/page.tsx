import {headers} from 'next/headers';
import {notFound} from 'next/navigation';
import {requireDebugDeveloper} from '@/lib/analysis-debug/server';
import {Dashboard} from './dashboard';
export const runtime='nodejs';
export default async function Page(){try{await requireDebugDeveloper(await headers());}catch{notFound();}return <Dashboard/>;}
