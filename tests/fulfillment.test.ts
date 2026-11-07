import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveFulfillment } from '../lib/analysis/fulfillment';
import type { VerifyResult,Check } from '../lib/analysis/types';
const result=(states:Check['state'][]):VerifyResult=>({schemaVersion:'verify.v1',requirementId:'r',assessment:'unknown',
  checks:states.map((state,i)=>({criterionId:String(i),state,reason:'Fixture',evidence:[]})),missingEvidence:[],limitations:[],conflicts:[]});
test('F17: mandatory criterion findings determine full, partial and unfulfilled assessments',()=>{
  assert.equal(deriveFulfillment(result(['met','met'])),'fulfilled');
  assert.equal(deriveFulfillment(result(['met','unmet'])),'partially_fulfilled');
  assert.equal(deriveFulfillment(result(['unmet','unmet'])),'not_fulfilled');
});
test('F17: missing criteria, unknowns, contradictory gaps and incomplete processing cannot appear fulfilled',()=>{
  for(const r of [result([]),result(['met','unknown']),{...result(['met']),missingEvidence:['Missing signature']},
    {...result(['met']),limitations:['Upload batch incomplete']},{...result(['met']),conflicts:[{reason:'Contradictory totals',evidence:[]}]}]) {
    assert.equal(deriveFulfillment(r),'unable_to_determine');
  }
});
