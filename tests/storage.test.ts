import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { zipSync, strToU8 } from "fflate";
import { SQLiteRepository, LocalBlobStorage } from "../lib/local";
import { saveUpload } from "../lib/upload";
import { validateFile } from "../lib/validation";
import { MAX_FILE_SIZE } from "../lib/model";
import { boundedFormData, localRequest } from "../lib/http";

import { csv, xlsx } from "./fixtures";

test("real file bytes and relational records survive a database reopen; duplicates leave no new record", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "portal-test-"));
  let repo = new SQLiteRepository(root);
  const storage = new LocalBlobStorage(path.join(root, "files"));
  try {
    const requirement = (await repo.snapshot()).requirements[0];
    const id = await saveUpload(
      repo,
      storage,
      requirement.id,
      "rent-roll.csv",
      csv,
    );
    assert.deepEqual(await storage.get(id), csv);
    await assert.rejects(
      saveUpload(repo, storage, requirement.id, "renamed.csv", csv),
      /already saved/,
    );
    repo.close();
    repo = new SQLiteRepository(root);
    const snapshot = await repo.snapshot();
    assert.equal(snapshot.documents.length, 1);
    assert.deepEqual(snapshot.documents[0].requirement_ids, [requirement.id]);
    assert.equal(snapshot.documents[0].id, id);
    assert.equal(snapshot.documents[0].size_bytes, csv.length);
    assert.deepEqual(
      new Uint8Array(await readFile(path.join(root, "files", id))),
      csv,
    );
  } finally {
    repo.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("all three supported formats are structurally validated", async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  assert.equal(
    await validateFile("demo.pdf", await pdf.save()),
    "application/pdf",
  );
  assert.match(await validateFile("demo.xlsx", xlsx()), /spreadsheetml/);
  assert.match(await validateFile("demo.csv", csv), /text\/csv/);
});

test("empty, unsupported, oversized, corrupt, protected and inconsistent files give recoverable errors", async () => {
  await assert.rejects(validateFile("file.csv", new Uint8Array()), /empty/);
  await assert.rejects(validateFile("file.exe", csv), /PDF, DOCX, XLSX, EML, MSG, TXT, CSV/);
  await assert.rejects(
    validateFile("large.pdf", new Uint8Array(MAX_FILE_SIZE + 1)),
    /25 MB/,
  );
  await assert.rejects(validateFile("fake.pdf", csv), /does not appear/);
  await assert.rejects(
    validateFile("broken.pdf", strToU8("%PDF-1.7\nbroken")),
    /damaged/,
  );
  await assert.rejects(validateFile("fake.xlsx", csv), /damaged/);
  await assert.rejects(
    validateFile("broken.csv", strToU8("a,b\n1,2,3")),
    /consistent columns/,
  );
  await assert.rejects(
    validateFile("binary.csv", new Uint8Array([0, 1, 2])),
    /CSV/,
  );
  const protectedZip = zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "xl/workbook.xml": strToU8("<workbook><workbookProtection/></workbook>"),
    "xl/worksheets/sheet1.xml": strToU8("<worksheet/>"),
  });
  await assert.rejects(
    validateFile("protected.xlsx", protectedZip),
    /protected/,
  );
  const corruptXml = zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "xl/workbook.xml": strToU8("<workbook><broken></workbook>"),
    "xl/worksheets/sheet1.xml": strToU8("<worksheet/>"),
  });
  await assert.rejects(validateFile("corrupt.xlsx", corruptXml), /damaged/);
});

test("database failure removes newly stored blob; storage failure creates no metadata", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "portal-failure-"));
  const repo = new SQLiteRepository(root);
  const storage = new LocalBlobStorage(path.join(root, "files"));
  const request = (await repo.snapshot()).requirements[0];
  try {
    const insert = repo.insert.bind(repo);
    let removed = false;
    repo.insert = async () => {
      throw new Error("simulated db unavailable");
    };
    const remove = storage.remove.bind(storage);
    storage.remove = async (key) => {
      removed = true;
      await remove(key);
    };
    await assert.rejects(
      saveUpload(repo, storage, request.id, "demo.csv", csv),
      /simulated db/,
    );
    assert.equal(removed, true);
    assert.equal((await repo.snapshot()).documents.length, 0);
    repo.insert = insert;
    storage.put = async () => {
      throw new Error("disk full");
    };
    await assert.rejects(
      saveUpload(repo, storage, request.id, "demo.csv", csv),
      /disk full/,
    );
    assert.equal((await repo.snapshot()).documents.length, 0);
    await assert.rejects(
      saveUpload(repo, storage, "missing", "demo.csv", csv),
      /checklist request/,
    );
    await assert.rejects(
      storage.get("../portal.sqlite"),
      /Invalid storage key/,
    );
  } finally {
    repo.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("local guards and bounded multipart parsing reject foreign origins and oversized bodies", async () => {
  assert.throws(
    () => localRequest(new Request("http://example.com/api/application")),
    /localhost/,
  );
  assert.throws(
    () =>
      localRequest(
        new Request("http://127.0.0.1:3000/api/documents", {
          headers: { origin: "https://foreign.example" },
        }),
        true,
      ),
    /local portal/,
  );
  await assert.rejects(
    boundedFormData(
      new Request("http://localhost", {
        method: "POST",
        body: "x",
        headers: { "content-length": String(MAX_FILE_SIZE + 2 * 1024 * 1024) },
      }),
    ),
    /25 MB/,
  );
  await assert.rejects(
    boundedFormData(
      new Request("http://localhost", {
        method: "POST",
        body: "bad multipart",
      }),
    ),
    /malformed/,
  );
});
