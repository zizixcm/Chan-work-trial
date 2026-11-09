"use client";
import {useRef,useState} from "react";
import type {ApplicationSnapshot} from "@/lib/model";

export function useFileLinks({data,disabled,onBusy,onUpdated}:{data:ApplicationSnapshot;disabled:boolean;onBusy:(busy:boolean)=>void;onUpdated:()=>Promise<ApplicationSnapshot|undefined>}) {
  const running=useRef(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  async function request(url:string,method:string) {
    if(disabled||running.current)return false;
    running.current=true;setBusy(true);onBusy(true);setError("");
    try {const response=await fetch(url,{method});const body=await response.json();if(!response.ok)throw new Error(body.error||"Could not save. Refresh files and try again.");await onUpdated();return true;}
    catch(e){setError(e instanceof Error?e.message:"Could not save. Please try again.");return false;}
    finally{running.current=false;setBusy(false);onBusy(false);}
  }
  async function link(documentId:string,requirementId:string,checked:boolean) {
    const req=data.requirements.find(r=>r.id===requirementId);
    if(!req?.evidence_revision){setError("Refresh files before changing links.");return false;}
    return request(`/api/documents/${encodeURIComponent(documentId)}/requirements/${encodeURIComponent(requirementId)}?applicationId=${encodeURIComponent(data.application.id)}&expectedEvidenceRevision=${encodeURIComponent(req.evidence_revision)}`,checked?"PUT":"DELETE");
  }
  async function remove(documentId:string) {
    if(!data.draft){setError("Refresh files before removing this file.");return false;}
    return request(`/api/documents/${encodeURIComponent(documentId)}?applicationId=${encodeURIComponent(data.application.id)}&expectedContentRevision=${encodeURIComponent(data.draft.contentRevision)}`,"DELETE");
  }
  async function refresh(){try{await onUpdated();setError("");}catch{setError("Could not refresh files. Please try again.");}}
  return {busy,error,link,remove,refresh};
}
