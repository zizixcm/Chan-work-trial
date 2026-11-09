import unittest,copy,json
from score import score,baseline,ROOT
class OfflineScorer(unittest.TestCase):
 def test_baselines(self):
  for cid in ['D01','D02','D03','D04','D05','D06','D07','D08','H01','H02','H03','H04']:
   with self.subTest(cid=cid):self.assertTrue(score(cid,baseline(cid))['structuralPassed'])
 def test_false_complete(self):
  t=baseline('D01');t['checkpoints'][0]['findings'][2]['state']='met';self.assertTrue(score('D01',t)['criticalFailures'])
 def test_fabricated_quote(self):
  t=baseline('D01');t['checkpoints'][0]['findings'][0]['citations'][0]['quote']='invented';self.assertTrue(score('D01',t)['criticalFailures'])
 def test_nonexistent_page(self):
  t=baseline('D01');t['checkpoints'][0]['findings'][0]['citations'][0]['page']=999;self.assertTrue(score('D01',t)['criticalFailures'])
 def test_wrong_hash(self):
  t=baseline('D01');t['checkpoints'][0]['findings'][0]['citations'][0]['sha256']='0'*64;self.assertTrue(score('D01',t)['criticalFailures'])
 def test_forgotten_evidence(self):
  t=baseline('D01');t['checkpoints'][2]['findings'][0].update(state='unmet',citations=[]);self.assertFalse(score('D01',t)['structuralPassed'])
 def test_blanket_unknown(self):
  t=baseline('D01')
  for c in t['checkpoints']:
   for f in c['findings']:f['state']='unknown'
  s=score('D01',t);self.assertFalse(s['structuralPassed']);self.assertLess(s['criterionAgreement']['correct'],s['criterionAgreement']['total'])
 def test_unrelated_valid_source(self):
  t=baseline('D01');t['checkpoints'][0]['findings'][0]['citations']=copy.deepcopy(t['checkpoints'][0]['findings'][5]['citations']);s=score('D01',t);self.assertFalse(s['structuralPassed']);self.assertFalse(s['shapeErrors'])
 def test_no_inspection(self):
  t=baseline('D01');t['checkpoints'][0]['inspectedPages']=[];self.assertFalse(score('D01',t)['structuralPassed'])
 def test_unauthorized_change(self):
  t=baseline('D01');t['checkpoints'][0]['mutations']=['delete'];self.assertTrue(score('D01',t)['criticalFailures'])
 def test_duplicate_acceptable(self):
  from score import load_case
  t=baseline('D02');o,m=load_case('D02');d=o['roles']['duplicate'];h=next(x['sha256'] for x in m['documents'] if x['documentId']==d)
  for f in t['checkpoints'][1]['findings']:
   if f['criterionId']=='R4.july':
    for c in f['citations']:c['documentId']=d;c['sha256']=h
  self.assertTrue(score('D02',t)['structuralPassed'])
 def test_omitted_criterion(self):
  t=baseline('D01');t['checkpoints'][0]['findings'].pop();self.assertFalse(score('D01',t)['structuralPassed'])
 def test_same_page_quote_requires_semantic_review(self):
  t=baseline('D01');s=score('D01',t)
  # Baseline uses the property line even for unit coverage: not proof of entailment.
  self.assertTrue(s['structuralPassed']);self.assertIsNone(s['mvpPassed']);self.assertTrue(s['semanticAdjudication'].startswith('required'))
 def test_current_amendment_alternative(self):
  t=baseline('H03')
  f=next(f for f in t['checkpoints'][1]['findings'] if f['criterionId']=='R2.compare')
  f['state']='met';f['gap']=None
  self.assertTrue(score('H03',t)['structuralPassed'])
 def test_wrong_gap_owner(self):
  t=baseline('D08');t['checkpoints'][-1]['findings'][-1]['gap']['owner']='borrower';self.assertFalse(score('D08',t)['structuralPassed'])
if __name__=='__main__':unittest.main()
