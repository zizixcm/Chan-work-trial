/** A conservative lexical screen, not a semantic truth oracle. Ambiguous prose
 * requires human review and must not be reported as a confirmed model error. */
export function missingReason(label:string,reason:string):'specific'|'review_required'{
 const text=reason.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 if(/\b(need not|not missing|not required|already (provided|supplied|present)|is present|was supplied|supplied is complete)\b/.test(text))return 'review_required';
 const absent=/\b(missing|absent|unavailable|not (provided|supplied|included|present)|could not find|cannot find|unable to find|no evidence of|need|needed|please (provide|supply))\b/.test(text);
 let specific=false;
 if(label==='YTD income statement')specific=/\b(income statement|profit and loss|p l)\b/.test(text);
 else if(label==='balance sheet')specific=/\b(balance sheet|statement of financial position)\b/.test(text);
 else if(label==='account inventory')specific=/\b(account inventory|account list|list of accounts|account disclosure)\b/.test(text);
 else if(/tax return$/.test(label))specific=text.includes(label.slice(0,4))&&/\b(tax return|personal return|income return)\b/.test(text);
 else if(/K-1$/.test(label))specific=text.includes(label.slice(0,4))&&/\bk\s*1\b/.test(text);
 else if(label==='original lease')specific=/\b(original lease|base lease)\b/.test(text);
 else if(label==='lease assignment')specific=/\b(lease assignment|assignment of (the )?lease)\b/.test(text);
 else if(label==='lease amendment')specific=/\b(lease amendment|amendment (1 |to (the )?lease)?)\b/.test(text);
 else specific=label.toLowerCase().replace(/[^a-z0-9]+/g,' ').split(' ').every(term=>new RegExp(`\\b${term}\\b`).test(text));
 return absent&&specific?'specific':'review_required';
}
