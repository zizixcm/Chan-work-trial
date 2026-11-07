import type { VerifyResult } from './types';
export type Fulfillment = 'fulfilled'|'partially_fulfilled'|'not_fulfilled'|'unable_to_determine';
/** Current catalog criteria are all mandatory. Optional/alternative rules require
 * an explicit future definition contract; never infer them from model prose. */
export function deriveFulfillment(result:VerifyResult):Fulfillment {
  if(!result.checks.length||result.limitations.length||result.conflicts.length||result.checks.some(c=>c.state==='unknown'))return 'unable_to_determine';
  const met=result.checks.filter(c=>c.state==='met').length;
  if(met===result.checks.length)return result.missingEvidence.length?'unable_to_determine':'fulfilled';
  return met?'partially_fulfilled':'not_fulfilled';
}
