/** Score a captured native borrower action; never makes provider calls. */
import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {borrowerActionSchema} from '../lib/agents/definitions';
import {borrowerConcisionCases,scoreBorrowerConcision} from '../lib/evals/borrower-concision';
const dimension=z.strictObject({passed:z.boolean(),evidence:z.string().trim().min(1)});
const reviewSchema=z.strictObject({answersQuestion:dimension,grounded:dimension,appropriateNextSteps:dimension,noRepetition:dimension});
async function main(){
 const [caseId,actionFile,reviewFile]=process.argv.slice(2);
 const fixture=borrowerConcisionCases.find(c=>c.id===caseId);
 if(!fixture||!actionFile)throw Error(`Usage: npx tsx scripts/evaluate-borrower-concision.ts <${borrowerConcisionCases.map(c=>c.id).join('|')}> <action.json> [independent-review.json]`);
 const action=borrowerActionSchema.parse(JSON.parse(await readFile(actionFile,'utf8')));
 const review=reviewFile?reviewSchema.parse(JSON.parse(await readFile(reviewFile,'utf8'))):undefined;
 const score=scoreBorrowerConcision(fixture,action,review);
 console.log(JSON.stringify({...score,rubric:fixture.rubric},null,2));
 process.exitCode=score.status==='passed'?0:score.status==='needs_review'?2:1;
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Evaluation failed');process.exitCode=1;});
