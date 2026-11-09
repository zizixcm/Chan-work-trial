import {z} from 'zod';
import type {PageObservation} from './actions';

// Closed vocabulary and counts only: never retain quotes, document names or IDs
// supplied by a model. The surrounding span supplies trusted run/step correlation.
export const validationDiagnosticSchema=z.strictObject({
 code:z.enum(['observation_missing','document_mismatch','version_mismatch','page_missing','ocr_confidence_low','unsupported_observation','quote_mismatch','absence_coverage_incomplete']),
 basis:z.enum(['identity','purpose','period','target']).optional(),
 evidenceIndex:z.number().int().nonnegative().optional(),
 page:z.number().int().positive().optional(),
 observationKind:z.enum(['inventory','text','image','ocr','search','unavailable']).optional(),
 confidence:z.number().finite().optional(),
 quoteLength:z.number().int().nonnegative().optional(),
 pageTextLength:z.number().int().nonnegative().optional(),
 whitespaceNormalizedMatch:z.boolean().optional(),
 pendingUploads:z.boolean().optional(),
 activeDocuments:z.number().int().nonnegative().optional(),
 unknownPageCounts:z.number().int().nonnegative().optional(),
});
export type ValidationDiagnostic=z.infer<typeof validationDiagnosticSchema>;
export class EvidenceValidationError extends Error {
 readonly diagnostic:ValidationDiagnostic;
 constructor(message:string,diagnostic:ValidationDiagnostic){super(message);this.name='EvidenceValidationError';this.diagnostic=validationDiagnosticSchema.parse(diagnostic);}
}
export function validationDiagnostic(error:unknown):ValidationDiagnostic|undefined {
 for(let depth=0;depth<5&&error instanceof Error;depth++,error=error.cause){
  if(error instanceof EvidenceValidationError)return validationDiagnosticSchema.parse(error.diagnostic);
 }
}
export function validateMappingEvidence(observations:PageObservation[],document:{documentId:string;sha256:string},e:{observationId:string;page:number;quote:string},basis:ValidationDiagnostic['basis'],evidenceIndex:number){
 const observation=observations.find(o=>o.id===e.observationId),page=observation?.pages.find(p=>p.page===e.page);
 const detail={basis,evidenceIndex,page:e.page,quoteLength:e.quote.length,...(observation?{observationKind:observation.kind}:{}),...(page?{pageTextLength:page.text.length,...(page.confidence===undefined?{}:{confidence:page.confidence})}:{})};
 const fail=(code:ValidationDiagnostic['code'],extra:Partial<ValidationDiagnostic>={})=>{throw new EvidenceValidationError('Mapping support unavailable',{...detail,code,...extra});};
 if(!observation)fail('observation_missing');
 if(observation!.documentId!==document.documentId)fail('document_mismatch');
 if(observation!.sha256!==document.sha256)fail('version_mismatch');
 if(!page)fail('page_missing');
 if(observation!.kind==='ocr'&&(page!.confidence??0)<80)fail('ocr_confidence_low');
 if(['inventory','search','unavailable'].includes(observation!.kind))fail('unsupported_observation');
 if(['text','ocr'].includes(observation!.kind)&&!page!.text.includes(e.quote)){
  const normalize=(s:string)=>s.replace(/\s+/g,' ').trim();
  fail('quote_mismatch',{whitespaceNormalizedMatch:normalize(page!.text).includes(normalize(e.quote))});
 }
}
