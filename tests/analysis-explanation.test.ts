import test from 'node:test';
import assert from 'node:assert/strict';
import {assessmentExplanation, failureExplanation} from '../lib/analysis-explanation';

test('explains uncertainty even when some criteria are supported', () => {
  assert.equal(assessmentExplanation({assessment:'unknown',checks:[{state:'met',reason:'Amount found'},{state:'unknown',reason:'Signature cannot be verified'}]}),'Signature cannot be verified');
});
test('surfaces preparation limitations and conflicts instead of implying missing evidence', () => {
  assert.equal(assessmentExplanation({assessment:'unknown',limitations:['The scan is unreadable'],missingEvidence:['Income']}),'The scan is unreadable');
  assert.equal(assessmentExplanation({conflicts:[{reason:'Two files report different totals'}]}),'Two files report different totals');
});
test('handles wrapped results and missing result details', () => {
  assert.equal(assessmentExplanation({value:{assessment:'incomplete',missingEvidence:['Provide the current reporting period']}}),'Provide the current reporting period');
  assert.equal(assessmentExplanation(), 'No assessment details are available.');
});
test('validation failure means no accepted assessment, not an unmet requirement', () => {
  assert.match(failureExplanation('invalid_output'), /no assessment was accepted/);
  assert.match(failureExplanation('configuration_required'), /administrator/);
});
test('unknown diagnostics do not echo arbitrary provider text', () => {
  assert.equal(failureExplanation('sensitive provider response'), failureExplanation());
  assert.doesNotMatch(failureExplanation('sensitive provider response'), /sensitive/);
});
