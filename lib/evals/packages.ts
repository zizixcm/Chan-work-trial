import {missingReason} from './reasons';
import {createHash} from 'node:crypto';
import {prepareCsv} from '../analysis/prepare-csv';
import {buildVerifyTask} from '../analysis/verify';
import {buildMatchTask} from '../analysis/match';
import type {AnalysisRequirement,PreparedDocument,VerifyResult,MatchResult} from '../analysis/types';
import {deriveFulfillment,type Fulfillment} from '../analysis/fulfillment';
export interface PackageCase {
 id:string;kind:'completion'|'matching';scope:string;references:string[];
 requirements:AnalysisRequirement[];documents:PreparedDocument[];
 expectedChecks?:Record<string,{state:'met'|'unmet'|'unknown';sources:string[]}>;
 expectedFulfillment?:Fulfillment;missing?:Array<{criterionId:string;label:string;terms:string[]}>;
 expectedRelevance?:Record<string,'relevant'|'not_relevant'|'ambiguous'|Array<'relevant'|'not_relevant'|'ambiguous'>>;
 expectedMatchChecks?:Record<string,'met'|'unmet'|'unknown'>;
 requiredComponents?:string[];suppliedComponents?:string[];
}
const borrower='Cedar Lantern Property LLC',property='Fixture Court',guarantor='Jordan Vale';
const document=(id:string,fields:Array<[string,string]>)=>{
 const text=[['Field','Value'],...fields].map(r=>r.map(v=>'"'+v.replaceAll('"','""')+'"').join(',')).join('\n')+'\n',bytes=Buffer.from(text);
 return prepareCsv({id,sha256:createHash('sha256').update(bytes).digest('hex')},bytes);
};
const families=[
 {id:'ytd',ref:'YTD.C1–C2',subject:borrower,period:'YTD January 1 through May 31 2026; fixed fixture policy accepts this cutoff',components:[
  {label:'YTD income statement',text:'YTD income statement for Cedar Lantern Property LLC, January 1 through May 31 2026, accrual basis, rental income 21000 and expenses 10000.'},
  {label:'balance sheet',text:'Balance sheet for Cedar Lantern Property LLC as of May 31 2026, accrual basis, assets 100000, liabilities 40000, equity 60000.'}]},
 {id:'bank',ref:'BANK.C1–C2 existing-account coverage slice',subject:borrower,period:'March, April and May 2026 for cash account CASH-1 and brokerage account BROKER-1',components:[
  {label:'account inventory',text:'Cedar Lantern Property LLC declares exactly two entity accounts: CASH-1 cash and BROKER-1 brokerage. Both were open throughout March, April and May 2026.'},
  ...['CASH-1','BROKER-1'].flatMap(account=>['March','April','May'].map(month=>({label:`${account} ${month} statement`,text:`${month} 2026 statement for ${borrower}, account ${account}. Page 1 of 1. Ending balance 10000. This is the entire statement.`})))]},
 {id:'tax',ref:'TAX.C1–C2 disclosed-pass-through coverage slice',subject:guarantor,period:'2023, 2024 and 2025',components:
  ['2023','2024','2025'].flatMap(year=>[{label:`${year} tax return`,text:`${year} complete personal tax return for Jordan Vale. Page 1 of 1 in this synthetic fixture. Disclosed pass-through: Fixture Holdings LLC. Schedule E reports pass-through income 10000; corresponding K-1 supplied separately.`},{label:`${year} K-1`,text:`${year} Schedule K-1 for Jordan Vale from Fixture Holdings LLC. Pass-through income 10000.`}])},
 {id:'lease',ref:'LEASE.C1 documentary-chain coverage slice (execution excluded)',subject:`${property}; current tenant Sample Clinic Operations LLC (predecessor Sample Clinic LLC); landlord ${borrower}`,period:'Current terms as of June 15 2026',components:[
  {label:'original lease',text:`Original lease LC-001, dated January 1 2026, between ${borrower} and Sample Clinic LLC for Fixture Court Unit A. Term January 1 2026 to December 31 2030. Base monthly rent 4000. The inventory declares one assignment and one amendment exist.`},
  {label:'lease assignment',text:`Assignment of lease LC-001 for Fixture Court Unit A, landlord Cedar Lantern Property LLC, from predecessor tenant Sample Clinic LLC to current tenant Sample Clinic Operations LLC effective March 1 2026. The original lease and amendment remain applicable.`},
  {label:'lease amendment',text:`Amendment 1 to lease LC-001 for Fixture Court Unit A, landlord Cedar Lantern Property LLC and current tenant Sample Clinic Operations LLC (predecessor Sample Clinic LLC), increases monthly base rent to 5000 effective May 1 2026. All other terms unchanged.`}]},
];
/** Narrow coverage oracles, not claims of full underwriting/legal completeness. */
export const completionCases:PackageCase[]=families.flatMap(f=>{
 const requirements:AnalysisRequirement[]=[{id:`coverage-${f.id}`,title:`Required document coverage: ${f.id}`,subject:f.subject,period:f.period,criteria:f.components.map((c,i)=>({id:`component-${i+1}`,description:`Supply the ${c.label} for this component's named account/month/year or role, within the overall package window; identify the relevant subject from the document itself. This checks documentary content coverage only, not signature validity, authenticity, legal authority or lender approval.`}))}];
 const docs=f.components.map((c,i)=>document('source-'+createHash('sha256').update(f.id+':'+c.label).digest('hex').slice(0,12),[['Document type',c.label],['Content',c.text]]));
 const common={kind:'completion' as const,scope:'Required-evidence coverage slice; not the entire catalog requirement',references:[f.ref,'docs/AI_PACKAGE_EVAL_SPEC.md'],requirements,requiredComponents:f.components.map(c=>c.label)};
 const full:PackageCase={...common,id:`${f.id}-full`,documents:docs,suppliedComponents:common.requiredComponents,expectedFulfillment:'fulfilled',missing:[],expectedChecks:Object.fromEntries(docs.map((d,i)=>[`component-${i+1}`,{state:'met' as const,sources:[d.id]}]))};
 const omissions=f.components.map((c,i):PackageCase=>({...common,id:`${f.id}-missing-${i+1}`,documents:docs.filter((_,j)=>j!==i),suppliedComponents:common.requiredComponents.filter((_,j)=>j!==i),expectedFulfillment:'partially_fulfilled',missing:[{criterionId:`component-${i+1}`,label:c.label,terms:c.label.toLowerCase().split(/\s+/)}],expectedChecks:{...full.expectedChecks,[`component-${i+1}`]:{state:'unmet',sources:[]}}}));
 return [full,...omissions,
  {...full,id:`${f.id}-redundant-copy`,documents:[...docs,{...docs[0],id:'source-a19b1cf01001'}],expectedChecks:{...full.expectedChecks,'component-1':{state:'met',sources:[docs[0].id,'source-a19b1cf01001']}}},
  {...omissions[0],id:`${f.id}-duplicate-cannot-replace-missing`,documents:[...omissions[0].documents,{...docs[1],id:'source-f6adab90002'}],expectedChecks:{...omissions[0].expectedChecks,'component-2':{state:'met',sources:[docs[1].id,'source-f6adab90002']}}}];
});
const matchRequirements:AnalysisRequirement[]=[
 {id:'rent',title:'Current rent roll',subject:property,period:'May 2026',criteria:[{id:'rent-evidence',description:'Provide the property rent roll identifying tenant, rent and term.'}]},
 {id:'ytd',title:'Current YTD financial statements',subject:borrower+'; '+property,period:'YTD through May 2026',criteria:[{id:'ytd-reconciliation',description:'Rental income reconciles with the rent roll and leases; those sources are relevant supporting evidence.'}]},
 {id:'tax',title:'Guarantor personal tax returns',subject:guarantor,period:'2023–2025',criteria:[{id:'tax-returns',description:'Provide actual personal tax returns and applicable schedules for Jordan Vale, not tax-order/status correspondence.'}]},
];
export const matchingCases:PackageCase[]=[
 {id:'rent-roll-many-to-many',kind:'matching',scope:'Primary + supporting relevance',references:['RENT','YTD.C4'],requirements:matchRequirements,documents:[document('evidence',[['Type','Rent roll'],['Property',property],['Borrower',borrower],['Period','May 2026'],['Tenant','Sample Clinic Operations LLC'],['Monthly rent','5000'],['Term','2026–2030']])],expectedRelevance:{rent:'relevant',ytd:'relevant',tax:'not_relevant'},expectedMatchChecks:{'rent-evidence':'met','ytd-reconciliation':'unmet','tax-returns':'unmet'}},
 {id:'wrong-property-no-link',kind:'matching',scope:'Unambiguously wrong subject',references:['Matching negatives'],requirements:matchRequirements,documents:[document('evidence',[['Type','Rent roll'],['Property','Unrelated Tower'],['Borrower','Unrelated Owner LLC'],['Period','May 2026'],['Monthly rent','5000']])],expectedRelevance:{rent:'not_relevant',ytd:'not_relevant',tax:'not_relevant'},expectedMatchChecks:{'rent-evidence':'unmet','ytd-reconciliation':'unmet','tax-returns':'unmet'}},
 {id:'tax-order-is-not-return',kind:'matching',scope:'Correspondence cannot substitute substantive evidence',references:['TAX','Email negatives'],requirements:matchRequirements,documents:[document('evidence',[['Type','Email status notification'],['Subject','Jordan Vale tax return order'],['Message','2023–2025 returns have been ordered but are pending. No returns or attachments are included.']])],expectedRelevance:{rent:'not_relevant',ytd:'not_relevant',tax:['relevant','ambiguous','not_relevant']},expectedMatchChecks:{'rent-evidence':'unmet','ytd-reconciliation':'unmet','tax-returns':'unmet'}},
 {id:'tax-return-primary',kind:'matching',scope:'Primary relevance independent of completeness',references:['TAX.C1'],requirements:matchRequirements,documents:[document('evidence',[['Type','Personal tax return'],['Taxpayer',guarantor],['Tax year','2025'],['Income','50000']])],expectedRelevance:{rent:'not_relevant',ytd:'not_relevant',tax:'relevant'},expectedMatchChecks:{'rent-evidence':'unmet','ytd-reconciliation':'unmet','tax-returns':'unmet'}},
];
export function packageTask(f:PackageCase){return f.kind==='matching'?buildMatchTask(f.documents[0],f.requirements):buildVerifyTask(f.documents,f.requirements[0]);}
export function scorePackage(f:PackageCase,output:VerifyResult|MatchResult){
 const issues:string[]=[],reasonScreens:Array<{criterionId:string;screen:string}>=[];
 if(f.kind==='matching'){
  if(output.schemaVersion!=='match.v1')return {passed:false,issues:['wrong_schema']};
  for(const [id,state] of Object.entries(f.expectedRelevance||{})){const actual=output.requirements.find(r=>r.requirementId===id)?.relevance.state;if(!actual||!(Array.isArray(state)?state:[state]).includes(actual))issues.push(`relevance:${id}`);}
  for(const [id,state] of Object.entries(f.expectedMatchChecks||{}))if(!output.requirements.some(r=>r.checks.some(c=>c.criterionId===id&&c.state===state)))issues.push(`coverage:${id}`);
  for(const found of output.requirements.filter(r=>r.relevance.state==='relevant')){
   const anchor=found.requirementId==='tax'?guarantor:property;
   if(f.id!=='tax-order-is-not-return'&&!found.relevance.evidence.some(e=>e.quote.includes(anchor)))issues.push(`relevance_source:${found.requirementId}`);
  }
  if(f.id==='rent-roll-many-to-many'){
   const check=output.requirements.find(r=>r.requirementId==='rent')?.checks.find(c=>c.criterionId==='rent-evidence');
   for(const fact of [property,'Sample Clinic Operations LLC','5000','2026–2030'])if(!check?.evidence.some(e=>e.quote===fact))issues.push(`rent_fact:${fact}`);
  }

 }else{
  if(output.schemaVersion!=='verify.v1')return {passed:false,issues:['wrong_schema']};
  if(deriveFulfillment(output)!==f.expectedFulfillment)issues.push('fulfillment');
  for(const [id,expected] of Object.entries(f.expectedChecks||{})){
   const actual=output.checks.find(c=>c.criterionId===id);
   if(actual?.state!==expected.state)issues.push(`criterion:${id}`);
   if(expected.state==='met'&&!actual?.evidence.some(e=>expected.sources.includes(e.documentId)&&e.record===3&&e.column===2&&f.documents.find(d=>d.id===e.documentId)?.records[2]?.[1]===e.quote))issues.push(`source_group:${id}`);
  }
  for(const missing of f.missing||[]){
   const check=output.checks.find(c=>c.criterionId===missing.criterionId);
   if(check?.state!=='unmet')issues.push(`missing_check:${missing.criterionId}`);
   const judgments=output.missingEvidence.map(reason=>missingReason(missing.label,reason));
   reasonScreens.push({criterionId:missing.criterionId,screen:judgments.includes('specific')?'specific_lexical_match':'review_required'});
  }
 }
 return {passed:issues.length===0&&!reasonScreens.some(r=>r.screen==='review_required'),structuralPassed:issues.length===0,reviewRequired:reasonScreens.length>0,reasonAssessment:reasonScreens.length?'provisional_lexical_screen':'not_applicable',reasonScreens,unscoredRelevance:Object.entries(f.expectedRelevance||{}).filter(([,state])=>Array.isArray(state)).map(([id])=>id),issues};
}
