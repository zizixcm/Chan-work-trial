"use client";
import {useEffect,useRef,useState} from 'react';
import type {AnswerHistory,ResolvedAnswerSource} from '@/lib/borrower-chat/answers';
import type {RetrievalIntent} from '@/lib/borrower-chat/retrieval';
const questions:Record<RetrievalIntent,string>={requested:"What's requested?",uploaded:"What's been uploaded?",missing:"What's still missing?"};
export default function ConversationAnswers({applicationId}:{applicationId:string}) {
  const base=`/api/applications/${encodeURIComponent(applicationId)}/conversation/answers`;
  const [page,setPage]=useState<AnswerHistory|null>(null),[before,setBefore]=useState<string>(),[refresh,setRefresh]=useState(0);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[actionError,setActionError]=useState('');
  const [source,setSource]=useState<{answerId:string;value:ResolvedAnswerSource}|null>(null);
  const pending=useRef<{intent:RetrievalIntent;clientMessageId:string}|null>(null);
  const actions=useRef<AbortController|null>(null),sourceRequest=useRef(0),sourceHeading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>()=>{actions.current?.abort();sourceRequest.current++;},[]);
  useEffect(()=>{sourceHeading.current?.focus();},[source]);
  useEffect(()=>{
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
    setPage(null);setSource(null);setError('');
    async function poll(){
      try {
        const response=await fetch(base+(before?`?before=${encodeURIComponent(before)}`:''),{cache:'no-store',signal:controller.signal});
        const value=await response.json();
        if(!response.ok){if([401,403,404].includes(response.status)&&!controller.signal.aborted){setPage(null);setSource(null);}throw new Error(value.error||'Could not refresh answers.');}
        if(!controller.signal.aborted){setPage(value);setError('');}
      }catch(e){if(!controller.signal.aborted){setSource(null);setError(e instanceof Error?e.message:'Could not refresh answers.');}}
      finally{if(!controller.signal.aborted)timer=setTimeout(poll,5000);}
    }
    void poll();return()=>{controller.abort();clearTimeout(timer);};
  },[base,before,refresh]);
  async function ask(intent:RetrievalIntent) {
    if(actions.current)return;
    const controller=new AbortController();actions.current=controller;setBusy(true);setActionError('');setSource(null);
    pending.current??={intent,clientMessageId:crypto.randomUUID()};
    try {
      const response=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pending.current),signal:controller.signal});
      const value=await response.json();
      if(!response.ok){if([401,403,404].includes(response.status))setPage(null);throw new Error(value.error||'Could not save the answer.');}
      pending.current=null;setBefore(undefined);setRefresh(n=>n+1);
    }catch(e){if(!controller.signal.aborted)setActionError(e instanceof Error?e.message:'Could not confirm the answer. Retry the same question.');}
    finally{actions.current=null;if(!controller.signal.aborted)setBusy(false);}
  }
  async function openSource(answerId:string,id:string) {
    const request=++sourceRequest.current;setSource(null);setActionError('');
    try {
      const response=await fetch(`${base}?answerId=${encodeURIComponent(answerId)}&sourceId=${encodeURIComponent(id)}`,{cache:'no-store'});
      const value=await response.json();
      if(request!==sourceRequest.current)return;
      if(!response.ok){if([401,403,404].includes(response.status))setPage(null);throw new Error(value.error||'Source unavailable.');}
      setSource({answerId,value});
    }catch(e){if(request===sourceRequest.current)setActionError(e instanceof Error?e.message:'Source unavailable.');}
  }
  const visibleSource=!error&&source&&page?.entries.some(e=>e.id===source.answerId&&e.freshness==='current')?source.value:null;
  return <section aria-label="Application questions" style={{minWidth:0,overflowWrap:'anywhere'}}>
    <h2>Ask about your application</h2>
    <p>Answers use saved requests, files and current checks. They do not start new checks.</p>
    <div style={{display:'flex',flexWrap:'wrap',gap:8}}>{(Object.keys(questions) as RetrievalIntent[]).map(intent=><button type="button" key={intent} disabled={busy||!!pending.current} onClick={()=>void ask(intent)}>{questions[intent]}</button>)}</div>
    {busy&&<p role="status">Reading application records…</p>}
    {actionError&&<p role="alert">{actionError} {pending.current&&<button type="button" disabled={busy} onClick={()=>void ask(pending.current!.intent)}>Retry question</button>}</p>}
    {error&&<p role="alert">{error} Answer freshness cannot be confirmed. <button type="button" onClick={()=>setRefresh(n=>n+1)}>Refresh answers</button></p>}
    {!page&&!error&&<p role="status">Loading saved answers…</p>}
    {page?.entries.length===0&&<p>Choose a question to get started. Your answers will be saved here.</p>}
    {page?.entries.map(entry=><article key={entry.id} style={{borderTop:'1px solid #ddd',paddingBlock:16}}>
      <h3>{entry.question}</h3><p>Answered {new Date(entry.createdAt).toLocaleString()}</p>
      {error?<p>Refresh to confirm whether this answer is current.</p>:!entry.answer?<p>This answer is out of date because the application or checks changed. Choose the question again for a current answer.</p>:<>
        <p>{entry.answer.summary}</p>
        {entry.answer.notes.map((note,i)=><p key={i}>{note}</p>)}
        <button type="button" onClick={()=>void openSource(entry.id,'s1')}>Source: application snapshot</button>
        {entry.answer.items.map((item,i)=><div key={i}><h4>{item.title}</h4><ul>{item.lines.map((line,j)=><li key={j}>{line}</li>)}</ul>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{item.sourceIds.filter(id=>id!=='s1').map(id=><button type="button" key={id} onClick={()=>void openSource(entry.id,id)}>{entry.answer!.sources.find(s=>s.id===id)?.label??'Source'}</button>)}</div>
        </div>)}
      </>}
    </article>)}
    {visibleSource&&<aside aria-label="Answer source" style={{border:'1px solid #aaa',padding:16,marginBlock:16}}>
      <h3 ref={sourceHeading} tabIndex={-1}>{visibleSource.source.label}</h3>
      {visibleSource.source.detail.map((line,i)=><p key={i} style={{whiteSpace:'pre-wrap'}}>{line}</p>)}
      {visibleSource.documentUrl&&<p><a href={visibleSource.documentUrl}>Download cited original</a></p>}
      <button type="button" onClick={()=>{sourceRequest.current++;setSource(null);}}>Close source</button>
    </aside>}
    {before&&<button type="button" onClick={()=>setBefore(undefined)}>Latest answers</button>}
    {page?.nextBefore&&<button type="button" onClick={()=>setBefore(page.nextBefore!)}>Older answers</button>}
  </section>;
}
