import type { Action, Citation, Finding, Snapshot } from '../../../lib/preparation-pilot/contracts';
/** Scripted response tape, deliberately separate from the oracle. No inference claim.
 * Arbitrary valid action ordering remains supported by the controller. */
export function simulatedResult(snapshot:Snapshot) {
 const has=(id:string)=>snapshot.sources.some(s=>s.id===id&&s.active);
 const cite=(id:string,p=1):Citation=>({sourceId:id,page:p,quote:snapshot.sources.find(s=>s.id===id)!.pages[p]});
 const make=(criterionId:string,state:Finding['state'],explanation:string,citations:Citation[]=[]):Finding=>({criterionId,state,explanation,citations});
 const execution=has('d19')?'d19':'d07';
 return {findings:[
  make('R1.months',has('d09')?'met':'unmet',has('d09')?'B1 March-May covered':'April B1 is not active; restore saved April if available',[cite('d01'),cite('d08'),...(has('d09')?[cite('d09')]:[])]),
  make('R1.population',has('d20')?'met':'unknown','Borrower account population requires attributed declaration',has('d20')?[cite('d20')]:[]),
  make('R2.pfs','met','PFS cash 60000 uses May 31 schedule',[cite('d02'),cite('d02',4)]),
  make('R2.cash',has('d12')?'met':'unmet','Retirement does not substitute for March-May cash statements',has('d12')?[cite('d10'),cite('d11'),cite('d12'),cite('d12',3)]:[cite('d03')]),
  make('R2.reconciliation',has('d20')?'met':'unknown','Attributed T1 explanation and May 31 balance reconcile 60000',has('d20')?[cite('d20'),cite('d12',3),cite('d02',4)]:[]),
  make('R2.availability',has('d20')?'lender_pending':'unknown','Lender must decide personal availability of trust funds',has('d20')?[cite('d12')]:[]),
  make('R3.application','met','Correct application and simulated visible borrower execution',[cite('d04')]),
  make('R3.loi',has('d13')?'met':'unmet','Financing LOI required for Cedar Court transaction',has('d13')?[cite('d13'),cite('d13',2)]:[cite('d05')]),
  make('R3.acceptance',has('d13')?'lender_pending':'unknown','Lender countersignature pending',has('d13')?[cite('d13',2)]:[]),
  make('R4.reports',has('d17')?'met':'unmet','Actual appraisal reports required; invoice is not a report',has('d17')?[cite('d16',24),cite('d16',25),cite('d17',24),cite('d17',25)]:[cite('d06')]),
  make('R4.review',has('d18')?'met':'unmet','Review covers A only; revised B review/acceptance not established',has('d18')?[cite('d18'),cite('d18',2),cite('d17',24)]:[]),
  make('R4.acceptance',has('d18')?'lender_pending':'unknown','Lender must resolve operative report and review',has('d18')?[cite('d18',2)]:[]),
  make('R5.ownership','met','Entity and owner/control entries supplied',[cite(execution)]),
  make('R5.execution',has('d19')?'met':'unmet','Certification execution requires changed evidence; duplicate is not a signature',[cite(execution,3)]),
  make('R6.insurance','later_stage','U1 retains insurance as a closing obligation'),
 ],questions:has('d20')?[]:['Confirm all borrower accounts and which account supports PFS cash.'],nextActions:has('d19')?['Lender: resolve trust availability, LOI countersignature, and revised appraisal review.']:['Borrower: complete ownership certification name, signature and date.']};
}
export function simulatedActions(snapshot:Snapshot):Action[] {
 const result=simulatedResult(snapshot); const reads=new Map<string,Set<number>>();
 for(const f of result.findings)for(const c of f.citations){if(!reads.has(c.sourceId))reads.set(c.sourceId,new Set());reads.get(c.sourceId)!.add(c.page);}
 return [...Array.from(reads,([sourceId,pages])=>({kind:'read_pages' as const,sourceId,pages:[...pages]})),{kind:'assess',result}];
}
