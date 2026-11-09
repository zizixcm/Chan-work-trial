import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {initializeLedger,reserveEvaluationCall,settleEvaluationCall,evaluationSummary} from '../scripts/evaluation-ledger.mjs';
test('batch cap is atomic within cumulative ledger and unknown costs stay reserved',()=>{
 const dir=mkdtempSync(join(tmpdir(),'pilot-budget-')),ledger=join(dir,'ledger.json');
 try{
  initializeLedger(ledger);
  const call={model:'test',scenario:'offline',upperBoundMicros:600000,batchId:'pilot-1',batchLimitMicros:1000000};
  reserveEvaluationCall(ledger,{...call,callId:'one'});
  assert.throws(()=>reserveEvaluationCall(ledger,{...call,callId:'two'}),/Batch budget/);
  assert.throws(()=>reserveEvaluationCall(ledger,{...call,callId:'two',batchLimitMicros:2000000}),/Batch budget/);
  settleEvaluationCall(ledger,'one',100000);
  reserveEvaluationCall(ledger,{...call,callId:'two'});
  settleEvaluationCall(ledger,'two',null);
  assert.equal(evaluationSummary(ledger).accountedMicros,700000);
  assert.throws(()=>reserveEvaluationCall(ledger,{...call,callId:'three'}),/Batch budget/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
