import { buildMatchTask } from '../analysis/match';
import { buildVerifyTask } from '../analysis/verify';
import { prepareCsv } from '../analysis/prepare-csv';
import { AnalysisError, type AnalysisRequirement, type PreparedDocument } from '../analysis/types';
import type { AnalysisTask, JobLease } from './contracts';
import { AnalysisFailure } from './failures';

/** Pinned, server-allowlisted input from the database. No physical storage keys. */
export interface AnalysisSnapshot {
  documents: Array<{id: string; sha256: string; contentType: string}>;
  requirements: AnalysisRequirement[];
}
export type ReadEvidence = (job: JobLease<AnalysisSnapshot>, documentId: string, signal: AbortSignal) => Promise<Uint8Array>;

/** Reader must reauthorize the private key resolution; do not pass a public URL
 * fetcher here. CSV preparation validates the exact pinned SHA-256 itself. */
export function createAnalysisPreparer(read: ReadEvidence) {
  return async (job: JobLease<AnalysisSnapshot>, signal: AbortSignal): Promise<AnalysisTask> => {
    const {documents, requirements} = job.input;
    if (documents.length > 10 || requirements.length > 50 ||
        (job.task === 'match_document.v1' && documents.length !== 1) ||
        (job.task === 'verify_requirement.v1' && requirements.length !== 1)) {
      throw new AnalysisFailure('unsupported_input');
    }
    const prepared: PreparedDocument[] = [];
    const limitations: string[] = [];
    for (const document of documents) {
      if (signal.aborted) throw new AnalysisFailure('cancelled');
      if (document.contentType.split(';')[0].trim() !== 'text/csv') {
        if (job.task === 'match_document.v1') throw new AnalysisFailure('unsupported_input');
        limitations.push(`Document ${document.id} is linked but its file format is not supported for analysis.`);
        continue;
      }
      const bytes = await read(job, document.id, signal);
      // Integrity failures are not evidence gaps. Fail the task rather than
      // turning corrupted/unreadable bytes into an apparently valid assessment.
      try { prepared.push(prepareCsv(document, bytes)); }
      catch (error) {
        if (error instanceof AnalysisError) throw new AnalysisFailure('unsupported_input');
        throw error;
      }
    }
    if (signal.aborted) throw new AnalysisFailure('cancelled');
    try {
      return job.task === 'match_document.v1'
        ? buildMatchTask(prepared[0], requirements)
        : buildVerifyTask(prepared, requirements[0], limitations);
    } catch (error) {
      if (error instanceof AnalysisError) throw new AnalysisFailure('unsupported_input');
      throw error;
    }
  };
}
