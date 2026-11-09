"use client";
import {useEffect,useState} from 'react';
import {Check,AlertCircle} from 'lucide-react';
import type {ConversationActivity} from '@/lib/borrower-chat/conversation-ui';
import styles from './processing-conversation.module.css';

export default function ResponseProgress({saving,pending,queued,reviewing,unavailable,uploading=false,activity=[]}:{saving:boolean;pending:boolean;uploading?:boolean;queued?:boolean;reviewing?:boolean;unavailable:boolean;activity?:ConversationActivity[]}) {
  const [seconds,setSeconds]=useState(0);
  const working=saving||pending;
  const current=activity.filter(item=>item.status==='running').at(-1);
  const visibleActivity=current?activity.filter(item=>item.runId===current.runId).slice(-4):[];
  useEffect(()=>{
    if(!working)return;
    const start=Date.now();setSeconds(0);
    const timer=setInterval(()=>setSeconds(Math.floor((Date.now()-start)/1000)),1000);
    return()=>clearInterval(timer);
  },[working]);
  const label=unavailable?'Reconnecting…':saving?'Sending…':uploading?'Processing files uploaded':current?.label??(reviewing?'Reviewing documents…':queued?'Your message is queued…':'Preparing your response…');
  if(!working)return null;
  return <div className={styles.activityPanel}>
    {working&&<div className={styles.responseProgress}>
      <span className={styles.progressDots} aria-hidden="true"><i/><i/><i/></span>
      <div role="status"><strong>{label}</strong>{seconds>=30&&!unavailable&&<span>Still working. You can return later.</span>}</div>
      <span className={styles.elapsed} aria-hidden="true">{seconds}s</span>
    </div>}
    {!!visibleActivity.length&&<div className={styles.activityHistory} aria-label="Agent activity">
      <ol>{visibleActivity.map(item=><li key={item.id}>
        <span aria-hidden="true">{item.status==='completed'?<Check size={14}/>:item.status==='failed'?<AlertCircle size={14}/>:<span className={styles.activityDot}/>}</span>
        <span>{item.label}<small>{item.status==='completed'?'Done':item.status==='failed'?'Could not finish':unavailable?'Status unavailable':'In progress'}</small></span>
        <time dateTime={item.startedAt}>{new Date(item.startedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</time>
      </li>)}</ol>
    </div>}
  </div>;
}
