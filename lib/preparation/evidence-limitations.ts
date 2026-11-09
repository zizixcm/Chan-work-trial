import type {PageObservation} from './actions';

/** Reader-owned unresolved scope survives model omission. Informational format
 * notices remain on observations and do not by themselves block completeness. */
export function unresolvedEvidenceLimitations(observations:PageObservation[]):string[] {
 const unresolved:string[]=[];
 for(const observation of observations){
  const peers=observations.filter(o=>o.documentId===observation.documentId&&o.sha256===observation.sha256);
  const hasImage=(page:number)=>peers.some(o=>o.kind==='image'&&o.pages.some(p=>p.page===page));
  if(observation.kind==='unavailable'&&!peers.some(o=>['text','image','ocr'].includes(o.kind)&&o.pages.length))
   unresolved.push(`${observation.documentId}: evidence could not be read.`);
  for(const issue of observation.coverageIssues??[])unresolved.push(`${observation.documentId}: ${issue}`);
  for(const page of observation.pages){
   if(observation.kind==='ocr'&&((page.confidence??0)<80||!page.text.trim())&&!hasImage(page.page))
    unresolved.push(`${observation.documentId}, unit ${page.page}: OCR needs visual verification.`);
   if(observation.kind==='text'&&!page.text.trim()&&!hasImage(page.page)&&!peers.some(o=>o.kind==='ocr'&&o.pages.some(p=>p.page===page.page&&(p.confidence??0)>=80&&p.text.trim())))
    unresolved.push(`${observation.documentId}, unit ${page.page}: no readable text or visual inspection.`);
  }
 }
 return [...new Set(unresolved)];
}
