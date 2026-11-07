"use client";
import { useCallback, useEffect, useState } from "react";
import AccountMenu from "../account-menu";

type Application = {id:string;property_name:string;borrower_name:string;address:string;transaction_type:string;requested_amount:number;created_at:string};
export default function BorrowerApplications() {
  const [applications,setApplications]=useState<Application[]|null>(null);
  const [error,setError]=useState("");
  const load=useCallback(async(signal?:AbortSignal)=>{
    setError("");
    try {
      const response=await fetch("/api/borrower/applications",{cache:"no-store",signal});
      if(response.status===401){location.assign("/login");return;}
      const body=await response.json();
      if(!response.ok)throw new Error(body.error || "Could not load your applications.");
      if(!signal?.aborted)setApplications(body.applications);
    } catch(e){if(!signal?.aborted)setError(e instanceof Error?e.message:"Could not load your applications.");}
  },[]);
  useEffect(()=>{const controller=new AbortController();void load(controller.signal);return()=>controller.abort();},[load]);
  return <div className="portal-simple">
    <header className="simple-header"><a className="brand" href="/">proximitty<span className="brand-dot">.</span></a><div><span>Borrower portal</span><AccountMenu /></div></header>
    <main className="simple-main borrower-applications"><h1>Your applications</h1><p className="applications-intro">Choose an application to view requests and upload documents.</p>
      {error && <div className="alert error" role="alert">{error}<button className="secondary" onClick={()=>void load()}>Try again</button></div>}
      {applications===null && !error && <p role="status">Loading your applications…</p>}
      {applications?.length===0 && <section className="applications-empty"><h2>No active applications yet</h2><p>When your lender gives you access to an application, it will appear here.</p><button className="secondary" onClick={()=>void load()}>Refresh applications</button></section>}
      {!!applications?.length && <ul className="borrower-application-list">{applications.map(application=><li key={application.id}><article><div><h2>{application.property_name}</h2><p>{application.borrower_name} · {application.transaction_type}</p><p>{application.address}</p><p className="application-amount">Requested loan: {new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(application.requested_amount)}</p></div><a className="primary" aria-label={`Open ${application.property_name}`} href={`/borrower/${encodeURIComponent(application.id)}`}>Open application</a></article></li>)}</ul>}
    </main>
  </div>;
}
