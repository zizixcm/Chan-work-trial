import type {BorrowerAction} from '../agents/definitions';
import {createMastraBorrowerPlanner,type AgentTransport} from '../agents/runtime';

const inventory={application:{borrowerName:'Example LLC',propertyName:'Example Plaza',address:'1 Example St',transactionType:'Refinance'},contentRevision:'1',
 documents:[{documentId:'d1',name:'Rent roll.pdf',active:true},{documentId:'d2',name:'2025 operating statement.pdf',active:true}],
 requirements:[{requirementId:'r1',title:'Rent roll',owner:'Borrower',period:'Current',criteria:[{id:'c1',description:'Current rent roll'}]}],pendingUploads:false};
export const borrowerConcisionCases=[
 {id:'uploads-saved',question:"What's been uploaded?",inventory,maxWords:120,
  rubric:'Identify both saved files. Do not turn the answer into a missing-document checklist, infer completeness or approval, or invent a next step. No action is required by this snapshot.'},
 {id:'uploads-empty',question:"What's been uploaded?",inventory:{...inventory,documents:[]},maxWords:80,
  rubric:'Say no files are saved. Briefly suggest uploading the requested current rent roll. Do not pretend to inspect evidence or report an assessment.'},
 {id:'uploads-pending',question:"What's been uploaded?",inventory:{...inventory,pendingUploads:true},maxWords:120,
  rubric:'Identify both saved files and distinguish pending uploads from saved files. Briefly suggest checking unfinished uploads; do not ask to re-upload saved files or claim all files have been considered.'},
 {id:'uploads-specific',question:'Has my rent roll been uploaded?',inventory,maxWords:60,
  rubric:'Answer yes and identify Rent roll.pdf as saved. Do not list unrelated requirements or infer that the rent roll was checked or accepted. No next step is necessary.'},
 {id:'uploads-detail',question:'List every uploaded file by name and explain whether saving means lender approval.',inventory,maxWords:180,
  rubric:'Name both files and explicitly explain that saved does not mean lender approval. Brevity must not omit either part of the question. Do not invent actions.'},
] as const;
export type BorrowerConcisionCase=typeof borrowerConcisionCases[number];
export const borrowerQualityDimensions=['answersQuestion','grounded','appropriateNextSteps','noRepetition'] as const;
export type BorrowerQualityReview=Record<typeof borrowerQualityDimensions[number],{passed:boolean;evidence:string}>;

/** Mechanical limits are only a screen. A separate reviewer must assess meaning
 * against the fixture, not merely accept keywords or the agent's self-score. */
export function scoreBorrowerConcision(fixture:BorrowerConcisionCase,action:BorrowerAction,review?:BorrowerQualityReview){
 const wordCount=action.message.trim().split(/\s+/u).filter(Boolean).length;
 const checks=[{id:'direct_reply',passed:action.kind==='reply'},
  {id:'concise',passed:wordCount<=fixture.maxWords},
  ...borrowerQualityDimensions.map(id=>({id,passed:review?.[id]?.passed===true&&Boolean(review[id].evidence.trim())}))];
 return {caseId:fixture.id,wordCount,maxWords:fixture.maxWords,checks,
  status:checks.slice(0,2).some(c=>!c.passed)?'failed':!review?'needs_review':checks.every(c=>c.passed)?'passed':'failed'};
}

/** Inject the existing metered transport for live runs. Offline scripted runs
 * test wiring only. Gold rubric and word limits never enter the agent prompt. */
export async function evaluateBorrowerConcision(fixture:BorrowerConcisionCase,transport:AgentTransport,signal:AbortSignal){
 const input={inventory:fixture.inventory,messages:[{id:'m1',sequence:'1',text:fixture.question}],replies:[],processing:{currentResult:null},completeness:null};
 const result=await createMastraBorrowerPlanner(transport).decide(input,signal,async()=>({evaluationOnly:true}));
 return {action:result.action,actualMicros:result.actualMicros,score:scoreBorrowerConcision(fixture,result.action)};
}
