'use client';
import { useEffect, useRef, useState } from 'react';
import { authClient } from '@/lib/auth-client';
type Session = {demoMode?:boolean;demoRole?:'borrower'|'lender'|null};
export default function AccountMenu() {
  const [session,setSession]=useState<Session|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const running=useRef(false);
  async function load(signal?:AbortSignal) {
    setError('');
    try {
      const response=await fetch('/api/session',{cache:'no-store',signal});
      if(!response.ok)throw new Error('Account controls could not load.');
      const body=await response.json();if(!signal?.aborted)setSession(body);
    } catch(e) {if(!signal?.aborted)setError(e instanceof Error?e.message:'Account controls could not load.');}
  }
  useEffect(()=>{const controller=new AbortController();void load(controller.signal);return()=>controller.abort();},[]);
  async function act() {
    if(running.current||!session)return;
    running.current=true;setBusy(true);setError('');
    try {
      if(session.demoMode) {
        const url=new URL(location.href),match=url.pathname.match(/^\/borrower\/([^/]+)\/?$/);
        const applicationId=match?decodeURIComponent(match[1]):url.searchParams.get('applicationId');
        const response=await fetch('/api/demo/role',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({role:session.demoRole==='lender'?'borrower':'lender',...(applicationId?{applicationId}:{})})});
        const body=await response.json();
        if(!response.ok)throw new Error(body.error||'Could not switch workspaces. Please try again.');
        if(typeof body.redirectTo!=='string'||!body.redirectTo.startsWith('/')||body.redirectTo.startsWith('//'))throw new Error('Could not open the workspace. Please try again.');
        location.assign(body.redirectTo);
      } else {
        const result=await authClient.signOut();
        if(result.error)throw new Error('Could not sign out. Please try again.');
        location.assign('/login');
      }
    } catch(e) {setError(e instanceof Error?e.message:'Please try again.');running.current=false;setBusy(false);}
  }
  return <div className="account-control">
    <button type="button" style={{minHeight:44,padding:'8px 16px'}} disabled={busy||!session} onClick={act}>{busy?session?.demoMode?'Switching…':'Signing out…':!session?'Loading…':session.demoMode?session.demoRole==='lender'?'Switch to borrower':'Switch to lender':'Sign out'}</button>
    {error&&<span role="alert">{error}{!session&&<button type="button" onClick={()=>void load()}>Retry</button>}</span>}
  </div>;
}
