import './env';
import { applyRequirementCatalog } from '../lib/requirement-catalog';
import { readFile } from 'node:fs/promises';
import { pool } from '../lib/db';
import { createAuth } from '../lib/auth';
import { SQLiteRepository, dataDirectory } from '../lib/local';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { APPLICATION_ID } from '../lib/model';
async function main() {
  const accounts=JSON.parse(await readFile('.data/local-accounts.json','utf8')) as {email:string;name:string;password:string;role:string}[];
  const auth=createAuth(true);
  const identities=[];
  for(const account of accounts) {
    let user=(await pool().query('SELECT id FROM "user" WHERE email=$1',[account.email])).rows[0];
    if(!user) user=(await auth.api.signUpEmail({body:{email:account.email,name:account.name,password:account.password}})).user;
    identities.push({id:user.id,role:account.role});
  }
  const db=await pool().connect();
  try {
    await db.query('BEGIN');
    await db.query('SELECT pg_advisory_xact_lock(7463822)');
    const exists=(await db.query('SELECT 1 FROM applications WHERE id=$1',[APPLICATION_ID])).rows.length;
    if(!exists) {
      // Legacy adapter is used only here, never by request handling. Keep its DB/files intact.
      const legacy=new SQLiteRepository(dataDirectory());
      const snapshot=await legacy.lenderSnapshot();
      const a=snapshot.application;
      await db.query('INSERT INTO applications(id,borrower_name,property_name,address,transaction_type,requested_amount,loi_reference,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[a.id,a.borrower_name,a.property_name,a.address,a.transaction_type,a.requested_amount,a.loi_reference,a.created_at]);
      for(const r of snapshot.requirements) await db.query('INSERT INTO requirements(id,application_id,title,category,purpose,period,owner,applicability,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[r.id,r.application_id,r.title,r.category,r.purpose,r.period,r.owner,r.applicability,r.sort_order]);
      for(const publicDoc of snapshot.documents) {
        const d=(await legacy.document(publicDoc.id))!;
        await db.query('INSERT INTO documents(id,application_id,original_name,storage_key,content_type,size_bytes,sha256,uploaded_by,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[d.id,d.application_id,d.original_name,d.storage_key,d.content_type,d.size_bytes,d.sha256,d.uploaded_by,d.created_at]);
        for(const r of publicDoc.requirement_ids) await db.query('INSERT INTO requirement_documents(application_id,requirement_id,document_id) VALUES($1,$2,$3)',[a.id,r,d.id]);
      }
      for(const r of [...snapshot.reviews].reverse()) await db.query('INSERT INTO requirement_reviews(id,application_id,requirement_id,decision,message,document_ids,reviewer,created_at,legacy_import,evidence_revision,definition_revision) VALUES($1,$2,$3,$4,$5,$6,$7,$8,true,0,0)',[r.id,r.application_id,r.requirement_id,r.decision,r.message,JSON.stringify(r.document_ids),r.reviewer,r.created_at]);
      if(snapshot.note) await db.query('INSERT INTO lender_notes(application_id,body,updated_at) VALUES($1,$2,$3)',[a.id,snapshot.note.body,snapshot.note.updated_at]);
      legacy.close();
      const source=new DatabaseSync(path.join(dataDirectory(),'portal.sqlite'),{readOnly:true});
      const events=source.prepare('SELECT * FROM audit_events').all() as {id:string;application_id:string;actor:string;action:string;target_id:string;created_at:string}[];
      for(const e of events) await db.query('INSERT INTO audit_events(id,application_id,actor,action,target_id,created_at) VALUES($1,$2,$3,$4,$5,$6)',[e.id,e.application_id,e.actor,e.action,e.target_id,e.created_at]);
      source.close();
      console.log('Imported existing application, file metadata and reviews; original SQLite/files retained.');
    }
    await applyRequirementCatalog(db);
    for(const identity of identities) await db.query('INSERT INTO application_memberships(application_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[APPLICATION_ID,identity.id,identity.role]);
    await db.query('COMMIT');
    console.log('Borrower/lender accounts ready. Credentials are in .data/local-accounts.json (not printed). Existing accounts and application state preserved.');
  } catch(e) {await db.query('ROLLBACK');throw e;}
  finally {db.release();await pool().end();}
}
main().catch(()=>{console.error('Seed failed. Check migrations and local account configuration; no secrets were logged.');process.exitCode=1;});
