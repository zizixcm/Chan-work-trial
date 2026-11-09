import {createScorer} from '@mastra/core/evals';
import {z} from 'zod';

// The evaluator inventories every visible requirement occurrence (including
// repeated mentions), binding its status to the current validated snapshot.
// Never accept the model's own status classification as this input.
export const requirementDisplayInput=z.object({caseId:z.string(),occurrences:z.array(z.object({
 occurrenceId:z.string(),name:z.string().min(1),status:z.enum(['complete','partial','missing','unknown','pending']),
}))});
export const requirementDisplayOutput=z.object({caseId:z.string(),coverageVerified:z.boolean(),labels:z.array(z.object({
 occurrenceId:z.string(),visibleText:z.string(),
}))});
export function assessRequirementDisplay(input:z.infer<typeof requirementDisplayInput>,output:z.infer<typeof requirementDisplayOutput>){
 const issues:string[]=[];
 if(input.caseId!==output.caseId||!output.coverageVerified)issues.push('unverified_display_coverage');
 const ids=input.occurrences.map(o=>o.occurrenceId),seen=output.labels.map(o=>o.occurrenceId);
 if(new Set(ids).size!==ids.length||new Set(seen).size!==seen.length||ids.length!==seen.length||ids.some(id=>!seen.includes(id)))issues.push('occurrence_coverage');
 for(const expected of input.occurrences){
  const label=output.labels.find(l=>l.occurrenceId===expected.occurrenceId);
  if(!label)continue;
  // Accept Markdown emphasis and a checkmark before the name, but not
  // a remote emoji elsewhere in a paragraph or an SVG icon with no emoji text.
  const plain=label.visibleText.replace(/[*_`]/g,'').replace(/\uFE0F/g,'');
  const name=expected.name.replace(/[*_`]/g,'').replace(/\uFE0F/g,'');
  const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const adjacent=new RegExp(`✅[ \t]*${escaped}`).test(plain);
  const anySide=adjacent||new RegExp(`${escaped}[ \t]*✅`).test(plain);
  if(!plain.includes(name))issues.push(`missing_name:${expected.occurrenceId}`);
  if(expected.status==='complete'&&!adjacent)issues.push(`missing_checkmark:${expected.occurrenceId}`);
  if(expected.status!=='complete'&&anySide)issues.push(`false_completion_checkmark:${expected.occurrenceId}`);
 }
 return {passed:issues.length===0,issues};
}
export function createRequirementDisplayScorer(){
 return createScorer({id:'completed-requirement-checkmark',description:'Every displayed complete requirement has ✅ immediately to the left of its name; incomplete requirements do not',
  type:{input:requirementDisplayInput,output:requirementDisplayOutput}}).generateScore(({run})=>{
   const input=requirementDisplayInput.safeParse(run.input),output=requirementDisplayOutput.safeParse(run.output);
   return input.success&&output.success&&assessRequirementDisplay(input.data,output.data).passed?1:0;
  });
}
