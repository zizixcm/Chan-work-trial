import {readFile} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';

export const DATASET_CASES=['D01','D02','D03','D04','D05','D06','D07','D08','H01','H02','H03','H04','DEV-HISTORY','DEV-BUDGET','DEV-UPLOAD-RACE','DEV-DIALOGUE'] as const;
export type DatasetCaseId=typeof DATASET_CASES[number];
export const sha256=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
export interface DatasetDocument {documentId:string;filename:string;path:string;sha256:string;pageCount:number;seriesId:string;version:number}
export interface DatasetBoundary {
 id:string;message:string|null;notice:string|null;savedIds:string[];activeIds:string[];pendingIds:string[];
 rejectedMatches:{documentId:string;requirementId:string}[];
 expected:any;findings:any[];sourceCheckpoint:number;
}
export interface DatasetCase {
 id:DatasetCaseId;baseCase:string;version:string;root:string;request:any;documents:DatasetDocument[];
 boundaries:DatasetBoundary[];oracle:any;overlay:boolean;admissionDigest:string;
 readDocument:(id:string)=>Promise<Uint8Array>;
}
function within(root:string,path:string){const full=resolve(root,path),rel=relative(root,full);if(rel.startsWith('..')||isAbsolute(rel))throw Error('Dataset path escaped root');return full;}
/** Evaluator-only loader. Never pass this object, its paths or gold to a model. */
export async function loadDatasetCase(root:string,id:DatasetCaseId):Promise<DatasetCase>{
 if(!DATASET_CASES.includes(id))throw Error('Unknown dataset case');
 root=resolve(root);
 const json=async(path:string)=>JSON.parse(await readFile(within(root,path),'utf8'));
 const check=async(path:string,hash:string)=>{if(sha256(await readFile(within(root,path)))!==hash)throw Error(`Dataset admission mismatch: ${path}`);};
 const overlay=id.startsWith('DEV-');
 let scenario:any,overlayOracle:any;
 if(overlay){scenario=await json(`overlays/${id}/scenario.json`);overlayOracle=await json(`overlays/${id}/oracle.json`);}
 const baseCase=overlay?scenario.baseCase:id;
 if(!/^[DH]0[1-8]$/.test(baseCase))throw Error('Invalid base case');
 const base=`corpus/${baseCase.startsWith('D')?'development':'holdout'}/${baseCase}`;
 const admission=await json('review/admission.json');
 const admitted=admission.cases.find((c:any)=>c.caseId===baseCase&&c.status==='admitted');
 if(!admitted)throw Error('Case not independently admitted');
 await check(`${base}/manifest.json`,admitted.reviewedManifestSha256);
 await check(`${base}/private/oracle.json`,admitted.reviewedOracleSha256);
 if(baseCase.startsWith('H')){
  const freeze=await json('corpus/holdout.freeze.json');
  for(const [path,hash] of Object.entries(freeze.files))if(path.startsWith(`holdout/${baseCase}/`))await check(`corpus/${path}`,hash as string);
 }
 const manifest=await json(`${base}/manifest.json`),oracle=await json(`${base}/private/oracle.json`),request=await json(`${base}/agent/request.json`);
 const documents:DatasetDocument[]=manifest.documents;
 if(manifest.caseId!==baseCase||new Set(documents.map(d=>d.documentId)).size!==documents.length)throw Error('Invalid manifest');
 for(const d of documents){
  if(admitted.documents.find((a:any)=>a.documentId===d.documentId)?.sha256!==d.sha256)throw Error('Document admission mismatch');
  await check(`corpus/${d.path}`,d.sha256);
 }
 let boundaries:DatasetBoundary[];
 if(overlay){
  const overlayAdmission=await json('review/overlay-admission.json');
  const a=overlayAdmission.overlays.find((o:any)=>o.overlayId===id&&o.status==='admitted');
  if(!a||a.baseOracleSha256!==admitted.reviewedOracleSha256||overlayOracle.baseOracleSha256!==a.baseOracleSha256)throw Error('Overlay not admitted against this base');
  await check(`overlays/${id}/scenario.json`,a.scenarioSha256);await check(`overlays/${id}/oracle.json`,a.oracleSha256);
  for(const [doc,hash] of Object.entries(a.sourceHashes))if(documents.find(d=>d.documentId===doc)?.sha256!==hash)throw Error('Overlay source mismatch');
  boundaries=scenario.inputs.map((input:any)=>{
   const gold=overlayOracle.boundaries.find((b:any)=>b.boundaryId===input.boundaryId);
   if(!gold)throw Error('Unbound overlay boundary');
   const activeIds=input.savedFiles.filter((d:any)=>d.activity==='active').map((d:any)=>d.documentId);
   const pendingIds=input.pendingUploads.map((d:any)=>d.documentId);
   for(const [actual,expected] of [[activeIds,gold.expected.activeDocumentIds],[pendingIds,gold.expected.pendingUploadIds]])if(JSON.stringify([...actual].sort())!==JSON.stringify([...expected].sort()))throw Error('Overlay inventory mismatch');
   const source=oracle.checkpoints.find((c:any)=>c.checkpoint===gold.sourceOracleCheckpoint);
   const findings=source.findings.map((f:any)=>{const constraint=gold.expected.criterionConstraints[f.criterionId];return {...f,...constraint,gap:constraint.gapExpectation??f.gap,allowedStates:constraint.allowedStates,state:constraint.allowedStates[0]};});
   return {id:input.boundaryId,message:input.borrowerText,notice:input.runtimeNotice,savedIds:input.savedFiles.map((d:any)=>d.documentId),activeIds,pendingIds,rejectedMatches:[],expected:gold.expected,findings,sourceCheckpoint:gold.sourceOracleCheckpoint};
  });
 }else{
  const simulator=await json(`${base}/private/simulator.json`);const saved=new Set<string>(),inactive=new Set<string>();
  boundaries=simulator.turns.map((turn:any,index:number)=>{
   turn.uploadIds.forEach((d:string)=>saved.add(d));Object.keys(turn.supersedes??{}).forEach(d=>inactive.add(d));
   const gold=oracle.checkpoints[index];if(!gold||gold.checkpoint!==index+1)throw Error('Checkpoint order mismatch');
   const activeIds=[...saved].filter(d=>!inactive.has(d));
   if(JSON.stringify([...activeIds].sort())!==JSON.stringify([...gold.activeDocumentIds].sort()))throw Error('Simulator/oracle inventory mismatch');
   return {id:`checkpoint-${index+1}`,message:turn.borrowerText,notice:null,savedIds:[...saved],activeIds,pendingIds:[],rejectedMatches:turn.rejectedMatches??[],expected:gold,findings:gold.findings,sourceCheckpoint:index+1};
  });
 }
 if(!boundaries.length||new Set(boundaries.map(b=>b.id)).size!==boundaries.length)throw Error('Invalid boundary inventory');
 return {id,baseCase,version:manifest.datasetVersion,root,request,documents,boundaries,oracle,overlay,admissionDigest:sha256(JSON.stringify({admitted,overlayOracle})),
  async readDocument(documentId){const d=documents.find(d=>d.documentId===documentId);if(!d)throw Error('Unknown document');const bytes=await readFile(within(root,`corpus/${d.path}`));if(sha256(bytes)!==d.sha256)throw Error('Document changed after admission');return bytes;}};
}
