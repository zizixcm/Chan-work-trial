"use client";
import { useCallback, useEffect, useState } from "react";
import ApplicationList from "./application-list";
import WorkspaceHeader from "./workspace-header";

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
    <WorkspaceHeader role="borrower" />
    <ApplicationList items={applications?.map(application=>({id:application.id,name:application.property_name,secondary:`${application.borrower_name} · ${application.transaction_type}`,href:`/borrower/${encodeURIComponent(application.id)}`})) ?? null} error={error} onRetry={()=>void load()} emptyMessage="When your lender gives you access to an application, it will appear here." />

  </div>;
}
