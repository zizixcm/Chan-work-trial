export const APPLICATION_ID = "b73fbd37-43ab-44ec-a810-a11178612d48";
export const DEMO_ACTOR = "Alex Morgan (local demo)";
export const MAX_FILE_SIZE = 25 * 1024 * 1024;
export interface LoanApplication {
  id: string;
  borrower_name: string;
  property_name: string;
  address: string;
  transaction_type: string;
  requested_amount: number;
  loi_reference: string;
  created_at: string;
}
export interface Requirement {
  id: string;
  application_id: string;
  title: string;
  category: string;
  purpose: string;
  period: string;
  owner: string;
  applicability: string;
  sort_order: number;
  criteria?: string[];
  collection?: "borrower" | "lender";
  stage?: string;
  condition?: string;
  /** PostgreSQL optimistic concurrency token, serialized as a decimal string. */
  evidence_revision?: string;
  definition_revision?: string;
}
export interface DocumentRecord {
  id: string;
  application_id: string;
  original_name: string;
  storage_key: string;
  content_type: string;
  size_bytes: number;
  sha256: string;
  uploaded_by: string;
  created_at: string;
}
export type PublicDocument = Omit<DocumentRecord, "storage_key"> & {
  requirement_ids: string[];
};
export interface ApplicationSnapshot {
  submission?: {id:string;revisionNumber:number;submittedAt:string} | null;
  draft?: {revision:string;contentRevision:string;hasUnsentChanges:boolean};
  application: LoanApplication;
  requirements: Requirement[];
  documents: PublicDocument[];
  reviews: RequirementReview[];
}
export interface DocumentRepository {
  snapshot(): Promise<ApplicationSnapshot>;
  requirement(id: string): Promise<Requirement | undefined>;
  document(id: string): Promise<DocumentRecord | undefined>;
  byChecksum(hash: string): Promise<DocumentRecord | undefined>;
  insert(document: DocumentRecord, requirementId: string): Promise<void>;
}
export interface BlobStorage {
  put(key: string, bytes: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  remove(key: string): Promise<void>;
}

export interface RequirementReview {
  id: string;
  application_id: string;
  requirement_id: string;
  decision: "accepted" | "changes_requested";
  message: string;
  document_ids: string[];
  /** False when a mapping/definition changed after this historical review. */
  is_current?: boolean;
  reviewer: string;
  created_at: string;
}
export interface LenderSnapshot extends ApplicationSnapshot {
  reviews: RequirementReview[];
  note: { body: string; updated_at: string } | null;
}
export interface ReviewRepository {
  lenderSnapshot(): Promise<LenderSnapshot>;
  saveReview(
    requirementId: string,
    decision: RequirementReview["decision"],
    message: string,
    documentIds: string[],
    expectedReviewId: string | null,
  ): Promise<void>;
  saveNote(body: string, expectedUpdatedAt: string | null): Promise<void>;
}
