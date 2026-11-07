import {requireDebugDeveloper} from '@/lib/analysis-debug/server';
import {workflowMetrics} from '@/lib/analysis-metrics/data';
import {metricsRequest} from '@/lib/analysis-metrics/handler';
export const runtime='nodejs';
export async function GET(request:Request){return metricsRequest(request,{authorize:requireDebugDeveloper,read:workflowMetrics});}
