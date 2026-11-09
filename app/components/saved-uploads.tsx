'use client';
import { useState } from 'react';
import type { ApplicationSnapshot } from '@/lib/model';
export default function SavedUploads({data,onUpdated,disabled=false,onBusy}:{data:ApplicationSnapshot;onUpdated:()=>Promise<unknown>;disabled?:boolean;onBusy?:(busy:boolean)=>void}){
  const [targets,setTargets]=useState<Record<string,string>>({}),[message,setMessage]=useState(''),[busy,setBusy]=useState('');
  async function action(documentId:string,analyze=false){if(disabled||busy)return;onBusy?.(true);setBusy(documentId);setMessage('');try{
    const requirement=data.requirements.find(r=>r.id===targets[documentId]);
    if(!analyze&&!requirement)return;
    const url=analyze?`/api/documents/${documentId}/coverage-analysis?applicationId=${data.application.id}`:`/api/documents/${documentId}/requirements/${requirement!.id}?applicationId=${encodeURIComponent(data.application.id)}&expectedEvidenceRevision=${requirement!.evidence_revision}`;
    const response=await fetch(url,{method:analyze?'POST':'PUT',headers:{'Content-Type':'application/json'},body:analyze?JSON.stringify({idempotencyKey:crypto.randomUUID()}):undefined});
    const value=await response.json();if(!response.ok)throw new Error(value.error||'Could not update this file.');
    setMessage(analyze?'Check requested.':'File linked to the request.');await onUpdated();
  }catch(e){setMessage(e instanceof Error?e.message:'Please try again.');}finally{setBusy('');onBusy?.(false);}}
  return <details style={{margin:'24px 0'}}><summary style={{minHeight:44,cursor:'pointer'}}>All saved files ({data.documents.length})</summary>
    <p>Files without a request are kept here. Add a link manually.</p>
    {data.documents.map(d=><div key={d.id} style={{padding:'16px 0',borderBottom:'1px solid #ddd'}}><strong>{d.original_name}</strong><p>{d.requirement_ids.length?d.requirement_ids.map(id=>data.requirements.find(r=>r.id===id)?.title||'Earlier request').join(' · '):'Not linked to a request yet'}</p><a href={`/api/documents/${d.id}?applicationId=${encodeURIComponent(data.application.id)}`}>Download original</a>
      <div style={{display:'flex',gap:12,flexWrap:'wrap',marginTop:12}}><label>Link to request <select style={{minHeight:44,maxWidth:'100%'}} value={targets[d.id]||''} onChange={e=>setTargets({...targets,[d.id]:e.target.value})}><option value="">Choose request</option>{data.requirements.filter(r=>!d.requirement_ids.includes(r.id)&&r.collection!=='lender').map(r=><option key={r.id} value={r.id}>{r.title}</option>)}</select></label><button className="secondary" disabled={disabled||!!busy||!targets[d.id]} onClick={()=>void action(d.id)}>Add link</button></div></div>)}
    {message&&<p role="status">{message}</p>}
  </details>;
}
