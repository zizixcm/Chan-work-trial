import test from 'node:test';
import assert from 'node:assert/strict';
import {assessRequirementDisplay,createRequirementDisplayScorer,requirementDisplayInput} from '../lib/evaluation-observability/requirement-display';

const input=requirementDisplayInput.parse({caseId:'DISPLAY-01',occurrences:[{occurrenceId:'roll',name:'Current rent roll',status:'complete'},{occurrenceId:'ops',name:'Property operating statements',status:'partial'}]});
const output=(roll:string,ops='Property operating statements — annual supported; YTD missing')=>({caseId:input.caseId,coverageVerified:true,labels:[{occurrenceId:'roll',visibleText:roll},{occurrenceId:'ops',visibleText:ops}]});
test('native display scorer accepts emoji adjacent to name on the left with Markdown',async()=>{
 const scorer=createRequirementDisplayScorer();
 for(const text of ['✅ **Current rent roll**','✅ Current rent roll'])assert.equal((await scorer.run({input,output:output(text)})).score,1);
});
test('missing, remote and non-emoji checks fail; partial requirements cannot look complete',()=>{
 for(const text of ['Current rent roll ✅','Current rent roll — complete','✓ Current rent roll','✅ Done reviewing. Current rent roll','✅\nCurrent rent roll'])assert.equal(assessRequirementDisplay(input,output(text)).passed,false);
 assert.equal(assessRequirementDisplay(input,output('✅ Current rent roll','✅ Property operating statements')).passed,false);
});
test('repeated occurrences and unverified coverage fail closed',()=>{
 const repeated={...input,occurrences:[...input.occurrences,{...input.occurrences[0],occurrenceId:'roll-again'}]};
 assert.equal(assessRequirementDisplay(repeated,output('✅ Current rent roll')).passed,false);
 assert.equal(assessRequirementDisplay(input,{...output('✅ Current rent roll'),coverageVerified:false}).passed,false);
});
