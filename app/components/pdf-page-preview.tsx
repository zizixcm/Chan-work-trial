"use client";
import {useEffect,useRef,useState} from 'react';
import type {PDFDocumentProxy} from 'pdfjs-dist';

/** Render one authorized PDF page at a time; no browser PDF plugin is needed. */
export default function PdfPagePreview({url,name}:{url:string;name:string}) {
  const canvas=useRef<HTMLCanvasElement>(null);
  const [pdf,setPdf]=useState<PDFDocumentProxy|null>(null),[page,setPage]=useState(1),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  useEffect(()=>{
    let disposed=false;let task:ReturnType<typeof import('pdfjs-dist').getDocument>|undefined;
    setPdf(null);setPage(1);setError('');setLoading(true);
    void import('pdfjs-dist').then(async api=>{
      if(disposed)return;
      api.GlobalWorkerOptions.workerSrc='/pdf.worker.min.mjs';
      task=api.getDocument({url,useSystemFonts:true});
      const document=await task.promise;if(!disposed)setPdf(document);
    }).catch(()=>{if(!disposed){setError('This PDF could not be displayed. Download the original to review it.');setLoading(false);}});
    return()=>{disposed=true;void task?.destroy();};
  },[url]);
  useEffect(()=>{
    if(!pdf||!canvas.current)return;
    let disposed=false;let render:ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']>|undefined;
    setLoading(true);setError('');
    void pdf.getPage(page).then(async selected=>{
      if(disposed||!canvas.current)return;
      const natural=selected.getViewport({scale:1});
      const viewport=selected.getViewport({scale:Math.min(1.5,1600/Math.max(natural.width,natural.height))});
      canvas.current.width=viewport.width;canvas.current.height=viewport.height;
      render=selected.render({canvas:canvas.current,viewport});await render.promise;
      if(!disposed)setLoading(false);
    }).catch(()=>{if(!disposed){setLoading(false);setError('This page could not be displayed. Try another page or download the original.');}});
    return()=>{disposed=true;render?.cancel();};
  },[pdf,page]);
  return <div style={{padding:12}}><div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,marginBottom:12}}><button aria-label="Previous page" disabled={!pdf||page===1} onClick={()=>setPage(n=>n-1)}>←</button><span>Page {page}{pdf?` of ${pdf.numPages}`:''}</span><button aria-label="Next page" disabled={!pdf||page===pdf.numPages} onClick={()=>setPage(n=>n+1)}>→</button></div>{loading&&<p role="status">Loading page…</p>}{error&&<p role="alert">{error}</p>}<canvas ref={canvas} aria-label={`${name}, page ${page}`} role="img" style={{width:'100%',height:'auto',display:loading||error?'none':'block',background:'white'}}/></div>;
}
