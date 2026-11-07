import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SQLiteRepository, LocalBlobStorage } from "../lib/local";
import { saveUpload } from "../lib/upload";
import { reviewState } from "../lib/review-state";
import { csv } from "./fixtures";
test("lender reviews persist, preserve history, share feedback, and new uploads require review", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lender-test-"));
  let repo = new SQLiteRepository(root);
  const storage = new LocalBlobStorage(path.join(root, "files"));
  try {
    const request = (await repo.snapshot()).requirements[0].id;
    await assert.rejects(
      repo.saveReview(request, "accepted", "", [], null),
      /uploaded/,
    );
    await assert.rejects(
      repo.saveReview(request, "changes_requested", "", [], null),
      /Explain/,
    );
    await repo.saveReview(
      request,
      "changes_requested",
      "Please upload the November rent roll.",
      [],
      null,
    );
    let snapshot = await repo.snapshot();
    assert.equal(
      snapshot.reviews[0].message,
      "Please upload the November rent roll.",
    );
    const first = snapshot.reviews[0].id;
    const id = await saveUpload(repo, storage, request, "rent.csv", csv);
    snapshot = await repo.snapshot();
    assert.equal(
      reviewState(request, snapshot.documents, snapshot.reviews).status,
      "Ready to review",
    );
    await assert.rejects(
      repo.saveReview(request, "accepted", "", [], first),
      /added a document/,
    );
    await repo.saveReview(
      request,
      "accepted",
      "Looks complete for this request.",
      [id],
      first,
    );
    await assert.rejects(
      repo.saveReview(request, "changes_requested", "Stale tab", [id], first),
      /another tab/,
    );
    await repo.saveNote("Internal assessment", null);
    await assert.rejects(repo.saveNote("Overwrite", null), /another tab/);
    repo.close();
    repo = new SQLiteRepository(root);
    const reopened = await repo.lenderSnapshot();
    assert.equal(reopened.note?.body, "Internal assessment");
    assert.equal(reopened.reviews.length, 2);
    assert.equal(
      reviewState(request, reopened.documents, reopened.reviews).status,
      "Accepted",
    );
    assert.ok(!("note" in (await repo.snapshot())));
    await saveUpload(
      repo,
      storage,
      request,
      "new.csv",
      new TextEncoder().encode("Tenant,Rent\nUpdated demo,18000\n"),
    );
    snapshot = await repo.snapshot();
    assert.equal(
      reviewState(request, snapshot.documents, snapshot.reviews).status,
      "Ready to review",
    );
    assert.equal(snapshot.reviews.length, 2);
  } finally {
    repo.close();
    await rm(root, { recursive: true, force: true });
  }
});

 test("an unchanged file set cannot resurrect a revision-invalidated acceptance", () => {
  const review = {id:'r',application_id:'a',requirement_id:'q',decision:'accepted' as const,message:'',document_ids:['d'],reviewer:'Lender',created_at:'2026-11-06',is_current:false};
  const documents = [{id:'d',application_id:'a',original_name:'file.csv',content_type:'text/csv',size_bytes:1,sha256:'a',uploaded_by:'Borrower',created_at:'2026-11-06',requirement_ids:['q']}];
  assert.equal(reviewState('q',documents,[review]).current,false);
  assert.equal(reviewState('q',documents,[review]).status,'Ready to review');
});
