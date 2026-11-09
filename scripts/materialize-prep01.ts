import { mkdir,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildFixture } from '../tests/fixtures/preparation-pilot/fixture';
import { gold,facts } from '../tests/fixtures/preparation-pilot/oracle';
/** Explicit offline artifact generation. No DB, network, uploads or provider. */
async function main(){
 const destination=process.argv[2];if(!destination)throw new Error('Usage: npx tsx scripts/materialize-prep01.ts <new-output-directory>');
 const root=resolve(destination);await mkdir(root,{recursive:false});const fixture=await buildFixture();
 for(const [id,bytes] of fixture.bytes)await writeFile(`${root}/${id}.pdf`,bytes,{flag:'wx'});
 await writeFile(`${root}/manifest.json`,JSON.stringify({schemaVersion:fixture.version,synthetic:true,reviewDate:fixture.reviewDate,policy:{id:'PREP-01/U1',stage:'initial_underwriting',description:'Synthetic test policy only. Initial submission permits disclosed trust availability, lender LOI countersignature and revised appraisal acceptance to remain lender-pending; insurance is a closing obligation. No lender acceptance or credit approval.',criteria:fixture.checkpoints[0].criteria},relations:[{documentId:'d14',duplicateOf:'d04'},{documentId:'d15',duplicateOf:'d07'},{documentId:'d19',replaces:'d07'}],checkpoints:fixture.checkpoints},null,2));
 // Never load this separate gold file into a planner prompt.
 await writeFile(`${root}/oracle.json`,JSON.stringify({schemaVersion:'PREP-01.gold.v1',gold,facts,warning:'Authored oracle; simulated traces do not prove model judgment. Readiness is a future synthetic diagnostic, not current product scope.'},null,2));
 console.log(`Wrote ${fixture.bytes.size} synthetic PDF versions and separate manifest/oracle to ${root}`);
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Fixture generation failed');process.exitCode=1;});
