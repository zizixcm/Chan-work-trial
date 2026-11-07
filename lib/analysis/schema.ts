import type { JSONSchema7 } from 'json-schema';
// Provider schema enforces shape; local validators enforce size/range limits.
// Gemini rejects deeply nested bounded arrays as too many constrained states.
const text:JSONSchema7={type:'string'};
const id:JSONSchema7={type:'string'};
const object=(properties:Record<string,JSONSchema7>):JSONSchema7=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const array=(items:JSONSchema7,maxItems:number):JSONSchema7=>({type:'array',items});
const enumeration=(values:string[]):JSONSchema7=>({type:'string',enum:values});
const source=object({documentId:id,record:{type:'integer'},column:{type:'integer'},quote:{type:'string'}});
const sources=array(source,8);
const check=object({criterionId:id,state:enumeration(['met','unmet','unknown']),reason:text,evidence:sources});
export const matchOutputSchema:JSONSchema7=object({
 schemaVersion:{type:'string',const:'match.v1'},
 classification:object({kind:enumeration(['rent_roll','other_table','unknown']),reason:text,evidence:sources}),
 requirements:array(object({requirementId:id,relevance:object({state:enumeration(['relevant','not_relevant','ambiguous']),reason:text,evidence:sources}),checks:array(check,20)}),50),
});
export const verifyOutputSchema:JSONSchema7=object({
 schemaVersion:{type:'string',const:'verify.v1'},requirementId:id,assessment:enumeration(['appears_complete','incomplete','unknown']),
 checks:array(check,20),missingEvidence:array(text,20),conflicts:array(object({reason:text,evidence:sources}),20),limitations:array(text,20),
});
