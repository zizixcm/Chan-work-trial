import '../scripts/env';
import { Pool } from 'pg';
import { betterAuth } from 'better-auth';
import { createHash, randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm, unlink, readdir, readFile } from "node:fs/promises";
import { once } from "node:events";
import { createServer } from "node:net";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { csv, xlsx } from "./fixtures";

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), "portal-http-"));
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const address = probe.address();
  if (!address || typeof address === "string") throw new Error("No port");
  const port = address.port;
  await new Promise<void>((r) => probe.close(() => r()));
  const base = `http://127.0.0.1:${port}`;
  const schema = 'http_' + randomUUID().replaceAll('-', '');
  const admin = new Pool({connectionString: process.env.DATABASE_URL});
  const databaseUrl = new URL(process.env.DATABASE_URL!);
  databaseUrl.searchParams.set('options', '-c search_path=' + schema + ',public');
  const database = new Pool({connectionString: databaseUrl.toString()});
  let borrowerCookie = '', lenderCookie = '';
  const password = randomUUID() + 'Aa1!';
  async function request(input: string, options: RequestInit = {}) {
    const cookie = input.includes('/api/lender') || input.includes('/lender') ? lenderCookie : borrowerCookie;
    return globalThis.fetch(input, {...options, headers: {cookie, ...Object.fromEntries(new Headers(options.headers))}});
  }
  async function signIn(email: string) {
    const response = await globalThis.fetch(base + '/api/auth/sign-in/email', {method:'POST',headers:{'Content-Type':'application/json',origin:base},body:JSON.stringify({email,password})});
    assert.equal(response.status,200,'Fixture sign-in failed');
    return response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
  }
  let server: ChildProcess | undefined;
  let output = "";
  async function start() {
    server = spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(port),
      ],
      {
        cwd: process.env.PORTAL_TEST_BUILD_DIR || process.cwd(),
        env: {
          ...process.env,
          PORTAL_DATA_DIR: root,
          LOCAL_DEMO_MODE: "0",
          DATABASE_URL: databaseUrl.toString(),
          BETTER_AUTH_URL: base,
          NEXT_TELEMETRY_DISABLED: "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    server.stdout?.on("data", (d) => (output += String(d)));
    server.stderr?.on("data", (d) => (output += String(d)));
    for (let i = 0; i < 100; i++) {
      try {
        if ([200,401].includes((await request(base + "/api/application")).status)) return;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("Server not ready: " + output);
  }
  async function stop() {
    if (server && server.exitCode === null) {
      const exited = once(server, "exit");
      server.kill("SIGTERM");
      await exited;
    }
  }
  async function snapshot() {
    const res = await request(base + "/api/application");
    assert.equal(res.status, 200);
    return res.json();
  }
  async function upload(
    name: string,
    bytes: Uint8Array,
    requirementId: string,
    headers?: Record<string, string>,
  ) {
    const form = new FormData();
    form.set("file", new Blob([Buffer.from(bytes)]), name);
    form.set("requirementId", requirementId);
    return request(base + "/api/documents", {
      method: "POST",
      body: form,
      headers: { origin: base, ...headers },
    });
  }
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    for (const file of (await readdir('migrations/postgres')).filter(f=>f.endsWith('.sql')).sort()) {
      await database.query(await readFile('migrations/postgres/'+file,'utf8'));
    }
    const auth = betterAuth({database,secret:process.env.BETTER_AUTH_SECRET!,baseURL:base,emailAndPassword:{enabled:true}});
    const borrower = (await auth.api.signUpEmail({body:{email:'borrower@example.test',password,name:'Borrower'}})).user;
    const lender = (await auth.api.signUpEmail({body:{email:'lender@example.test',password,name:'Lender'}})).user;
    await database.query("INSERT INTO applications(id,borrower_name,property_name,address,transaction_type,requested_amount,loi_reference,created_at) VALUES('test-app','Borrower','Property','Address','Refinance',1000,'LOI',now())");
    await database.query("INSERT INTO application_memberships(application_id,user_id,role) VALUES('test-app',$1,'borrower'),('test-app',$2,'lender')",[borrower.id,lender.id]);
    await database.query("INSERT INTO requirements(id,application_id,title,category,purpose,period,owner,applicability,sort_order) VALUES('test-req','test-app','Rent roll','Property','Verify income','2026','Borrower','Required',1)");
    await database.query("INSERT INTO requirements(id,application_id,title,category,purpose,period,owner,applicability,sort_order) VALUES('test-req2','test-app','Shared evidence','Property','Verify income','2026','Borrower','Required',2)");
    await database.query("INSERT INTO applications(id,borrower_name,property_name,address,transaction_type,requested_amount,loi_reference,created_at) VALUES('other-app','Other','Other','Address','Refinance',1000,'LOI',now())");
    await database.query("INSERT INTO requirements(id,application_id,title,category,purpose,period,owner,applicability,sort_order) VALUES('other-req','other-app','Other','Property','Purpose','2026','Other','Required',1)");
    await start();
    assert.equal((await globalThis.fetch(base+'/api/application')).status,401);
    borrowerCookie = await signIn('borrower@example.test');
    lenderCookie = await signIn('lender@example.test');
    assert.equal((await globalThis.fetch(base+'/api/lender',{headers:{cookie:borrowerCookie}})).status,403);
    assert.equal((await request(base)).status, 200);
    const initial = await snapshot();
    assert.equal(initial.documents.length, 0);
    const requirement = initial.requirements[0].id;
    const pdf = await PDFDocument.create();
    pdf.addPage();
    const photo = sharp({
      create: { width: 16, height: 16, channels: 3, background: "#f4f1e8" },
    });
    const fixtures = [
      ["demo-rent-roll.csv", csv],
      ["demo-operating.xlsx", xlsx()],
      ["demo-lease.pdf", await pdf.save()],
      ["demo-photo.jpg", new Uint8Array(await photo.clone().jpeg().toBuffer())],
      ["demo-scan.png", new Uint8Array(await photo.clone().png().toBuffer())],
      [
        "demo-photo.webp",
        new Uint8Array(await photo.clone().webp().toBuffer()),
      ],
    ] as const;
    const ids: string[] = [];
    for (const [name, bytes] of fixtures) {
      const res = await upload(name, bytes, requirement);
      assert.equal(res.status, 201, await res.clone().text());
      const { id } = await res.json();
      ids.push(id);
      const download = await request(base + "/api/documents/" + id);
      assert.equal(download.status, 200);
      assert.match(
        download.headers.get("content-disposition") || "",
        /attachment/,
      );
      assert.deepEqual(new Uint8Array(await download.arrayBuffer()), bytes);
    }
    assert.equal((await upload("same.csv", csv, requirement)).status, 409);
    assert.equal((await upload("bad.exe", csv, requirement)).status, 400);
    assert.equal((await upload("damaged.pdf", csv, requirement)).status, 400);
    assert.equal(
      (await upload("empty.csv", new Uint8Array(), requirement)).status,
      400,
    );
    assert.equal((await upload("demo.csv", csv, "missing")).status, 400);
    assert.equal(
      (
        await upload("demo.csv", csv, requirement, {
          origin: "https://unrelated.example",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await upload(
          "huge.csv",
          new Uint8Array(25 * 1024 * 1024 + 1),
          requirement,
        )
      ).status,
      413,
    );
    assert.equal((await request(base + "/api/documents/missing")).status, 404);
    assert.equal((await request(base + "/lender")).status, 200);
    assert.equal((await request(base + "/lender/review")).status, 200);
    const lenderRequest=(route:string,options:RequestInit={})=>globalThis.fetch(base+route,{...options,headers:{cookie:lenderCookie,...Object.fromEntries(new Headers(options.headers))}});
    const beforeSend=await (await lenderRequest('/api/lender')).json();
    assert.deepEqual(beforeSend.documents,[]);assert.equal(beforeSend.submission,null);
    assert.deepEqual((await (await lenderRequest('/api/application')).json()).documents,[],'generic snapshot cannot bypass publication');
    assert.equal((await lenderRequest('/api/documents/'+ids[0])).status,404,'draft direct download denied');
    assert.deepEqual((await (await lenderRequest('/api/ai/status')).json()).links,[],'draft links hidden from AI status');
    assert.equal((await lenderRequest('/api/requirements/'+requirement+'/verify-completeness',{method:'POST',headers:{origin:base,'Content-Type':'application/json'},body:JSON.stringify({idempotencyKey:randomUUID()})})).status,409,'AI cannot inspect unsent draft');
    const send=async(body?:unknown,cookie=borrowerCookie)=>{const s=await snapshot();return request(base+'/api/applications/test-app/submit',{method:'POST',headers:{origin:base,'Content-Type':'application/json',cookie},body:JSON.stringify(body||{idempotencyKey:randomUUID(),expectedRevision:s.draft.revision,expectedContentRevision:s.draft.contentRevision})});};
    assert.equal((await send(undefined,lenderCookie)).status,403,'lender cannot publish borrower draft');
    const firstPreview=await snapshot(),sendBody={idempotencyKey:randomUUID(),expectedRevision:firstPreview.draft.revision,expectedContentRevision:firstPreview.draft.contentRevision};
    const firstSend=await send(sendBody);assert.equal(firstSend.status,200,await firstSend.clone().text());
    let sent=(await firstSend.json()).submission;
    assert.equal((await (await send(sendBody)).json()).submission.id,sent.id,'same send key is idempotent');
    assert.equal((await send({...sendBody,expectedRevision:'999999'})).status,409,'send key cannot change package');
    assert.equal((await lenderRequest('/api/documents/'+ids[0])).status,200,'sent document downloadable');
    assert.equal((await snapshot()).draft.hasUnsentChanges,false);
    const postReview = (body: Record<string,unknown>) =>
      request(base + "/api/lender", {
        method: "POST",
        headers: { "Content-Type": "application/json", origin: base },
        body: JSON.stringify({expectedSubmissionId:sent.id,...body}),
      });
    const accepted = await postReview({
      requirementId: requirement,
      decision: "accepted",
      message: "Demo assessment",
      documentIds: ids,
      expectedReviewId: null,
    });
    assert.equal(accepted.status, 200, await accepted.clone().text());
    assert.equal((await snapshot()).reviews[0].decision, "accepted");
    assert.equal(
      (
        await postReview({
          requirementId: requirement,
          decision: "accepted",
          message: "stale",
          documentIds: ids,
          expectedReviewId: null,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await postReview({
          action: "note",
          body: "Private demo note",
          expectedUpdatedAt: null,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await request(base + "/api/lender", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            origin: "https://foreign.example",
          },
          body: "{}",
        })
      ).status,
      403,
    );
    assert.equal((await postReview({ decision: "invalid" })).status, 400);
    // Borrower mapping changes preserve shared evidence, receipts and exact bytes.
    const linkUrl = (doc: string, req: string, revision: string) => base + '/api/documents/' + doc + '/requirements/' + req + '?expectedEvidenceRevision=' + revision;
    const revisionOf = (s: {requirements: {id:string;evidence_revision:string}[]}, req: string) => s.requirements.find(r=>r.id===req)!.evidence_revision;
    const current = await snapshot();
    const sharedLink = await request(linkUrl(ids[0],'test-req2',revisionOf(current,'test-req2')), {method:'PUT',headers:{origin:base}});
    assert.equal(sharedLink.status,200,await sharedLink.clone().text());
    const shared = await sharedLink.json();
    assert.equal(shared.changed,true);
    assert.equal((await postReview({requirementId:'test-req2',decision:'accepted',message:'Unsent evidence',documentIds:[ids[0]],expectedReviewId:null})).status,409,'unsent new link cannot be reviewed');
    const previousSubmission=sent.id;
    const resent=await send();assert.equal(resent.status,200,await resent.clone().text());sent=(await resent.json()).submission;
    assert.equal((await postReview({requirementId:'test-req2',decision:'accepted',message:'Stale package',documentIds:[ids[0]],expectedReviewId:null,expectedSubmissionId:previousSubmission})).status,409);
    assert.equal((await postReview({requirementId:'test-req2',decision:'accepted',message:'Shared evidence',documentIds:[ids[0]],expectedReviewId:null})).status,200);
    const submittedView=await (await lenderRequest('/api/lender')).json();
    assert.equal((await postReview({requirementId:requirement,decision:'accepted',message:'Submitted package',documentIds:ids,expectedReviewId:submittedView.reviews.find((v:{requirement_id:string})=>v.requirement_id===requirement)?.id||null})).status,200);
    const receiptId=sent.id;
    const originalReceipt=(await database.query('SELECT manifest FROM submissions WHERE id=$1',[receiptId])).rows[0].manifest;
    const removalRevision = revisionOf(await snapshot(),requirement);
    const removeUrl = linkUrl(ids[0],requirement,removalRevision);
    assert.equal((await globalThis.fetch(removeUrl,{method:'DELETE',headers:{origin:base}})).status,401);
    assert.equal((await request(removeUrl,{method:'DELETE',headers:{origin:base,cookie:lenderCookie}})).status,403);
    assert.equal((await request(removeUrl,{method:'DELETE',headers:{origin:'https://foreign.example'}})).status,403);
    assert.equal((await request(linkUrl(ids[0],'other-req','0'),{method:'DELETE',headers:{origin:base}})).status,404);
    assert.equal((await request(linkUrl('not-visible',requirement,'0'),{method:'DELETE',headers:{origin:base}})).status,404);
    assert.equal((await request(linkUrl(ids[0],requirement,'0'),{method:'DELETE',headers:{origin:base}})).status,409);
    const removed = await request(removeUrl,{method:'DELETE',headers:{origin:base}});
    assert.equal(removed.status,200,await removed.clone().text());
    const result = await removed.json();
    assert.equal(result.changed,true);
    const frozen=await (await lenderRequest('/api/lender')).json();
    assert(frozen.documents.find((d:{id:string})=>d.id===ids[0]).requirement_ids.includes(requirement),'unsent unlink does not change lender package');
    assert.equal(frozen.reviews.find((v:{requirement_id:string})=>v.requirement_id===requirement).is_current,true,'unsent unlink cannot invalidate submitted lender review');
    const remaining = result.snapshot.documents.find((d:{id:string})=>d.id===ids[0]);
    assert.deepEqual(remaining.requirement_ids,['test-req2']);
    assert.equal(result.snapshot.reviews.find((r:{requirement_id:string})=>r.requirement_id===requirement).is_current,false);
    assert.equal(result.snapshot.reviews.find((r:{requirement_id:string})=>r.requirement_id==='test-req2').is_current,true);
    const retry = await (await request(removeUrl,{method:'DELETE',headers:{origin:base}})).json();
    assert.equal(retry.changed,false);
    assert.equal(revisionOf(retry.snapshot,requirement),revisionOf(result.snapshot,requirement));
    assert.deepEqual((await database.query('SELECT manifest FROM submissions WHERE id=$1',[receiptId])).rows[0].manifest,originalReceipt);
    assert.equal((await database.query("SELECT count(*)::int n FROM submission_documents WHERE submission_id=$2 AND document_id=$1",[ids[0],receiptId])).rows[0].n,1);
    assert.deepEqual(new Uint8Array(await (await request(base+'/api/documents/'+ids[0])).arrayBuffer()),csv);
    const relink = await request(linkUrl(ids[0],requirement,revisionOf(result.snapshot,requirement)),{method:'PUT',headers:{origin:base}});
    assert.equal(relink.status,200,await relink.clone().text());
    const relinked = await relink.json();
    assert.equal(relinked.snapshot.reviews.find((r:{requirement_id:string})=>r.requirement_id===requirement).is_current,false,'Relinking identical IDs must not resurrect an old acceptance');
    assert.equal((await request(removeUrl,{method:'DELETE',headers:{origin:base}})).status,409,'A stale remove cannot undo a newer relink');
    // Borrower landing list and explicit application selection.
    const listUrl=base+'/api/borrower/applications';
    assert.equal((await request(base+'/')).status,200,'borrower landing renders');
    assert.equal((await request(base+'/borrower/test-app')).status,200,'authorized selected workspace renders');
    assert.equal((await request(base+'/borrower/other-app')).status,404,'unauthorized workspace denied');
    assert.equal((await request(base+'/borrower/missing')).status,404,'unknown workspace denied');
    assert.equal((await globalThis.fetch(base+'/borrower/test-app',{headers:{cookie:lenderCookie}})).status,404,'lender membership does not authorize borrower workspace');
    assert.equal((await globalThis.fetch(listUrl)).status,401);
    const listed=await request(listUrl);
    assert.match(listed.headers.get('cache-control')||'',/no-store/);
    assert.deepEqual((await listed.json()).applications.map((a:{id:string})=>a.id),['test-app'],'submitted application remains listed');
    assert.deepEqual((await (await globalThis.fetch(listUrl,{headers:{cookie:lenderCookie}})).json()).applications,[],'lender memberships excluded');
    assert.equal((await request(base+'/api/application?applicationId=other-app')).status,404);
    assert.equal((await request(base+'/api/application?applicationId=missing')).status,404);
    await database.query("INSERT INTO application_memberships(application_id,user_id,role) VALUES('other-app',$1,'borrower')",[borrower.id]);
    assert.deepEqual(new Set((await (await request(listUrl)).json()).applications.map((a:{id:string})=>a.id)),new Set(['test-app','other-app']));
    assert.equal((await request(base+'/api/application')).status,400,'multiple applications require selection');
    const selected=await (await request(base+'/api/application?applicationId=other-app')).json();
    assert.equal(selected.application.id,'other-app');
    assert.equal((await request(base+'/borrower/other-app')).status,200,'second authorized workspace renders');
    assert.equal(selected.documents.length,0);
    assert.equal((await request(base+'/api/documents/'+ids[0]+'?applicationId=other-app')).status,404,'document cannot cross selected workspace');
    assert.equal((await request(base+'/api/documents/'+ids[0]+'?applicationId=test-app')).status,200);
    await database.query("UPDATE application_memberships SET active=false WHERE application_id='other-app' AND user_id=$1",[borrower.id]);
    assert.equal((await request(base+'/api/application?applicationId=other-app')).status,404,'revoked selection does not fall back');
    assert.equal((await request(base+'/borrower/other-app')).status,404,'revoked workspace route denied');
    await database.query("UPDATE application_memberships SET active=true,role='lender' WHERE application_id='other-app' AND user_id=$1",[borrower.id]);
    assert.deepEqual((await (await request(listUrl)).json()).applications.map((a:{id:string})=>a.id),['test-app'],'mixed-role user sees only borrower applications');
    await database.query("UPDATE application_memberships SET active=false WHERE application_id='other-app' AND user_id=$1",[borrower.id]);
    assert.deepEqual((await (await request(listUrl)).json()).applications.map((a:{id:string})=>a.id),['test-app']);
    await database.query("UPDATE application_memberships SET active=false WHERE application_id='test-app' AND user_id=$1",[borrower.id]);
    assert.deepEqual((await (await request(listUrl)).json()).applications,[],'empty membership list is valid');
    await database.query("UPDATE application_memberships SET active=true WHERE application_id='test-app' AND user_id=$1",[borrower.id]);
    const before = await snapshot();
    assert.equal(before.documents.length, fixtures.length);
    await stop();
    await start();
    const after = await snapshot();
    const lenderAfter = await (await request(base + "/api/lender")).json();
    assert.equal(lenderAfter.note.body, "Private demo note");
    assert.ok(!("note" in after));
    assert.deepEqual(after, before);
    assert.deepEqual(
      new Uint8Array(
        await (await request(base + "/api/documents/" + ids[0])).arrayBuffer(),
      ),
      csv,
    );
    const previewBeforeUpload=await snapshot();
    const manyForm=new FormData();manyForm.set('file',new File(['Property,Tenant\nPrivate Draft,New Tenant\n'],'private-new.csv',{type:'text/csv'}));manyForm.append('requirementIds',requirement);manyForm.append('requirementIds','test-req2');
    const extra=await request(base+'/api/documents?applicationId=test-app',{method:'POST',headers:{origin:base},body:manyForm});
    assert.equal(extra.status,201,await extra.clone().text());const privateId=(await extra.json()).id;
    assert.deepEqual(new Set((await snapshot()).documents.find((d:{id:string})=>d.id===privateId).requirement_ids),new Set([requirement,'test-req2']),'multipart upload supports multiple explicit mappings');
    assert.equal((await lenderRequest('/api/documents/'+privateId)).status,404,'new upload remains private after earlier send');
    assert(!(await (await lenderRequest('/api/lender')).json()).documents.some((d:{id:string})=>d.id===privateId));
    assert.equal((await send({idempotencyKey:randomUUID(),expectedRevision:previewBeforeUpload.draft.revision,expectedContentRevision:previewBeforeUpload.draft.contentRevision})).status,409,'stale preview cannot send concurrent upload');
    const publishedExtra=await send();assert.equal(publishedExtra.status,200,await publishedExtra.clone().text());
    assert.equal((await lenderRequest('/api/documents/'+privateId)).status,200,'resend publishes new upload');
    const removalPreview=await snapshot();
    const removeFile=base+'/api/documents/'+privateId+'?applicationId=test-app&expectedContentRevision='+removalPreview.draft.contentRevision;
    assert.equal((await lenderRequest('/api/documents/'+privateId+'?applicationId=test-app&expectedContentRevision='+removalPreview.draft.contentRevision,{method:'DELETE',headers:{origin:base}})).status,403);
    assert.equal((await request(base+'/api/documents/'+privateId+'?applicationId=other-app&expectedContentRevision=0',{method:'DELETE',headers:{origin:base}})).status,404);
    assert.equal((await request(base+'/api/documents/'+privateId+'?applicationId=test-app&expectedContentRevision=999999',{method:'DELETE',headers:{origin:base}})).status,409);
    const removedFile=await request(removeFile,{method:'DELETE',headers:{origin:base}});assert.equal(removedFile.status,200,await removedFile.clone().text());
    const removedBody=await removedFile.json();assert.equal(removedBody.changed,true);assert(!removedBody.snapshot.documents.some((d:{id:string})=>d.id===privateId));
    assert.equal((await (await request(removeFile,{method:'DELETE',headers:{origin:base}})).json()).changed,false,'removal replay is harmless');
    assert.equal((await request(base+'/api/documents/'+privateId)).status,404,'removed draft download hidden');
    assert.equal((await lenderRequest('/api/documents/'+privateId)).status,200,'old submitted download remains accessible until resend');
    assert.equal((await database.query('SELECT count(*)::int n FROM requirement_documents WHERE document_id=$1 AND unlinked_at IS NULL',[privateId])).rows[0].n,0);
    assert.equal((await database.query("SELECT count(*)::int n FROM analysis_jobs WHERE document_id=$1 AND consent_scope='borrower' AND state IN ('queued','running','retry_wait','blocked')",[privateId])).rows[0].n,0,'removed-file pending jobs fenced');
    assert((await readFile(path.join(root,'files',privateId))).length>0,'immutable bytes retained');
    assert.equal((await request(linkUrl(privateId,requirement,revisionOf(removedBody.snapshot,requirement)),{method:'PUT',headers:{origin:base}})).status,404,'removed file cannot be relinked');
    assert.equal((await send({idempotencyKey:randomUUID(),expectedRevision:removalPreview.draft.revision,expectedContentRevision:removalPreview.draft.contentRevision})).status,409,'old send preview cannot republish removed file');
    const afterRemovalSend=await send();assert.equal(afterRemovalSend.status,200,await afterRemovalSend.clone().text());
    assert.equal((await lenderRequest('/api/documents/'+privateId)).status,404,'resend removes file from current lender package');
    assert.equal((await database.query('SELECT count(*)::int n FROM submission_documents WHERE document_id=$1',[privateId])).rows[0].n,1,'prior submission keeps file history');
    const restoreBytes='Property,Tenant\nPrivate Draft,New Tenant\n',restoreBatch=randomUUID(),restoreMember=randomUUID();
    const restoreManifest=await request(base+'/api/upload-batches?applicationId=test-app',{method:'POST',headers:{origin:base,'Content-Type':'application/json'},body:JSON.stringify({id:restoreBatch,members:[{id:restoreMember,name:'private-new.csv',sha256:createHash('sha256').update(restoreBytes).digest('hex')}]})});assert.equal(restoreManifest.status,201);
    const restoreForm=new FormData();restoreForm.set('file',new File([restoreBytes],'private-new.csv',{type:'text/csv'}));restoreForm.set('batchId',restoreBatch);restoreForm.set('memberId',restoreMember);
    const restoredUpload=await request(base+'/api/documents?applicationId=test-app',{method:'POST',headers:{origin:base},body:restoreForm});assert.equal(restoredUpload.status,201,await restoredUpload.clone().text());assert.equal((await restoredUpload.json()).id,privateId,'explicit reselection restores retained ID');
    await request(base+'/api/upload-batches?applicationId=test-app',{method:'POST',headers:{origin:base,'Content-Type':'application/json'},body:JSON.stringify({id:restoreBatch,action:'finalize'})});
    const restoredDraft=await snapshot();assert(restoredDraft.documents.some((d:{id:string})=>d.id===privateId));assert(restoredDraft.draft.hasUnsentChanges);
    assert.deepEqual(restoredDraft.documents.find((d:{id:string})=>d.id===privateId).requirement_ids,[],'old links are not implicitly restored');
    assert.equal((await lenderRequest('/api/documents/'+privateId)).status,404,'restoration stays private until explicitly sent');
    assert.equal((await send()).status,200);assert.equal((await lenderRequest('/api/documents/'+privateId)).status,200);

    await unlink(path.join(root, "files", ids[2]));
    const missing = await request(base + "/api/documents/" + ids[2]);
    assert.equal(missing.status, 503);
    assert.match((await missing.json()).error, /unavailable/);
    console.log(
      "PASS: HTTP upload and exact-byte download for PDF/XLSX/CSV/JPG/PNG/WebP, duplicate/invalid/empty/oversize/origin rejection, persisted state across full server restart, recoverable missing-file response, scoped borrower link/unlink, application listing/isolation, submission publication and draft URL denial, idempotent/stale sends, frozen reviews, shared-file/receipt preservation and stale-review invalidation.",
    );
  } finally {
    await stop();
    await rm(root, { recursive: true, force: true });
    await database.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
