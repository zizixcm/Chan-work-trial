import { UploadError } from "./validation";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  APPLICATION_ID,
  DEMO_ACTOR,
  type DocumentRepository,
  type BlobStorage,
  type DocumentRecord,
  type Requirement,
  type LoanApplication,
  type PublicDocument,
  type RequirementReview,
  type ReviewRepository,
} from "./model";

export function dataDirectory() {
  return path.resolve(
    process.env.PORTAL_DATA_DIR || path.join(process.cwd(), ".data"),
  );
}
export class SQLiteRepository implements DocumentRepository, ReviewRepository {
  private db: DatabaseSync;
  constructor(root = dataDirectory()) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path.join(root, "portal.sqlite"));
    this.db.exec(
      "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;",
    );
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)",
    );
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (
        !this.db
          .prepare("SELECT version FROM schema_migrations WHERE version = 1")
          .get()
      ) {
        this.db.exec(
          readFileSync(
            path.join(process.cwd(), "migrations/001_initial.sql"),
            "utf8",
          ),
        );
        this.db
          .prepare("INSERT INTO schema_migrations VALUES (?, ?)")
          .run(1, new Date().toISOString());
      }
      if (
        !this.db
          .prepare("SELECT version FROM schema_migrations WHERE version = 2")
          .get()
      ) {
        this.db.exec(
          readFileSync(
            path.join(process.cwd(), "migrations/002_lender_review.sql"),
            "utf8",
          ),
        );
        this.db
          .prepare("INSERT INTO schema_migrations VALUES (?, ?)")
          .run(2, new Date().toISOString());
      }
      this.seed();
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  private seed() {
    this.db
      .prepare(
        "INSERT OR IGNORE INTO applications VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        APPLICATION_ID,
        "Oak & Elm Partners LLC",
        "Oak & Elm Plaza",
        "2400 Oak Avenue · Portland, OR",
        "Refinance",
        4800000,
        "DEMO-LOI-2026-014",
        "2026-11-01T18:00:00.000Z",
      );
    const rows = [
      [
        "Current rent roll",
        "Property",
        "Show current tenants, rental income, and occupancy.",
        "As of October or November 2026",
      ],
      [
        "Property operating statements",
        "Property",
        "Provide income and expenses for two comparable annual periods.",
        "Full years 2024 and 2025",
      ],
      [
        "Lease agreements & amendments",
        "Property",
        "Document the terms of the property’s existing tenancies.",
        "All current executed leases · demo scope",
      ],
      [
        "Debt service evidence",
        "Financing",
        "Support annual principal and interest obligations.",
        "Full years 2024 and 2025",
      ],
      [
        "Mortgage statement / payoff",
        "Financing",
        "Identify the existing debt to be refinanced.",
        "Most recent available statement",
      ],
      [
        "Financial statements & tax return",
        "Borrower",
        "Support the borrowing entity’s financial position.",
        "2025 year-end statements and complete 2025 return",
      ],
      [
        "Formation & ownership documents",
        "Borrower",
        "Identify the entity, its owners, and authorized signers.",
        "Current formation documents and ownership schedule",
      ],
      [
        "Personal financial statement",
        "Guarantor",
        "Summarize the guarantor’s assets and liabilities.",
        "As of October or November 2026",
      ],
      [
        "Guarantor income / tax return",
        "Guarantor",
        "Support the guarantor’s reported income.",
        "Complete 2025 return with applicable schedules",
      ],
    ];
    rows.forEach(([title, category, purpose, period], i) =>
      this.db
        .prepare(
          "INSERT OR IGNORE INTO requirements VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          `33000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
          APPLICATION_ID,
          title,
          category,
          purpose,
          period,
          category === "Guarantor"
            ? "Alex Morgan · demo guarantor"
            : "Oak & Elm Partners LLC · demo borrower",
          "Required for this demo refinance",
          i,
        ),
    );
  }
  async snapshot() {
    return this.readSnapshot();
  }
  private readSnapshot() {
    const application = this.db
      .prepare("SELECT * FROM applications WHERE id = ?")
      .get(APPLICATION_ID) as unknown as LoanApplication;
    const requirements = this.db
      .prepare(
        "SELECT * FROM requirements WHERE application_id = ? ORDER BY sort_order",
      )
      .all(APPLICATION_ID) as unknown as Requirement[];
    const rows = this.db
      .prepare(
        "SELECT * FROM documents WHERE application_id = ? ORDER BY created_at DESC, id",
      )
      .all(APPLICATION_ID) as unknown as DocumentRecord[];
    const documents: PublicDocument[] = rows.map(
      ({ storage_key: _key, ...row }) => ({
        ...row,
        requirement_ids: (
          this.db
            .prepare(
              "SELECT requirement_id FROM requirement_documents WHERE document_id = ?",
            )
            .all(row.id) as { requirement_id: string }[]
        ).map((x) => x.requirement_id),
      }),
    );
    const reviews = this.reviews();
    return { application, requirements, documents, reviews };
  }
  async requirement(id: string) {
    return this.db
      .prepare("SELECT * FROM requirements WHERE id = ? AND application_id = ?")
      .get(id, APPLICATION_ID) as unknown as Requirement | undefined;
  }
  async document(id: string) {
    return this.db
      .prepare("SELECT * FROM documents WHERE id = ? AND application_id = ?")
      .get(id, APPLICATION_ID) as unknown as DocumentRecord | undefined;
  }
  async byChecksum(hash: string) {
    return this.db
      .prepare(
        "SELECT * FROM documents WHERE sha256 = ? AND application_id = ?",
      )
      .get(hash, APPLICATION_ID) as unknown as DocumentRecord | undefined;
  }
  async insert(d: DocumentRecord, requirementId: string) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare("INSERT INTO documents VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(
          d.id,
          d.application_id,
          d.original_name,
          d.storage_key,
          d.content_type,
          d.size_bytes,
          d.sha256,
          d.uploaded_by,
          d.created_at,
        );
      this.db
        .prepare("INSERT INTO requirement_documents VALUES (?, ?)")
        .run(requirementId, d.id);
      this.db
        .prepare("INSERT INTO audit_events VALUES (?, ?, ?, ?, ?, ?)")
        .run(
          randomUUID(),
          APPLICATION_ID,
          DEMO_ACTOR,
          "document.uploaded",
          d.id,
          d.created_at,
        );
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  private reviews(): RequirementReview[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM requirement_reviews WHERE application_id = ? ORDER BY rowid DESC",
      )
      .all(APPLICATION_ID) as unknown as (Omit<
      RequirementReview,
      "document_ids"
    > & { document_ids: string })[];
    return rows.map((r) => ({
      ...r,
      document_ids: JSON.parse(r.document_ids),
    }));
  }
  async lenderSnapshot() {
    return {
      ...(await this.snapshot()),
      note:
        (this.db
          .prepare(
            "SELECT body, updated_at FROM lender_notes WHERE application_id = ?",
          )
          .get(APPLICATION_ID) as
          { body: string; updated_at: string } | undefined) || null,
    };
  }
  async saveReview(
    requirementId: string,
    decision: RequirementReview["decision"],
    message: string,
    documentIds: string[],
    expectedReviewId: string | null,
  ) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const snapshot = this.readSnapshot();
      if (!snapshot.requirements.some((r) => r.id === requirementId))
        throw new UploadError("This request could not be found.", 404);
      const latest = snapshot.reviews.find(
        (r) => r.requirement_id === requirementId,
      );
      if ((latest?.id || null) !== expectedReviewId)
        throw new UploadError(
          "This review changed in another tab. Refresh before saving.",
          409,
        );
      const actual = snapshot.documents
        .filter((d) => d.requirement_ids.includes(requirementId))
        .map((d) => d.id)
        .sort();
      if (JSON.stringify(actual) !== JSON.stringify([...documentIds].sort()))
        throw new UploadError(
          "The borrower added a document. Refresh and review the latest files before saving.",
          409,
        );
      if (decision === "accepted" && !actual.length)
        throw new UploadError(
          "A document must be uploaded before you can accept this request.",
        );
      if (decision === "changes_requested" && !message.trim())
        throw new UploadError("Explain what the borrower needs to provide.");
      const id = randomUUID();
      const now = new Date().toISOString();
      this.db
        .prepare(
          "INSERT INTO requirement_reviews VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          id,
          APPLICATION_ID,
          requirementId,
          decision,
          message.trim(),
          JSON.stringify(actual),
          "Jordan Lee (demo lender)",
          now,
        );
      this.db
        .prepare("INSERT INTO audit_events VALUES (?, ?, ?, ?, ?, ?)")
        .run(
          randomUUID(),
          APPLICATION_ID,
          "Jordan Lee (demo lender)",
          "requirement." + decision,
          id,
          now,
        );
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  async saveNote(body: string, expectedUpdatedAt: string | null) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const previous = this.db
        .prepare("SELECT updated_at FROM lender_notes WHERE application_id = ?")
        .get(APPLICATION_ID) as { updated_at: string } | undefined;
      if ((previous?.updated_at || null) !== expectedUpdatedAt)
        throw new UploadError(
          "These notes changed in another tab. Refresh before saving; copy your draft first.",
          409,
        );
      this.db
        .prepare(
          "INSERT INTO lender_notes VALUES (?, ?, ?) ON CONFLICT(application_id) DO UPDATE SET body=excluded.body, updated_at=excluded.updated_at",
        )
        .run(APPLICATION_ID, body, new Date().toISOString());
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  close() {
    this.db.close();
  }
}
export class LocalBlobStorage implements BlobStorage {
  constructor(private root = path.join(dataDirectory(), "files")) {}
  private location(key: string) {
    if (!/^[a-f0-9-]{36}$/.test(key)) throw new Error("Invalid storage key");
    return path.join(this.root, key);
  }
  async put(key: string, bytes: Uint8Array) {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const destination = this.location(key);
    const temporary = destination + ".tmp-" + randomUUID();
    try {
      await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
      await rename(temporary, destination);
    } finally {
      await unlink(temporary).catch(() => {});
    }
  }
  async get(key: string) {
    return new Uint8Array(await readFile(this.location(key)));
  }
  async remove(key: string) {
    await unlink(this.location(key));
  }
}
let repository: SQLiteRepository | undefined;
export function adapters() {
  return {
    repository: (repository ??= new SQLiteRepository()),
    storage: new LocalBlobStorage(),
  };
}
