import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {Access} from '../authorization';
import type {PreparationInventory} from '../preparation/service';
import {digest} from '../preparation-pilot/contracts';

/** Under the application lock. A completed batch is independent of another
 * unfinished batch; only server-saved active documents enter its trigger. */
export async function admitInventoryEvents(db:PoolClient,access:Access,conversationId:string,inventory:PreparationInventory,grant:{modeEpoch:string;preferenceEpoch:string;automaticEnabled:boolean},onlyBatchId?:string){
 const rows=(await db.query(`SELECT b.id,b.state,b.processing_requested_at,b.processing_request_epoch,
   md5(coalesce(string_agg(m.id||':'||m.document_id,',' ORDER BY m.id),'')) AS revision,
   coalesce(jsonb_agg(jsonb_build_object('id',m.id,'name',m.name,'documentId',m.document_id) ORDER BY m.id) FILTER(WHERE m.document_id IS NOT NULL),'[]') AS files,
   a.saved_revision,a.saved_document_ids
   FROM upload_batches b LEFT JOIN upload_batch_members m ON m.batch_id=b.id AND m.state='saved'
   LEFT JOIN borrower_agent_upload_admissions a ON a.batch_id=b.id
   WHERE b.application_id=$1 AND b.user_id=$2 AND ($3::text IS NULL OR b.id=$3) GROUP BY b.id,a.saved_revision,a.saved_document_ids ORDER BY b.created_at,b.id`,[access.applicationId,access.userId,onlyBatchId??null])).rows;
 let admitted=false;
 for(const batch of rows){
  if(batch.state==='open'||batch.saved_revision===batch.revision)continue;
  const explicit=!!batch.processing_requested_at;
  if(explicit?batch.processing_request_epoch!==grant.modeEpoch:!grant.automaticEnabled)continue;
  const files=(batch.files as {id:string;name:string;documentId:string}[]).filter(file=>!(batch.saved_document_ids??[]).includes(file.documentId)&&inventory.documents.some(doc=>doc.documentId===file.documentId&&doc.active));
  if(files.length){
   const authority=explicit?{kind:'explicit_upload',modeEpoch:batch.processing_request_epoch}:{kind:'automatic',modeEpoch:grant.modeEpoch,preferenceEpoch:grant.preferenceEpoch};
   const trigger={kind:'files_uploaded',grant:authority,uploadBatchId:batch.id,newDocumentIds:[...new Set(files.map(file=>file.documentId))],files};
   await db.query(`INSERT INTO borrower_agent_turns(id,application_id,user_id,conversation_id,source_key,trigger_context)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(application_id,user_id,source_key) DO NOTHING`,[randomUUID(),access.applicationId,access.userId,conversationId,`upload:${batch.id}:${batch.revision}`,trigger]);
   admitted=true;
  }
  await db.query(`INSERT INTO borrower_agent_upload_admissions(batch_id,saved_revision,saved_document_ids) VALUES($1,$2,$3)
   ON CONFLICT(batch_id) DO UPDATE SET saved_revision=excluded.saved_revision,saved_document_ids=excluded.saved_document_ids,updated_at=now()`,[batch.id,batch.revision,JSON.stringify(batch.files.map((file:{documentId:string})=>file.documentId))]);
 }
 // A manual commit delivers only this batch. Leave retrospective admission and
 // inventory snapshots to the worker; retries use the same durable source key.
 if(admitted)await db.query("UPDATE borrower_agent_turns SET state='superseded',reason_code='upload_batch_coalesced' WHERE application_id=$1 AND user_id=$2 AND state='queued' AND source_key LIKE 'inventory:%' AND decision IS NULL AND reserved_micros=0",[access.applicationId,access.userId]);
 if(onlyBatchId)return;
 // Ignore upload-only inventory churn (including individual files before finalize).
 // Keep other mutations: requirement definitions, removals, and unbatched files.
 const prior=(await db.query('SELECT snapshot FROM borrower_agent_inventory_admissions WHERE application_id=$1 AND user_id=$2',[access.applicationId,access.userId])).rows[0]?.snapshot;
 const snapshot={application:inventory.application,requirements:inventory.requirements,contentRevision:inventory.contentRevision,batches:rows.map(batch=>({id:batch.id,state:batch.state,revision:batch.revision})),documents:inventory.documents.map(({storageKey,...document})=>document)};
 const batched=new Set(rows.flatMap(batch=>(batch.files as {documentId:string}[]).map(file=>file.documentId)));
 const changedExisting=!!prior&&prior.documents.some((old:{documentId:string})=>digest(old)!==digest(snapshot.documents.find(document=>document.documentId===old.documentId)??null));
 const unbatched=snapshot.documents.some(document=>!batched.has(document.documentId)&&(!prior||!prior.documents.some((old:{documentId:string})=>old.documentId===document.documentId)));
 const definitions=(requirements:PreparationInventory['requirements'])=>requirements.map(({evidenceRevision,...requirement})=>requirement);
 const changedDefinitions=!!prior&&digest({application:prior.application,requirements:definitions(prior.requirements)})!==digest({application:snapshot.application,requirements:definitions(snapshot.requirements)});
 const batchChanged=!!prior&&digest(prior.batches??[])!==digest(snapshot.batches);
 const changedEvidence=!!prior&&!batchChanged&&(digest(prior.requirements)!==digest(snapshot.requirements)||prior.contentRevision!==snapshot.contentRevision);
 if(grant.automaticEnabled&&!admitted&&inventory.documents.length&&(changedExisting||unbatched||changedDefinitions||changedEvidence)){
  await db.query(`INSERT INTO borrower_agent_turns(id,application_id,user_id,conversation_id,source_key) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,[randomUUID(),access.applicationId,access.userId,conversationId,`inventory:${digest(inventory)}`]);
 }
 if(grant.automaticEnabled)await db.query(`INSERT INTO borrower_agent_inventory_admissions(application_id,user_id,snapshot) VALUES($1,$2,$3)
 ON CONFLICT(application_id,user_id) DO UPDATE SET snapshot=excluded.snapshot`,[access.applicationId,access.userId,snapshot]);
}
