"use client";
import {useCallback,useEffect,useMemo,useState} from 'react';
import {Building2,MessageSquare,PanelLeftClose,PanelLeftOpen} from 'lucide-react';
import type {ApplicationSnapshot} from '@/lib/model';
import {createConversationUiAdapter} from '@/lib/borrower-chat/bridge-browser';
import ProcessingConversation from './processing-conversation';
import BatchUpload,{type UploadReceipt} from './batch-upload';
import styles from './loan-chat-workspace.module.css';

export default function LoanChatWorkspace({applicationId}:{applicationId:string}) {
  const [data,setData]=useState<ApplicationSnapshot>(),[error,setError]=useState(''),[collapsed,setCollapsed]=useState(false);
  const [uploadCommit,setUploadCommit]=useState<{receipts:UploadReceipt[];complete:boolean;sequence:number;createdAt:string}>();
  const adapter=useMemo(()=>createConversationUiAdapter(applicationId),[applicationId]);
  const load=useCallback(async()=>{
    const response=await fetch(`/api/application?applicationId=${encodeURIComponent(applicationId)}`,{cache:'no-store'});
    if(!response.ok)throw new Error('Could not load this loan. Please try again.');
    const next:ApplicationSnapshot=await response.json();setData(next);setError('');return next;
  },[applicationId]);
  useEffect(()=>{void load().catch(e=>setError(e.message));},[load]);
  const title=data?.application.borrower_name??'Your loan application';
  return <main className={`${styles.workspace} ${collapsed?styles.collapsed:''}`}>
    <nav className={styles.rail} aria-label="Workspace"><a href="/" className={styles.brand} aria-label="Proximitty home">p<span>·</span></a><button className={styles.activeIcon} aria-label="Loan application" title="Loan application" onClick={()=>setCollapsed(v=>!v)}><Building2 size={21}/><span className={styles.tooltip}>Loan application</span></button><div className={styles.avatar} title="Your profile"><img src="/borrower-avatar.svg" alt="Borrower profile" width="32" height="32"/></div></nav>
    <aside className={styles.sidebar} aria-label="Conversations"><div className={styles.sidebarTitle}><strong>Loan application</strong><button aria-label="Collapse conversations" onClick={()=>setCollapsed(true)}><PanelLeftClose size={17}/></button></div><p className={styles.eyebrow}>YOUR CONVERSATION</p><button className={styles.conversation} aria-current="page"><MessageSquare size={17}/><span>{title}<small>{data?.application.transaction_type??'Existing loan'}</small></span></button></aside>
    <section className={styles.main}><div className={styles.topbar}>{collapsed&&<button aria-label="Show conversations" onClick={()=>setCollapsed(false)}><PanelLeftOpen size={19}/></button>}<span>{title}</span></div>
      {error?<div role="alert" className={styles.loadError}>{error}<button onClick={()=>void load().catch(e=>setError(e.message))}>Try again</button></div>:<ProcessingConversation uploadCommit={uploadCommit} applicationId={applicationId} adapter={adapter} onUpdated={load} workspaceTitle={title} documents={data?.documents} uploadSlot={<div className={styles.upload}><BatchUpload staged onCommitted={(receipts,complete)=>setUploadCommit(previous=>({receipts,complete,sequence:(previous?.sequence??0)+1,createdAt:new Date().toISOString()}))} compactDrop dropzone showProcessing={false} applicationId={applicationId} batchKey="chat" requirementId={null} hidden={false} general onBusy={()=>{}} onLocked={()=>{}} onComplete={load} onStartNew={()=>{}}/></div>}/>}
    </section>
  </main>;
}
