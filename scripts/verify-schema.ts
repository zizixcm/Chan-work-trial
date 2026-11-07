import './env';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { pool } from '../lib/db';
import { applyRequirementCatalog } from '../lib/requirement-catalog';
import { APPLICATION_ID } from '../lib/model';

// Real PostgreSQL checks in a uniquely named disposable schema. No app data resets.
async function main() {
  const db = await pool().connect();
  const schema = 'verify_' + randomUUID().replaceAll('-', '');
  let checks = 0;
  const query = (sql: string, values: unknown[] = []) => db.query(sql, values);
  async function rejects(sql: string, values: unknown[] = []) {
    await query('SAVEPOINT expected_failure');
    let rejected = false;
    try { await query(sql, values); await query('SET CONSTRAINTS ALL IMMEDIATE'); }
    catch (error) {
      assert.match(String((error as {code?: string}).code), /^(23|P0001)/);
      rejected = true;
    }
    await query('ROLLBACK TO SAVEPOINT expected_failure');
    await query('RELEASE SAVEPOINT expected_failure');
    assert.ok(rejected, 'Database must reject: ' + sql.slice(0, 100));
    checks++;
  }
  try {
    await query(`CREATE SCHEMA ${schema}`);
    await query(`SET search_path TO ${schema}, public`);
    const migrations = (await readdir('migrations/postgres')).filter(f => f.endsWith('.sql')).sort();
    // First verify all migrations on an empty database namespace.
    for (const name of migrations) await query(await readFile('migrations/postgres/' + name, 'utf8'));
    assert.ok((await query("SELECT count(*)::int n FROM information_schema.tables WHERE table_schema=$1",[schema])).rows[0].n >= 30); checks++;
    await query('SET search_path TO public');
    await query(`DROP SCHEMA ${schema} CASCADE`);
    await query(`CREATE SCHEMA ${schema}`);
    await query(`SET search_path TO ${schema}, public`);
    // Upgrade populated legacy tables, then exercise new constraints.
    for (const name of migrations.filter(n => n < '003')) await query(await readFile('migrations/postgres/' + name, 'utf8'));
    await query(`INSERT INTO "user"(id,name,email,"emailVerified") VALUES ('borrower','Borrower','borrower@example.test',true),('lender','Lender','lender@example.test',true)`);
    await query(`INSERT INTO applications VALUES ('app','Borrower LLC','Property','Address','Refinance',1000000,'LOI','2026-11-01T00:00:00Z'),('other','Other','Other','Address','Refinance',100,'OTHER','2026-11-01T00:00:00Z')`);
    await query(`INSERT INTO application_memberships(application_id,user_id,role) VALUES ('app','borrower','borrower'),('app','lender','lender')`);
    await query(`INSERT INTO requirements VALUES ('req','app','Rent roll','Property','Purpose','2026','Borrower','Required',1)`);
    await query(`INSERT INTO documents(id,application_id,original_name,storage_key,content_type,size_bytes,sha256,uploaded_by,created_at) VALUES('old','app','old.csv','old','text/csv',4,$1,'Legacy','2026-11-01T00:00:00Z')`, ['a'.repeat(64)]);
    await query(`INSERT INTO requirement_documents(application_id,requirement_id,document_id) VALUES('app','req','old')`);
    await query(`INSERT INTO requirement_reviews(id,application_id,requirement_id,decision,message,document_ids,reviewer,created_at) VALUES('legacy','app','req','accepted','','["old"]','Legacy','2026-11-01T00:00:00Z')`);
    for (const name of migrations.filter(n => n >= '003')) await query(await readFile('migrations/postgres/' + name, 'utf8'));
    assert.deepEqual((await query(`SELECT id,storage_key,sha256,series_id,version_number FROM documents WHERE id='old'`)).rows[0], {id:'old',storage_key:'old',sha256:'a'.repeat(64),series_id:'old',version_number:1}); checks++;
    assert.equal((await query(`SELECT count(*)::int n FROM review_documents WHERE review_id='legacy'`)).rows[0].n, 1); checks++;
    await query('BEGIN');
    await rejects(`UPDATE documents SET original_name='changed' WHERE id='old'`);
    await rejects(`INSERT INTO requirement_documents(application_id,requirement_id,document_id) VALUES('other','req','old')`);
    await rejects(`INSERT INTO documents(id,application_id,series_id,version_number,replaces_document_id,original_name,storage_key,content_type,size_bytes,sha256,uploaded_by,created_at) VALUES('skip','app','old',3,'old','new.csv','skip','text/csv',4,$1,'B',now())`, ['b'.repeat(64)]);
    await query(`INSERT INTO documents(id,application_id,series_id,version_number,replaces_document_id,original_name,storage_key,content_type,size_bytes,sha256,uploaded_by,created_at,uploaded_by_user_id) VALUES('new','app','old',2,'old','new.csv','new','text/csv',4,$1,'B',now(),'borrower')`, ['b'.repeat(64)]);
    await rejects(`INSERT INTO documents(id,application_id,series_id,version_number,replaces_document_id,original_name,storage_key,content_type,size_bytes,sha256,uploaded_by,created_at) VALUES('fork','app','old',2,'old','fork.csv','fork','text/csv',4,$1,'B',now())`, ['c'.repeat(64)]);
    await rejects(`INSERT INTO review_documents(application_id,review_id,document_id) VALUES('app','legacy','new')`);
    await query(`UPDATE requirement_documents SET unlinked_at=now() WHERE document_id='old'`);
    await query(`INSERT INTO requirement_documents(application_id,requirement_id,document_id) VALUES('app','req','new')`);
    await rejects(`INSERT INTO requirement_reviews(id,application_id,requirement_id,decision,message,document_ids,reviewer,created_at,reviewer_user_id,evidence_revision,definition_revision) VALUES('stale','app','req','accepted','','["new"]','L',now(),'lender',0,0)`);
    await query(`INSERT INTO requirements(id,application_id,title,category,purpose,period,owner,applicability,sort_order,response_mode) VALUES('text','app','Explain DSCR','Property','Explain decline','2025','Borrower','Required',2,'explanation')`);
    await query(`INSERT INTO explanation_series(id,application_id,requirement_id,kind,author_user_id) VALUES('es','app','text','explanation','borrower')`);
    await query(`INSERT INTO explanations(id,application_id,explanation_series_id,revision_number,body,author_user_id,author_label,author_role) VALUES('e1','app','es',1,'Temporary vacancy','borrower','B','borrower')`);
    await rejects(`INSERT INTO explanations(id,application_id,explanation_series_id,revision_number,supersedes_id,body,author_user_id,author_label,author_role) VALUES('bad-author','app','es',2,'e1','Overwritten','lender','L','lender')`);
    await query(`INSERT INTO requirement_reviews(id,application_id,requirement_id,decision,message,document_ids,explanation_ids,reviewer,created_at,reviewer_user_id) VALUES('text-review','app','text','accepted','','[]','["e1"]','L',now(),'lender')`);
    await query('SET CONSTRAINTS ALL IMMEDIATE'); checks++;
    await query('SET CONSTRAINTS ALL DEFERRED');
    const app = (await query(`SELECT revision,content_revision FROM applications WHERE id='app'`)).rows[0];
    const manifest = JSON.stringify((await query("SELECT build_submission_manifest('app') AS manifest")).rows[0].manifest);
    const hash = createHash('sha256').update(manifest).digest('hex');
    await query(`INSERT INTO submissions(id,application_id,revision_number,source_application_revision,source_content_revision,submitted_by_user_id,submitted_by_label,manifest,canonical_manifest,manifest_sha256,idempotency_key,acknowledgment) VALUES('s1','app',1,$1,$2,'borrower','B',$3::jsonb,$4,$5,'submit-key','[]')`, [app.revision,app.content_revision,manifest,manifest,hash]);
    await query('COMMIT'); checks++;
    await query('BEGIN');
    await query(`UPDATE requirements SET period='2027' WHERE id='req'`);
    const currentReq = (await query("SELECT evidence_revision FROM requirements WHERE id='req'")).rows[0];
    await rejects(`INSERT INTO requirement_reviews(id,application_id,requirement_id,decision,message,document_ids,reviewer,created_at,reviewer_user_id,evidence_revision,definition_revision) VALUES('stale-definition','app','req','accepted','','["new"]','L',now(),'lender',$1,0)`,[currentReq.evidence_revision]);
    const frozenReq = JSON.parse(manifest).requirements.find((r: {id:string})=>r.id==='req');
    await query(`INSERT INTO requirement_reviews(id,application_id,requirement_id,decision,message,document_ids,reviewer,created_at,reviewer_user_id,evidence_revision,definition_revision,submission_id,review_scope) VALUES('historical','app','req','accepted','','["new"]','L',now(),'lender',$1,$2,'s1','submission')`,[frozenReq.evidence_revision,frozenReq.definition_revision]);
    await query('SET CONSTRAINTS ALL IMMEDIATE'); checks++;
    await query('SET CONSTRAINTS ALL DEFERRED');
    await rejects(`INSERT INTO submission_documents(application_id,submission_id,document_id) VALUES('app','s1','old')`);
    await rejects(`DELETE FROM submission_documents WHERE submission_id='s1'`);
    await rejects(`UPDATE submissions SET submitted_by_label='other' WHERE id='s1'`);
    await query(`INSERT INTO mutation_receipts(application_id,actor_user_id,operation,idempotency_key,request_hash,result) VALUES('app','borrower','submit','key',$1,'{"id":"s1"}')`, ['d'.repeat(64)]);
    await rejects(`INSERT INTO mutation_receipts(application_id,actor_user_id,operation,idempotency_key,request_hash,result) VALUES('app','borrower','submit','key',$1,'{}')`, ['e'.repeat(64)]);
    await query(`INSERT INTO fact_series(id,application_id,subject_id,fact_key,unit,scope_key,author_user_id) VALUES('fs','app','app:property','rent','USD','2026','borrower')`);
    await query(`INSERT INTO facts(id,application_id,fact_series_id,revision_number,value,provenance,confirmation,author_user_id,author_label,author_role,confirmed_by_user_id,confirmed_at) VALUES('f1','app','fs',1,'"100"','borrower_manual','confirmed','borrower','B','borrower','borrower',now())`);
    assert.equal((await query(`SELECT count(*)::int n FROM current_confirmed_facts WHERE id='f1'`)).rows[0].n,1); checks++;
    await query(`INSERT INTO facts(id,application_id,fact_series_id,revision_number,supersedes_id,value,provenance,confirmation,author_user_id,author_label,author_role) VALUES('f2','app','fs',2,'f1','"120"','borrower_manual','asserted','borrower','B','borrower')`);
    assert.equal((await query(`SELECT count(*)::int n FROM current_confirmed_facts WHERE fact_series_id='fs'`)).rows[0].n,0); checks++;
    await rejects(`INSERT INTO facts(id,application_id,fact_series_id,revision_number,supersedes_id,value,provenance,confirmation,author_user_id,author_label,author_role) VALUES('f3','app','fs',3,'f1','"130"','borrower_manual','asserted','borrower','B','borrower')`);
    await query(`INSERT INTO requirements(id,application_id,title,category,purpose,period,owner,applicability,sort_order,source,condition_key,occurrence_number) VALUES('conditional1','app','Liquidity','Guarantor','Evidence','2026','Borrower','Conditional',3,'rule','liquidity:guarantor',1)`);
    await rejects(`INSERT INTO requirements(id,application_id,title,category,purpose,period,owner,applicability,sort_order,source,condition_key,occurrence_number) VALUES('conditional2','app','Liquidity','Guarantor','Evidence','2026','Borrower','Conditional',3,'rule','liquidity:guarantor',2)`);
    await query(`UPDATE requirements SET lifecycle='superseded',superseded_at=now() WHERE id='conditional1'`);
    await query(`INSERT INTO requirements(id,application_id,title,category,purpose,period,owner,applicability,sort_order,source,condition_key,occurrence_number,supersedes_requirement_id) VALUES('conditional2','app','Liquidity','Guarantor','Evidence','2026','Borrower','Conditional',3,'rule','liquidity:guarantor',2,'conditional1')`);
    // Criteria changes invalidate acceptance and are frozen into submission manifests.
    const priorDefinition = (await query("SELECT definition_revision FROM requirements WHERE id='req'")).rows[0].definition_revision;
    await query("UPDATE requirements SET criteria=ARRAY['Correct taxpayer','Complete schedules'] WHERE id='req'");
    assert.equal(BigInt((await query("SELECT definition_revision FROM requirements WHERE id='req'")).rows[0].definition_revision), BigInt(priorDefinition)+1n); checks++;
    const criteriaManifest = (await query("SELECT build_submission_manifest('app') AS manifest")).rows[0].manifest;
    assert.deepEqual(criteriaManifest.requirements.find((r: {id:string}) => r.id==='req').criteria,['Correct taxpayer','Complete schedules']); checks++;
    assert.deepEqual(JSON.parse((await query("SELECT manifest::text m FROM submissions WHERE id='s1'")).rows[0].m), JSON.parse(manifest)); checks++;
    await query('COMMIT');
    // Catalog upgrade is idempotent and preserves linked evidence and legacy review history.
    await query('BEGIN');
    await query("INSERT INTO applications(id,borrower_name,property_name,address,transaction_type,requested_amount,loi_reference,created_at) VALUES($1,'Demo','Demo','Address','Refinance',100,'Demo',now())", [APPLICATION_ID]);
    await query(`INSERT INTO requirements(id,application_id,title,category,purpose,period,owner,applicability,sort_order)
      VALUES('33000000-0000-4000-8000-000000000010',$1,'Application','Application & LOI','Purpose','Current','Borrower','Required',0)`, [APPLICATION_ID]);
    await applyRequirementCatalog(db);
    assert.equal((await query("SELECT lifecycle FROM requirements WHERE id='33000000-0000-4000-8000-000000000010'")).rows[0].lifecycle, 'superseded'); checks++;
    const firstCatalog = (await query('SELECT id,definition_revision FROM requirements WHERE application_id=$1 AND lifecycle=\'active\' ORDER BY id',[APPLICATION_ID])).rows;
    assert.equal(firstCatalog.length,7); checks++;
    await applyRequirementCatalog(db);
    assert.deepEqual((await query('SELECT id,definition_revision FROM requirements WHERE application_id=$1 AND lifecycle=\'active\' ORDER BY id',[APPLICATION_ID])).rows, firstCatalog); checks++;
    assert.equal((await query("SELECT count(*)::int n FROM review_documents WHERE review_id='legacy'")).rows[0].n,1); checks++;
    await query('COMMIT'); checks++;
    console.log(`Schema verification passed: ${checks} preservation, integrity and workflow checks in an isolated PostgreSQL schema.`);
  } finally {
    await query('ROLLBACK');
    await query('SET search_path TO public');
    await query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    db.release();
    await pool().end();
  }
}
main().catch(error => { console.error('Schema verification failed:', error instanceof Error ? error.message : 'unknown error'); process.exitCode=1; });
