import {test} from 'node:test';
import assert from 'node:assert/strict';
import {digest} from '../lib/preparation-pilot/contracts';
import {findingBaseline,mergeIncrementalFindings} from '../lib/preparation/incremental-findings';
import {plannerActionSchema,type PageObservation} from '../lib/preparation/actions';
import type {PreparationInventory} from '../lib/preparation/service';
import type {ProcessingResult} from '../lib/preparation/protocol';
const hash='a'.repeat(64),config='b'.repeat(64);
function fixture(){
 const inventory:PreparationInventory={application:{borrowerName:'A',propertyName:'P',address:'X',transactionType:'refinance'},contentRevision:'1',pendingUploads:false,documents:[{documentId:'d',seriesId:'d',version:1,sha256:hash,name:'one.pdf',contentType:'application/pdf',active:true,storageKey:'d'}],requirements:[{requirementId:'r',definitionRevision:'1',evidenceRevision:'1',title:'Statements',owner:'borrower',period:'2025',purpose:'income',applicability:'required',collection:'borrower',stage:null,subject:null,criteria:[{id:'c1',description:'2025 actuals'},{id:'c2',description:'YTD'}]}]};
 const observations:PageObservation[]=[{id:'o',documentId:'d',sha256:hash,kind:'text',pageCount:1,pages:[{page:1,text:'2025 actual income'}],limitations:[]}];
 const prior:ProcessingResult={schemaVersion:'processing-result.v1',applicationId:'a',resultId:'old',resultRevision:'1',preparationId:'p',preparationRevision:'1',inputFingerprint:hash,dependencyFingerprint:hash,freshness:'historical',assessmentScope:'application',documents:[{documentId:'d',sha256:hash}],coverageRef:{id:'cov',revision:'1'},citations:[{kind:'artifact',citationId:'cite',documentId:'d',sha256:hash,evidenceArtifactId:'o',artifactDigest:digest(observations[0]),page:1,quote:'2025 actual income'}],requirements:[{requirementId:'r',definitionRevision:'1',evidenceRevision:'1',assessment:'appears_complete',checks:[{criterionId:'c1',state:'met',reasonCode:'supported',explanation:'2025 is supported',citationIds:['cite']}],gaps:[]}],limitations:[],conflicts:[],allowedNextActions:[]};
 const action=plannerActionSchema.parse({kind:'assess',findings:[],limitations:[]});if(action.kind!=='assess')throw Error();
 return {inventory,prior,observations,messages:[],action,configurationDigest:config,baseline:findingBaseline(inventory,[],config,observations)};
}
test('incremental updates retain valid prior findings and fill omitted unchecked criteria as unknown',()=>{
 const input=fixture(),result=mergeIncrementalFindings(input);
 assert.deepEqual(result.findings.map(f=>f.state),['met','unknown']);assert.deepEqual(result.retainedCriterionIds,['c1']);
 assert.equal(result.findings[1].gap?.owner,'operator');assert.match(result.findings[1].gap!.description,/no additional borrower upload/);
 const changed={...result.findings[1],state:'met' as const,evidence:result.findings[0].evidence,gap:null};
 const updated=mergeIncrementalFindings({...input,action:{...input.action,findings:[changed]}});
 assert.deepEqual(updated.findings.map(f=>f.state),['met','met']);assert.equal(updated.findings[0].explanation,'2025 is supported');
});
test('new uploads, revised requirements, changed messages, model config and new observations prevent implicit carry',()=>{
 for(const mutate of [
  (x:ReturnType<typeof fixture>)=>{x.inventory.documents.push({...x.inventory.documents[0],documentId:'new'});},
  (x:ReturnType<typeof fixture>)=>{x.inventory.requirements[0].definitionRevision='2';},
  (x:ReturnType<typeof fixture>)=>{x.configurationDigest='c'.repeat(64);},
  (x:ReturnType<typeof fixture>)=>{x.observations.push({...x.observations[0],id:'new'});},
 ]){const input=fixture();mutate(input);assert.equal(mergeIncrementalFindings(input).findings[0].state,'unknown');}
 const input=fixture();assert.equal(mergeIncrementalFindings({...input,messages:[{id:'m',text:'That statement is incorrect',sequence:'1'}]}).findings[0].state,'unknown');
});
test('explicit reaffirmation reuses citations after changed context without regenerating findings',()=>{
 const input=fixture();input.inventory.documents.push({...input.inventory.documents[0],documentId:'new'});
 const result=mergeIncrementalFindings({...input,action:{...input.action,reaffirmCriterionIds:['c1']}});
 assert.equal(result.findings[0].state,'met');assert.equal(result.findings[0].evidence[0].quote,'2025 actual income');
});
test('removed/replaced sources, altered observations and changed definitions cannot be reaffirmed',()=>{
 for(const mutate of [
  (x:ReturnType<typeof fixture>)=>{x.inventory.documents[0].active=false;},
  (x:ReturnType<typeof fixture>)=>{x.inventory.documents[0].sha256='d'.repeat(64);},
  (x:ReturnType<typeof fixture>)=>{x.observations[0].pages[0].text='different';},
  (x:ReturnType<typeof fixture>)=>{x.inventory.requirements[0].definitionRevision='2';},
 ]){const input=fixture();mutate(input);assert.throws(()=>mergeIncrementalFindings({...input,action:{...input.action,reaffirmCriterionIds:['c1']}}),/Invalid prior/);}
});
test('duplicate, unknown, cross-requirement and overwritten reaffirmation IDs are rejected',()=>{
 const input=fixture(),finding=mergeIncrementalFindings(input).findings[0];
 for(const findings of [[finding,finding],[{...finding,criterionId:'wrong'}],[{...finding,requirementId:'wrong'}]])assert.throws(()=>mergeIncrementalFindings({...input,action:{...input.action,findings}}),/Invalid incremental/);
 for(const action of [{...input.action,reaffirmCriterionIds:['c1','c1']},{...input.action,findings:[finding],reaffirmCriterionIds:['c1']},{...input.action,reaffirmCriterionIds:['unknown']}])assert.throws(()=>mergeIncrementalFindings({...input,action}),/Invalid prior/);
});
test('legacy results need explicit reaffirmation and retained findings cannot discard prior limitations',()=>{
 const input=fixture();input.prior.limitations.push({requirementId:null,criterionId:null,reasonCode:'unchecked_attachment',detail:'An attachment remains unread',citationIds:[],coverageRef:{id:'cov',revision:'1'},owner:'operator'});
 assert.equal(mergeIncrementalFindings({...input,baseline:undefined}).findings[0].state,'unknown');
 assert.deepEqual(mergeIncrementalFindings(input).limitations,['An attachment remains unread']);
});
