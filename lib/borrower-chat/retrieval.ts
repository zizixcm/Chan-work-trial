import type { Citation, GroundedContext, SourceReference } from './contracts';
import { UploadError } from '../validation';
export const retrievalQuestions = {
  requested: "What's requested?",
  uploaded: "What's been uploaded?",
  missing: "What's still missing?",
} as const;
export type RetrievalIntent = keyof typeof retrievalQuestions;
export type AnswerSource = {
  id: string; label: string;
  reference: SourceReference | {kind:'snapshot';revision:string};
  detail: string[]; evidence?: Citation;
};
export type GroundedAnswer = {
  schemaVersion:'grounded-answer.v1'; intent:RetrievalIntent; contextRevision:string;
  summary:string; notes:string[]; items:{title:string;lines:string[];sourceIds:string[]}[];
  sources:AnswerSource[];
};
export function parseRetrievalInput(value:unknown):{intent:RetrievalIntent;clientMessageId:string} {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new UploadError('Choose a supported application question.');
  const v=value as Record<string,unknown>;
  if(Object.keys(v).some(k=>!['intent','clientMessageId'].includes(k))||
    typeof v.intent!=='string'||!Object.hasOwn(retrievalQuestions,v.intent)||
    typeof v.clientMessageId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(v.clientMessageId))
    throw new UploadError('Choose a supported application question and a valid message ID.');
  return {intent:v.intent as RetrievalIntent,clientMessageId:v.clientMessageId};
}
/** Deterministic retrieval over an authorized snapshot; no free-form model claims,
 * new investigation, readiness verdict, or mutation of evidence. */
export function buildGroundedAnswer(context:GroundedContext,intent:RetrievalIntent):GroundedAnswer {
  const sources:AnswerSource[]=[];
  function cite(source:Omit<AnswerSource,'id'>) {const id=`s${sources.length+1}`;sources.push({id,...source});return id;}
  const inventory=cite({label:'Application snapshot',reference:{kind:'snapshot',revision:context.revision},detail:[
    `${context.documents.length} current saved files; ${context.requirements.filter(r=>r.collection==='borrower').length} active borrower requests.`,
    `${context.intake.openBatches} open upload batches; ${context.intake.unsavedMembers} unsaved upload entries; ${context.intake.pendingMatches} pending matching checks.`,
    'Current files exclude replaced versions and files removed from the draft. No historical-file search was performed.'
  ]});
  const answer:GroundedAnswer={schemaVersion:'grounded-answer.v1',intent,contextRevision:context.revision,
    summary:'',notes:['AI assessments are not lender acceptance or application readiness.'],items:[],sources};
  const unsettled=Object.values(context.intake).some(n=>n>0);
  if(unsettled)answer.notes.push('Some upload entries are unsaved or checks are pending. This answer cannot establish that all evidence has been considered. See upload history for failed or unfinished entries.');
  if(intent==='uploaded') {
    answer.summary=`${context.documents.length} current saved file${context.documents.length===1?'':'s'}.`;
    answer.notes=['Saved does not mean checked or accepted.'];
    if(unsettled)answer.notes.push('Some uploads or checks are unfinished. Check upload history for any failed or unsaved entries.');
    else if(!context.documents.length&&context.requirements.some(r=>r.collection==='borrower'))answer.notes.push('Next: upload the documents listed in your requests.');
    answer.items=context.documents.map(d=>({title:d.name,lines:[
      d.requirementIds.length?`Linked to: ${d.requirementIds.map(id=>context.requirements.find(r=>r.id===id&&r.collection==='borrower')?.title??'Other linked request').join(', ')}.`:'Not linked to a request.'],sourceIds:[cite({label:`Saved file: ${d.name}`,reference:d.source,
        detail:[`Version ${d.version}; saved ${d.createdAt}; ${d.sizeBytes} bytes.`,`SHA-256: ${d.sha256}`]}),inventory]}));
    return answer;
  }
  const requirements=context.requirements.filter(r=>r.collection==='borrower');
  answer.summary=intent==='requested'?`${requirements.length} active borrower request${requirements.length===1?'':'s'}. Conditions and timing are shown as recorded.`:
    'Here is the evidence and check status for each borrower request. An unlinked file or unfinished check is not proof of missing evidence.';
  if(!requirements.length)answer.notes.push('No active borrower requests are recorded in this snapshot. This does not establish application readiness.');
  for(const r of requirements) {
    const definition=[r.purpose,`Period: ${r.period}. Owner: ${r.owner}. Applicability: ${r.applicability}.`,
      ...(r.condition?[`Condition: ${r.condition}`]:[]),...(r.stage?[`Stage: ${r.stage}`]:[]),...r.criteria.map(c=>`Requested criterion: ${c}`)];
    const sourceIds=[cite({label:`Request: ${r.title}`,reference:r.source,detail:[...definition,`Request revision: ${r.definitionRevision}; evidence revision: ${r.evidenceRevision}.`]}),inventory];
    if(intent==='requested'){answer.items.push({title:r.title,lines:definition,sourceIds});continue;}
    const lines=[r.documentIds.length?`${r.documentIds.length} current saved file(s) linked.`:'No current saved file is linked. Check unlinked uploads before uploading again.'];
    if(r.condition)lines.push(`Conditional request: ${r.condition}. Applicability has not been inferred.`);
    if(r.stage)lines.push(`Recorded stage: ${r.stage}. This is not a determination that it is due now.`);
    const assessment=r.assessment;
    const usable=assessment.freshness==='current'&&assessment.source!==null&&['appears_complete','incomplete','indeterminate'].includes(assessment.state);
    if(!usable) {
      lines.push(assessment.freshness==='stale'||assessment.state==='outdated'?'The previous check is out of date. Its conclusions are not used here.':
        assessment.state==='checking'?'A check is pending or running. What is missing is not determined yet.':
        assessment.state==='unavailable'?'The check is unavailable or did not finish. What is missing is not determined yet.':'No current usable check is available. What is missing is not determined yet.');
    } else {
      lines.push(assessment.state==='appears_complete'?'The current AI check found this request appears complete.':
        assessment.state==='incomplete'?'The current AI check reports unmet criteria.':'The current AI check could not determine completeness.');
      const details=[...assessment.checks.map(c=>`${c.state}: ${c.reason}`),...assessment.missingEvidence.map(m=>`Reported gap: ${m}`),
        ...assessment.limitations.map(l=>`Limitation: ${l}`),...assessment.conflicts.map(c=>`Conflict: ${c.reason}`)];
      sourceIds.push(cite({label:`Current check: ${r.title}`,reference:assessment.source!,detail:[`Assessment: ${assessment.source!.assessmentId}; request revision: ${r.definitionRevision}; evidence revision: ${r.evidenceRevision}.`,...details]}));
      lines.push(...assessment.checks.filter(c=>c.state!=='met').map(c=>`${c.state==='unmet'?'Reported unmet criterion':'Uncertain criterion'}: ${c.reason}`),
        ...assessment.missingEvidence.map(m=>`The check reports: ${m}`),...assessment.limitations.map(l=>`Limitation: ${l}`),...assessment.conflicts.map(c=>`Conflict: ${c.reason}`));
      for(const evidence of [...assessment.checks.flatMap(c=>c.citations),...assessment.conflicts.flatMap(c=>c.citations)]) {
        sourceIds.push(cite({label:`Evidence: ${context.documents.find(d=>d.id===evidence.documentVersionId)?.name??'Saved file'}`,
          reference:{kind:'document',documentVersionId:evidence.documentVersionId,sha256:evidence.sha256},evidence,
          detail:[`Record ${evidence.record}, column ${evidence.column}${evidence.sourceLocation?`; ${evidence.sourceLocation}`:''}`,evidence.quote]}));
      }
    }
    answer.items.push({title:r.title,lines,sourceIds});
  }
  return answer;
}
