"use client";
import {useEffect,useState} from 'react';
import {deriveFulfillment} from '@/lib/analysis/fulfillment';
import type {VerifyResult} from '@/lib/analysis/types';
import type {BatchJob} from '@/lib/jobs/batch-status';
import type {ConversationUploadPage} from '@/lib/borrower-chat/uploads';

const stages={uploading:'Waiting for files',processing_documents:'Processing files',checking_requirements:'Checking requests',complete:'Checks finished',attention_required:'Needs attention'};
const states:Record<string,string>={queued:'Queued',running:'Checking',retry_wait:'Retry pending',blocked:'Unavailable',succeeded:'Check finished',failed:'Could not finish',dead_letter:'Could not finish',expired:'Expired',cancelled:'Canceled',waiting_for_upload:'Waiting for upload',not_saved:'Not saved',not_requested:'Not checked',unsupported:'Unsupported',removed:'Removed'};
function requirementStatus(job:BatchJob|null) {
  if(!job)return 'Not checked';
  if(job.freshness==='stale')return 'Out of date';
  if(job.state!=='succeeded')return states[job.state]||'Not confirmed';
  const raw=job.result as VerifyResult|{value:VerifyResult}|undefined;
  const result=raw&&'value' in raw?raw.value:raw;
  if(result?.schemaVersion!=='verify.v1')return 'Cannot determine yet';
  const fulfillment=deriveFulfillment(result);
  return fulfillment==='fulfilled'?'Appears complete':fulfillment==='partially_fulfilled'?'Partly complete':fulfillment==='not_fulfilled'?'Missing information':'Cannot determine yet';
}
/** Poll the visible receipt page serially. No transcript duplication or client-side
 * reconstruction of saved uploads; authorization failures clear cached content. */
export default function ConversationUploads({applicationId}:{applicationId:string}) {
  const [page,setPage]=useState<ConversationUploadPage|null>(null),[error,setError]=useState('');
  const [before,setBefore]=useState<string>(),[refresh,setRefresh]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
    setPage(null);setError('');
    async function poll(){let delay=3000;
      try {
        const params=before?`?before=${encodeURIComponent(before)}`:'';
        const response=await fetch(`/api/applications/${encodeURIComponent(applicationId)}/conversation/uploads${params}`,{cache:'no-store',signal:controller.signal});
        if([401,403,404].includes(response.status)){if(!controller.signal.aborted)setPage(null);throw new Error('Upload history is no longer accessible. Refresh your application.');}
        const value=await response.json();
        if(!response.ok)throw new Error(value.error||'Could not refresh upload history.');
        if(!controller.signal.aborted){setPage(value);setError('');delay=value.pollAfterMs;}
      }catch(e){if(!controller.signal.aborted){setError(e instanceof Error?e.message:'Could not refresh upload history.');delay=10000;}}
      finally{if(!controller.signal.aborted)timer=setTimeout(poll,Math.max(2000,Math.min(delay,10000)));}
    }
    void poll();return()=>{controller.abort();clearTimeout(timer);};
  },[applicationId,before,refresh]);
  return <section aria-label="Conversation upload history" style={{minWidth:0,overflowWrap:'anywhere'}}>
    <h2>Upload history</h2><p>Your uploads and checks stay here when you return. AI checks are not lender acceptance.</p>
    {error&&<p role="alert">{error} Displayed results may be out of date. <button type="button" onClick={()=>setRefresh(n=>n+1)}>Refresh status</button></p>}
    {!page&&!error&&<p role="status">Loading uploads…</p>}
    {page?.cards.length===0&&<p>No uploads yet. Choose files above to get started.</p>}
    {page?.cards.map(card=><article key={card.artifactId} style={{borderTop:'1px solid #ddd',paddingBlock:'1rem'}}>
      <h3>Upload · {new Date(card.createdAt).toLocaleString()}</h3>
      <p>{error?'Status unavailable':stages[card.processing.stage]}</p>
      <ul>{card.members.map(member=><li key={member.id}>
        <strong>{member.name}</strong> — {member.state==='saved'?'Saved':member.state==='pending'?'Not saved yet':'Not saved'}
        {!error&&<><p>{member.validity.message}</p><p>Matching: {member.matching.job?.freshness==='stale'?'Out of date':states[member.matching.state]||'Not confirmed'}</p></>}
      </li>)}</ul>
      {!error&&card.processing.requirements.length>0&&<><h4>Request checks</h4><ul>{card.processing.requirements.map(req=><li key={req.id}>{req.title} — {requirementStatus(req.job)}</li>)}</ul></>}
      {!error&&card.processing.needsReview&&<p>Some files or checks need attention. Review them under By file or By requirement.</p>}
    </article>)}
    <div>{before&&<button type="button" onClick={()=>setBefore(undefined)}>Latest uploads</button>}{page?.nextBefore&&<button type="button" onClick={()=>setBefore(page.nextBefore!)}>Older uploads</button>}</div>
  </section>;
}
