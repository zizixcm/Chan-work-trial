import {digest} from '../preparation-pilot/contracts';
import type {PlannerAction,PageObservation} from './actions';
import type {ProcessingResult} from './protocol';
import type {PreparationInventory} from './service';

type Assessment=Extract<PlannerAction,{kind:'assess'}>;
type Finding=Assessment['findings'][number];
type Message={id:string;text:string;sequence:string};
export interface FindingBaseline {inventoryDigest:string;observationsDigest:string;borrowerContextDigest:string;configurationDigest:string|null}
export function findingBaseline(inventory:PreparationInventory,messages:Message[],configurationDigest:string|undefined,observations:PageObservation[]):FindingBaseline {
 return {inventoryDigest:digest(inventory),observationsDigest:digest(observations),borrowerContextDigest:digest(messages),configurationDigest:configurationDigest??null};
}
/** A prior judgment may be reaffirmed cheaply, but only while its requirement
 * definition and every cited source remain valid. It is never implicit evidence
 * that a new document is irrelevant or that a new borrower statement agrees. */
export function priorFindings(inventory:PreparationInventory,prior:ProcessingResult|undefined,observations:PageObservation[],messages:Message[]):Finding[]{
 if(!prior)return [];
 const findings:Finding[]=[];
 for(const r of inventory.requirements.filter(r=>r.collection==='borrower')){
  const old=prior.requirements.find(p=>p.requirementId===r.requirementId&&p.definitionRevision===r.definitionRevision);
  if(!old)continue;
  for(const criterion of r.criteria){
   const check=old.checks.find(c=>c.criterionId===criterion.id);if(!check)continue;
   const evidence:Finding['evidence']=[],assertionEvidence:NonNullable<Finding['assertionEvidence']>=[];
   let valid=true;
   for(const id of check.citationIds){
    const citation=prior.citations.find(c=>c.citationId===id);
    if(citation?.kind==='artifact'){
     const observation=observations.find(o=>o.id===citation.evidenceArtifactId&&o.documentId===citation.documentId&&o.sha256===citation.sha256);
     if(!observation||digest(observation)!==citation.artifactDigest||!inventory.documents.some(d=>d.active&&d.documentId===citation.documentId&&d.sha256===citation.sha256)){valid=false;break;}
     evidence.push({observationId:observation.id,page:citation.page,quote:citation.quote});
    }else if(citation?.kind==='structured_record'&&citation.field==='borrower_confirmation:no_amendments'&&criterion.confirmationPolicy==='no_amendments'){
     const source=messages.find(m=>m.id===citation.recordId&&digest(m.text)===citation.recordRevision);
     if(!source){valid=false;break;}assertionEvidence.push({messageId:source.id,quote:source.text,claim:'no_amendments'});
    }else{valid=false;break;}
   }
   if(!valid||(check.state==='met'&&!evidence.length&&!assertionEvidence.length))continue;
   const oldGap=old.gaps.find(g=>g.criterionId===criterion.id);
   if(check.state!=='met'&&!oldGap)continue;
   const gap=oldGap?(({coverageRef,criterionId,...g})=>g)(oldGap):null;
   findings.push({requirementId:r.requirementId,criterionId:criterion.id,state:check.state,reasonCode:check.reasonCode,explanation:check.explanation,evidence,...(assertionEvidence.length?{assertionEvidence}:{}),gap});
  }
 }
 return findings;
}
export function mergeIncrementalFindings(input:{action:Assessment;inventory:PreparationInventory;prior?:ProcessingResult;observations:PageObservation[];messages:Message[];baseline?:FindingBaseline;configurationDigest?:string}){
 const {action,inventory,prior,observations,messages}=input;
 const criteria=inventory.requirements.filter(r=>r.collection==='borrower').flatMap(r=>r.criteria.map(c=>({requirementId:r.requirementId,...c})));
 const ids=new Set<string>();
 for(const f of action.findings){if(ids.has(f.criterionId)||!criteria.some(c=>c.id===f.criterionId&&c.requirementId===f.requirementId))throw Error('Invalid incremental criterion ledger');ids.add(f.criterionId);}
 const candidates=priorFindings(inventory,prior,observations,messages),reaffirmed=new Set<string>();
 for(const id of action.reaffirmCriterionIds??[]){if(ids.has(id)||reaffirmed.has(id)||!candidates.some(f=>f.criterionId===id))throw Error('Invalid prior finding reference');reaffirmed.add(id);}
 const automatic=!!input.baseline&&digest(input.baseline)===digest(findingBaseline(inventory,messages,input.configurationDigest,observations));
 const retained=candidates.filter(f=>!ids.has(f.criterionId)&&(automatic||reaffirmed.has(f.criterionId)));
 const findings=criteria.map(c=>action.findings.find(f=>f.criterionId===c.id)??retained.find(f=>f.criterionId===c.id)??{
  requirementId:c.requirementId,criterionId:c.id,state:'unknown' as const,reasonCode:'not_evaluated',explanation:'This criterion has not been evaluated against the current evidence.',evidence:[],gap:{kind:'clarification' as const,subject:null,period:null,documentRole:null,description:'Review available evidence for this criterion; no additional borrower upload has been established as necessary.',owner:'operator' as const}
 });
 return {findings,retainedCriterionIds:retained.map(f=>f.criterionId),limitations:[...new Set([...action.limitations,...(retained.length?prior?.limitations.map(l=>l.detail??l.reasonCode)??[]:[])])]};
}
