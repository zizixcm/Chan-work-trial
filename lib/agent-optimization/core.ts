import {createHash} from 'node:crypto';
import {z} from 'zod';
import {AGENT_CONFIGURATION_DIGEST,borrowerInstructions,type BorrowerAction} from '../agents/definitions';
import {PILOT_MODEL} from '../agents/pilot-model.mjs';
export const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const proposalSchema=z.strictObject({hypothesis:z.string().min(1).max(1200),supplement:z.string().min(1).max(2000)});
const dimension=z.strictObject({passed:z.boolean(),reason:z.string().min(1)});
export const reviewSchema=z.strictObject({grounded:dimension,answersQuestion:dimension,appropriateNextSteps:dimension,noRepetition:dimension,criticalFailures:z.array(z.enum(['invented_evidence','false_completion','approval_claim','unauthorized_action']))});
export type Review=z.infer<typeof reviewSchema>;
export interface Case {id:string;input:unknown;rubric:string;maxWords:number;expectedAction:BorrowerAction['kind']}
export function candidate(supplement:string,hypothesis:string){return {id:digest({base:AGENT_CONFIGURATION_DIGEST,supplement,model:PILOT_MODEL}),supplement,hypothesis,baseDigest:AGENT_CONFIGURATION_DIGEST,baseInstructions:borrowerInstructions};}
export type Candidate=ReturnType<typeof candidate>;
export interface Result {caseId:string;repeat:number;action:BorrowerAction;review:Review;wordCount:number;passed:boolean;hardPassed:boolean;costMicros:number|null;elapsedMs:number}
export function grade(fixture:Case,action:BorrowerAction,review:Review){
 review=reviewSchema.parse(review);
 const wordCount=action.message.trim().split(/\s+/u).length;
 const hardPassed=review.grounded.passed&&review.criticalFailures.length===0&&action.kind===fixture.expectedAction;
 return {wordCount,hardPassed,passed:hardPassed&&wordCount<=fixture.maxWords&&review.answersQuestion.passed&&review.appropriateNextSteps.passed&&review.noRepetition.passed};
}
/** Paired comparisons require identical coverage; critical failures cannot average away. */
export function improves(baseline:Result[],trial:Result[]){
 const keys=(rs:Result[])=>rs.map(r=>`${r.caseId}:${r.repeat}`).sort();
 if(!baseline.length||new Set(keys(baseline)).size!==baseline.length||new Set(keys(trial)).size!==trial.length||JSON.stringify(keys(baseline))!==JSON.stringify(keys(trial)))return false;
 if(trial.some(r=>!r.hardPassed))return false;
 const prior=new Map(baseline.map(r=>[`${r.caseId}:${r.repeat}`,r]));
 if(trial.some(r=>prior.get(`${r.caseId}:${r.repeat}`)!.passed&&!r.passed))return false;
 return trial.filter(r=>r.passed).length>baseline.filter(r=>r.passed).length;
}
export async function optimize(options:{development:Case[];holdout:Case[];repeats:number;propose:(baseline:Candidate,results:Result[])=>Promise<unknown[]>;evaluate:(candidate:Candidate,cases:Case[],repeats:number)=>Promise<Result[]>;save:(name:string,value:unknown)=>Promise<void>}){
 if(!Number.isSafeInteger(options.repeats)||options.repeats<1||options.repeats>3)throw Error('Invalid repeat count');
 const ids=[...options.development,...options.holdout].map(c=>c.id);
 if(!options.development.length||!options.holdout.length||new Set(ids).size!==ids.length)throw Error('Development and holdout cases must be nonempty and disjoint');
 const evaluate=async(c:Candidate,cases:Case[])=>{
  const results=await options.evaluate(c,cases,options.repeats);
  const expected=cases.flatMap(f=>Array.from({length:options.repeats},(_,i)=>`${f.id}:${i}`)).sort();
  const actual=results.map(r=>`${r.caseId}:${r.repeat}`).sort();
  if(JSON.stringify(expected)!==JSON.stringify(actual))throw Error('Incomplete evaluation coverage');
  return results;
 };
 const baseline=candidate('','Current configuration');
 await options.save('baseline-config.json',baseline);
 const baseResults=await evaluate(baseline,options.development);
 await options.save('baseline-development.json',baseResults);
 let best=baseline,bestResults=baseResults;
 const proposals=await options.propose(baseline,baseResults);
 if(proposals.length<1||proposals.length>3)throw Error('Expected one to three bounded proposals');
 const seen=new Set([baseline.id]);
 for(const raw of proposals){const p=proposalSchema.parse(raw),c=candidate(p.supplement,p.hypothesis);if(seen.has(c.id))continue;seen.add(c.id);
  await options.save(`${c.id}-config.json`,c);
  const results=await evaluate(c,options.development);await options.save(`${c.id}-development.json`,results);
  if(improves(bestResults,results)){best=c;bestResults=results;}
 }
 // Freeze selection before any held-out data is evaluated. Never feed it to proposer.
 await options.save('frozen-selection.json',{candidate:best.id});
 const baseHoldout=await evaluate(baseline,options.holdout);
 const trialHoldout=best.id===baseline.id?baseHoldout:await evaluate(best,options.holdout);
 await options.save('holdout.json',{baseline:baseHoldout,candidate:trialHoldout});
 const eligible=best.id!==baseline.id&&trialHoldout.length===options.holdout.length*options.repeats&&trialHoldout.every(r=>r.passed);
 const report={status:eligible?'candidate_ready_for_review':best.id===baseline.id?'baseline_retained':'candidate_rejected_on_holdout',selected:eligible?best:baseline,proposedWinner:best.id,development:{baselinePassed:baseResults.filter(r=>r.passed).length,candidatePassed:bestResults.filter(r=>r.passed).length,total:baseResults.length},holdout:{baselinePassed:baseHoldout.filter(r=>r.passed).length,candidatePassed:trialHoldout.filter(r=>r.passed).length,total:trialHoldout.length},promoted:false,scope:'Synthetic borrower turns only; no investigator or durable journey certification'};
 await options.save('report.json',report);return report;
}
