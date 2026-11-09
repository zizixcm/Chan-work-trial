import { createHash } from 'node:crypto';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import sharp from 'sharp';
import type { Criterion, Snapshot, Source } from '../../../lib/preparation-pilot/contracts';

// Authored source content, not extracted/OCR/model observations. Opaque IDs go to the harness.
export const content: Record<string, { count: number; facts: Record<number,string>; scan?: boolean }> = {
 d01:{count:3,facts:{1:'Cedar Court Holdings LLC; B1; March 2026; page 1 of 3',2:'B1 March transactions; page 2 of 3',3:'B1 March closing balance; page 3 of 3'}},
 d02:{count:4,scan:true,facts:{1:'Alex Vale; Personal financial statement; June 8, 2026; cash 60000',4:'Cash schedule: balances as of May 31, 2026; cash 60000'}},
 d03:{count:3,facts:{1:'Alex Vale; Roth retirement account; May 2026; 80000'}},
 d04:{count:1,scan:true,facts:{1:'Application; Cedar Court Holdings LLC; 18 Cedar Lane; borrower Alex Vale; signature Alex Vale; dated June 8, 2026'}},
 d05:{count:2,facts:{1:'Lease letter of intent; Pine Court LLC; 90 Pine Road'}},
 d06:{count:1,facts:{1:'Appraisal service invoice; 18 Cedar Lane; charge 5000; this is an invoice'}},
 d07:{count:3,facts:{1:'Cedar Court Holdings LLC; owner Alex Vale 100%; controller Alex Vale',3:'Certification name: __________; signature: __________; date: __________'}},
 d08:{count:3,facts:{1:'Cedar Court Holdings LLC; B1; May 2026; page 1 of 3; prior cycle April',2:'B1 May transactions; page 2 of 3',3:'B1 May closing balance; page 3 of 3'}},
 d09:{count:3,facts:{1:'Cedar Court Holdings LLC; B1; April 2026; page 1 of 3',2:'B1 April transactions; page 2 of 3',3:'B1 April closing balance; page 3 of 3'}},
 d10:{count:3,facts:{1:'Vale Family Trust; checking T1; March 2026; page 1 of 3',2:'T1 March transactions; page 2 of 3',3:'T1 March balance; page 3 of 3'}},
 d11:{count:3,facts:{1:'Vale Family Trust; checking T1; April 2026; page 1 of 3',2:'T1 April transactions; page 2 of 3',3:'T1 April balance; page 3 of 3'}},
 d12:{count:3,facts:{1:'Vale Family Trust; checking T1; May 2026; page 1 of 3',2:'T1 May transactions; page 2 of 3',3:'May 31 balance 60000; page 3 of 3'}},
 d13:{count:2,facts:{1:'Financing letter of intent; Cedar Court Holdings LLC; 18 Cedar Lane',2:'Borrower signature Alex Vale; June 9, 2026; lender signature: __________'}},
 d16:{count:48,facts:{1:'Contents: report identity and dates page 24; subject and intended lender page 25',24:'Report A; June 12, 2026; effective June 10, 2026',25:'18 Cedar Lane; intended lender Cedar Test Bank'}},
 d17:{count:48,facts:{1:'Contents: report identity and dates page 24; subject and intended lender page 25',24:'Report B; revised July 14, 2026; effective June 10, 2026',25:'18 Cedar Lane; intended lender Cedar Test Bank'}},
 d18:{count:2,facts:{1:'Review dated June 15, 2026; reviewed Report A dated June 12, 2026; 18 Cedar Lane',2:'Review scope: Report A only. No review or acceptance of Report B is stated.'}},
 d19:{count:3,facts:{1:'Cedar Court Holdings LLC; owner Alex Vale 100%; controller Alex Vale',3:'Certification name: Alex Vale; signature: Alex Vale; date: July 31, 2026'}},
 d20:{count:1,facts:{1:'Borrower Alex Vale states: B1 is the only borrower account. The PFS cash figure refers solely to trust account T1 using May 31 balances.'}},
};
export const criteria: Criterion[] = [
 ['R1','months','March-May complete B1 statements'],['R1','population','Attributed account population declaration'],
 ['R2','pfs','PFS and balance schedule'],['R2','cash','March-May cash account evidence'],['R2','reconciliation','Attributed account explanation and 60000 reconciliation'],['R2','availability','Lender decision on trust availability'],
 ['R3','application','Correct application, borrower fields, visible signature/date'],['R3','loi','Correct financing LOI, visible borrower signature/date'],['R3','acceptance','Lender LOI countersignature'],
 ['R4','reports','Subject, lender, report dates and effective dates'],['R4','review','Review version association and revised report disclosure'],['R4','acceptance','Lender decision on operative report/review'],
 ['R5','ownership','Correct entity and owner/control fields'],['R5','execution','Certifying name and visible signature/date'],['R6','insurance','Closing insurance'],
].map(([requestId,id,description]) => ({id:`${requestId}.${id}`,requestId,description,prerequisite:requestId!=='R6',pendingAllowed:['availability','acceptance'].includes(id)}));
export async function buildFixture() {
 const bytes = new Map<string,Uint8Array>(); const sources:Source[]=[];
 for (const [id,spec] of Object.entries(content)) {
  const doc=await PDFDocument.create(); doc.setCreationDate(new Date('2026-07-31T00:00:00Z')); doc.setModificationDate(new Date('2026-07-31T00:00:00Z'));
  const font=await doc.embedFont(StandardFonts.Helvetica); const pages:Record<string,string>={};
  for(let p=1;p<=spec.count;p++) {
   const value=spec.facts[p] ?? `Synthetic supporting page ${p} of ${spec.count}`; pages[p]=value;
   const page=doc.addPage([612,792]);
   const lines=value.match(/.{1,75}(?:\s|$)|.{1,75}/g) ?? [value];
   if(spec.scan) {
    const svg=`<svg width="612" height="792" xmlns="http://www.w3.org/2000/svg"><rect width="612" height="792" fill="white"/>${lines.map((s,i)=>`<text x="30" y="${50+i*22}" font-size="13">${s}</text>`).join('')}</svg>`;
    const png=await sharp(Buffer.from(svg)).png().toBuffer(); page.drawImage(await doc.embedPng(png),{x:0,y:0,width:612,height:792});
   } else lines.forEach((line,i)=>page.drawText(line,{x:30,y:740-i*22,size:11,font}));
  }
  // Real form fields retain populated versus blank appearances in the ownership fixtures.
  if(id==='d07'||id==='d19') {
   const field=doc.getForm().createTextField('certifying_name'); field.setText(id==='d19'?'Alex Vale':'');
   field.addToPage(doc.getPages()[2],{x:30,y:550,width:300,height:25}); doc.getForm().updateFieldAppearances(font);
  }
  const data=await doc.save(); bytes.set(id,data);
  sources.push({id,sha256:createHash('sha256').update(data).digest('hex'),active:true,historical:['d01','d02'].includes(id),pages});
 }
 for(const [id,original] of [['d14','d04'],['d15','d07']]) {
  bytes.set(id,bytes.get(original)!); sources.push({...structuredClone(sources.find(s=>s.id===original)!),id});
 }
 const checkpoints:Snapshot[]=Array.from({length:6},(_,c)=>({version:'preparation.v1',applicationId:'prep01',stage:'initial_underwriting',policyId:'PREP-01/U1',pendingUploads:false,criteria:structuredClone(criteria),sources:sources.filter(s=>Number(s.id.slice(1))<= (c===0?8:c===1?15:c===2?18:20) || (c===2 && s.id==='d20')).map(s=>({...structuredClone(s),active:!(c>=3 && ['d07','d15'].includes(s.id)) && !(c===4 && s.id==='d09')}))}));
 return {version:'PREP-01.bytes.v1',reviewDate:'2026-07-31',bytes,checkpoints};
}
