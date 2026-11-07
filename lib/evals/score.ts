import type {VerifyResult} from '../analysis/types';
import {deriveFulfillment} from '../analysis/fulfillment';
/** Fixed synthetic fixture facts; aggregate-only success is insufficient. */
export function scoreSemantic(fixture:{id:string;expected:string},output:VerifyResult){
 const issues:string[]=[];
 if(deriveFulfillment(output)!==fixture.expected)issues.push('fulfillment');
 const identity=output.checks.find(c=>c.criterionId==='identity'),rent=output.checks.find(c=>c.criterionId==='rent');
 const wrong=fixture.id==='wrong-property',conflict=fixture.id==='conflicting-rents',complete=fixture.expected==='fulfilled';
 if(identity?.state!==(wrong?'unmet':'met'))issues.push('identity_state');
 if(conflict&&(!rent||!['met','unknown'].includes(rent.state)))issues.push('conflict_rent_state');
 if(!conflict&&rent?.state!==(complete?'met':'unmet'))issues.push('rent_state');
 if(!wrong&&!identity?.evidence.some(e=>/Demo Plaza/i.test(e.quote)))issues.push('identity_evidence');
 if(complete&&!rent?.evidence.some(e=>/(^|[^0-9])5000([^0-9]|$)/.test(e.quote)))issues.push('rent_amount_evidence');
 if(!complete&&!conflict&&!output.missingEvidence.some(reason=>/rent|amount|period|November|property|formula/i.test(reason)))issues.push('specific_missing_reason');
 if(conflict&&!output.conflicts.some(c=>c.evidence.some(e=>e.quote==='5000')&&c.evidence.some(e=>e.quote==='9000')))issues.push('conflicting_amounts_not_cited');
 return {passed:issues.length===0,issues};
}
