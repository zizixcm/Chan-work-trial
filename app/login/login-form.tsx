'use client';
import { useRef, useState } from 'react';
import { authClient } from '@/lib/auth-client';
export default function Login() {
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [showPassword,setShowPassword]=useState(false);
  const submitting=useRef(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current=true; setBusy(true); setError('');
    let signedIn=false;
    let navigating=false;
    try {
      const result=await authClient.signIn.email({email,password});
      if(result.error) {
        setError(result.error.status === 401
          ? 'We couldn’t sign you in. Check your email address and password, then try again.'
          : 'Sign-in is temporarily unavailable. Please try again.');
        return;
      }
      signedIn=true;
      const response=await fetch('/api/session',{cache:'no-store'});
      if(!response.ok) throw new Error();
      const session=await response.json();
      location.assign(session.memberships.some((membership:{role:string})=>membership.role==='borrower') ? '/' : session.memberships.some((membership:{role:string})=>membership.role==='lender') ? '/lender' : '/');
      navigating=true;
    } catch { setError(signedIn
      ? 'We couldn’t open your workspace. Try again.'
      : 'Sign-in is temporarily unavailable. Please try again.'); }
    finally { if (!navigating) { submitting.current=false; setBusy(false); } }
  }
  return <div className="signin-page">
    <header className="signin-header"><a className="brand" href="/">proximitty<span className="brand-dot">.</span></a></header>
    <main className="signin-main">
      <h1>Sign in</h1><p>Continue to your document workspace.</p>
      <form onSubmit={submit} aria-busy={busy}>
        <div><label htmlFor="signin-email">Email address</label><input id="signin-email" name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} aria-describedby={error ? 'signin-error' : undefined} required readOnly={busy} value={email} onChange={e=>setEmail(e.target.value)} /></div>
        <div><label htmlFor="signin-password">Password</label><div className="signin-password-field"><input id="signin-password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required readOnly={busy} value={password} onChange={e=>setPassword(e.target.value)} aria-describedby={error ? 'signin-error' : undefined}/><button type="button" className="signin-visibility" aria-controls="signin-password" onClick={()=>setShowPassword(value=>!value)}>{showPassword?'Hide password':'Show password'}</button></div></div>
        {error && <p id="signin-error" className="signin-error" role="alert">{error}</p>}
        <button type="submit" className="signin-submit" disabled={busy}>{busy?'Signing in…':'Sign in'}</button>
        <span className="signin-status" role="status">{busy?'Signing in…':''}</span>
      </form>
    </main>
  </div>;
}
