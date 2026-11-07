import Papa from 'papaparse';
import { createHash } from 'node:crypto';
import { AnalysisError, type PreparedDocument } from './types';

/** Analysis support is narrower than upload support. Logical record 1 is the header. */
export function prepareCsv(document: { id: string; sha256: string }, bytes: Uint8Array): PreparedDocument {
  if (!document.id || !/^[a-f0-9]{64}$/.test(document.sha256) ||
      createHash('sha256').update(bytes).digest('hex') !== document.sha256)
    throw new AnalysisError('UNSUPPORTED_INPUT');
  if (bytes.length > 250_000) throw new AnalysisError('INPUT_TOO_LARGE');
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new AnalysisError('UNSUPPORTED_INPUT'); }
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(text)) throw new AnalysisError('UNSUPPORTED_INPUT');
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: false, delimiter: ',' });
  // Ignore only a terminal empty record introduced by the final newline.
  const records = parsed.data;
  if (records.at(-1)?.length === 1 && records.at(-1)?.[0] === '') records.pop();
  if (parsed.errors.length || records.length < 2 || records[0].length < 2 ||
      records[0].some(c => !c.trim()) || records.some(r => r.length !== records[0].length))
    throw new AnalysisError('UNSUPPORTED_INPUT');
  if (records.length > 501 || records[0].length > 20 || records.some(r => r.some(c => c.length > 2_000)))
    throw new AnalysisError('INPUT_TOO_LARGE');
  // Cells are data; formulas are never evaluated, and source text is never normalized away.
  return { ...document, records };
}
