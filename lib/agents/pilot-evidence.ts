import {createHash} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {Access} from '../authorization';

/** Runtime evidence approval: the fixed pilot corpus plus bytes explicitly saved
 * through this borrower's upload manifests. This never trusts directory contents,
 * names alone, client hashes alone, or another borrower's receipts.
 * Open batches may contain saved bytes; only finalized batches admit agent work. */
export async function approvedPilotEvidence(db:PoolClient,access:Access,initialHashes:readonly string[]):Promise<Map<string,string>>{
 const rows=(await db.query(`SELECT d.id,d.storage_key,d.sha256,
   NOT EXISTS(SELECT 1 FROM draft_document_removals x WHERE x.application_id=d.application_id AND x.document_id=d.id AND x.restored_at IS NULL)
    AND NOT EXISTS(SELECT 1 FROM documents x WHERE x.application_id=d.application_id AND x.replaces_document_id=d.id) AS active,
   EXISTS(SELECT 1 FROM upload_batch_members m JOIN upload_batches b ON b.id=m.batch_id AND b.application_id=m.application_id
    WHERE m.application_id=d.application_id AND m.document_id=d.id AND m.state='saved'
     AND m.sha256=d.sha256 AND m.name=d.original_name AND b.application_id=$1 AND b.user_id=$2) AS uploaded
   FROM documents d WHERE d.application_id=$1`,[access.applicationId,access.userId])).rows;
 const approved=new Map<string,string>(),baseline=new Set(initialHashes);
 for(const row of rows){
  if(baseline.has(row.sha256)||(row.active&&row.uploaded))approved.set(row.storage_key,row.sha256);
  else if(row.active)throw Error('Unregistered evidence; paid dispatch denied');
 }
 return approved;
}
export function verifyPilotBlob(key:string,bytes:Uint8Array,approved:ReadonlyMap<string,string>){
 if(!approved.has(key)||createHash('sha256').update(bytes).digest('hex')!==approved.get(key))throw Error('Blob outside pilot registry or saved upload receipt');
}
