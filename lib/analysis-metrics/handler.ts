import {localRequest} from '../http';
import {UploadError} from '../validation';
import {metricsCsv,type workflowMetrics} from './data';
export async function metricsRequest(request:Request,deps:{authorize(headers:Headers):Promise<{id:string}>;read:typeof workflowMetrics}){
 const headers={'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'};
 try{
  localRequest(request);const user=await deps.authorize(request.headers),url=new URL(request.url);
  const days=Number(url.searchParams.get('days')||7),applicationId=url.searchParams.get('applicationId')||undefined,task=url.searchParams.get('task')||undefined,format=url.searchParams.get('format')||'json';
  if(![1,7,30].includes(days)||(applicationId&&applicationId.length>160)||(task&&!['match_document.v1','verify_requirement.v1'].includes(task))||!['json','csv'].includes(format))throw new UploadError('Invalid metrics filter.');
  const report=await deps.read(user.id,{days,applicationId,task});
  const exportHeaders={...headers,'X-Metrics-Total-Jobs':String(report.totalMatchingJobs),'X-Metrics-Exported-Jobs':String(report.exportedJobs),'X-Metrics-Truncated':String(report.truncated)};
  if(format==='csv')return new Response(metricsCsv(report.jobs),{headers:{...exportHeaders,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="ai-workflows.csv"'}});
  return Response.json(report,{headers:{...exportHeaders,...(url.searchParams.has('download')?{'Content-Disposition':'attachment; filename="ai-workflows.json"'}:{})}});
 }catch(error){return Response.json({error:error instanceof UploadError?error.message:'Workflow metrics are unavailable.'},{status:error instanceof UploadError?error.status:503,headers});}
}
