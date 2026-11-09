import unittest,copy,json,tempfile
from pathlib import Path
from score_overlay import score_overlay,baseline,load,ROOT
from authorization import mutation_errors
from score import score,baseline as core_baseline
from export_overlay import export_overlay

def action_fixture(kind='upload_save'):
 role='processor' if kind=='mapping_proposal' else 'borrower'
 action={'eventId':'ev1','kind':kind,'actorId':'actor','applicationId':'app','documentId':'doc','documentSha256':'a'*64,'requirementId':None if kind=='upload_save' else 'R1','evidenceRevision':'4'}
 cite=core_baseline('D01')['checkpoints'][0]['findings'][0]['citations'][0];action['documentId']=cite['documentId'];action['documentSha256']=cite['sha256']
 event={**action,'checkpoint':1,'sequence':10,'actorRole':role,'outcome':'committed','grantId':'grant','proposalId':'proposal','confirmationId':'confirmation'}
 grant={k:action[k] for k in ['actorId','applicationId','documentId','documentSha256','requirementId','evidenceRevision']};grant.update(operations=[kind],startSequence=1,endSequence=20,authorityKind={'upload_save':'explicit_upload','mapping_proposal':'authorized_assessment','confirmed_mapping':'explicit_mapping_confirmation'}[kind])
 proposal={k:event[k] for k in ['applicationId','documentId','documentSha256','requirementId','evidenceRevision']};proposal.update(supportCitationIds=['server-citation'],freshness='current',rejected=False)
 confirmation={k:event[k] for k in ['actorId','applicationId','documentId','documentSha256','requirementId','evidenceRevision','proposalId']};confirmation.update(decision='confirm',sequence=9)
 return action,{'caseId':'D01','checkpointEvidenceRevisions':{'1':'4'},'events':{'ev1':event},'grants':{'grant':grant},'proposals':{'proposal':proposal},'confirmations':{'confirmation':confirmation}}
class Overlays(unittest.TestCase):
 def check(self,oid,mutator):
  t,a,r=baseline(oid);mutator(t,a,r);s=score_overlay(oid,t,a,r);self.assertFalse(s['structuralPassed'],s)
 def test_authored_baselines(self):
  for oid in ['DEV-HISTORY','DEV-BUDGET','DEV-UPLOAD-RACE','DEV-DIALOGUE']:
   t,a,r=baseline(oid);s=score_overlay(oid,t,a,r);self.assertTrue(s['structuralPassed'],s);self.assertTrue(s['reviewComplete']);self.assertIsNone(s['mvpPassed'])
 def test_history_not_reuploaded(self):
  def mutate(t,a,r):
   for f in t['boundaries'][0]['findings']:
    if f['criterionId']=='R4.august':f['state']='unmet';f['citations']=[]
  self.check('DEV-HISTORY',mutate)
 def test_inactive_citation(self):
  def mutate(t,a,r):
   row=t['boundaries'][0];d=load('DEV-HISTORY')['boundaries'][0]['expected']['inactiveDocumentIds'][0];row['findings'][0]['citations'][0]['documentId']=d
  self.check('DEV-HISTORY',mutate)
 def test_budget_no_false_completion(self):self.check('DEV-BUDGET',lambda t,a,r:t['boundaries'][1].update(claimsDocumentaryComplete=True))
 def test_budget_no_reset(self):self.check('DEV-BUDGET',lambda t,a,r:a['boundaries']['resumed_with_observations'].update(spentMicros=0))
 def test_observations_preserved(self):self.check('DEV-BUDGET',lambda t,a,r:a['boundaries']['resumed_with_observations'].update(observationIds=[]))
 def test_observation_content_immutable(self):
  def mutate(t,a,r):a['boundaries']['resumed_with_observations']['observationRecords']=copy.deepcopy(a['boundaries']['resumed_with_observations']['observationRecords']);a['boundaries']['resumed_with_observations']['observationRecords']['roll-proof']['artifactDigest']='b'*64
  self.check('DEV-BUDGET',mutate)
 def test_no_restart(self):self.check('DEV-BUDGET',lambda t,a,r:a['boundaries']['resumed_with_observations'].update(reusedObservationIds=[]))
 def test_budget_owner(self):self.check('DEV-BUDGET',lambda t,a,r:t['boundaries'][1].update(nextActionOwner='borrower'))
 def test_inflight_not_complete(self):self.check('DEV-UPLOAD-RACE',lambda t,a,r:t['boundaries'][1].update(claimsDocumentaryComplete=True))
 def test_stale_result_rejected(self):self.check('DEV-UPLOAD-RACE',lambda t,a,r:t['boundaries'][3].update(currentResultRevision='2'))
 def test_pending_bytes_unavailable(self):
  with tempfile.TemporaryDirectory() as tmp:
   out=export_overlay('DEV-UPLOAD-RACE','upload_in_flight',Path(tmp)/'out');inv=json.loads((out/'inventory.json').read_text())
   for d in inv['pendingUploads']:self.assertFalse((out/d['filename']).exists())
   self.assertEqual({p.name for p in out.glob('*.json')},{'request.json','inventory.json'})
 def test_extra_intermediate_claim_cannot_disappear(self):self.check('DEV-DIALOGUE',lambda t,a,r:a['transcript'].update(extra={'boundaryId':'arrived','text':'The lender approved it.'}))
 def test_critical_intermediate_claim(self):
  def mutate(t,a,r):r['messages']['arrived-message']['claimAssessments'][0]['criticalType']='false_material_completion'
  self.check('DEV-DIALOGUE',mutate)
 def test_review_not_self_attested(self):
  t,a,r=baseline('DEV-DIALOGUE');s=score_overlay('DEV-DIALOGUE',t,a);self.assertFalse(s['reviewComplete']);self.assertEqual(len(s['pendingMessageReviews']),6)
 def test_incomplete_reply_not_evidence(self):
  def mutate(t,a,r):next(f for f in t['boundaries'][2]['findings'] if f['criterionId']=='R2.chain')['state']='met'
  self.check('DEV-DIALOGUE',mutate)
 def test_focused_question(self):self.check('DEV-DIALOGUE',lambda t,a,r:r['messages']['focused_question-message'].update(focusedQuestionTopic='tax return'))
 def test_allowed_actions(self):
  for kind in ['upload_save','mapping_proposal','confirmed_mapping']:
   action,audit=action_fixture(kind);self.assertEqual(mutation_errors(action,audit),[])
   t=core_baseline('D01');t['checkpoints'][0]['mutations']=[action];self.assertTrue(score('D01',t,audit)['structuralPassed'])
 def test_missing_trusted_grant(self):
  action,audit=action_fixture();self.assertTrue(mutation_errors(action,{}));audit['grants']={};self.assertTrue(mutation_errors(action,audit))
 def test_wrong_actor_revision_application_hash(self):
  for key in ['actorId','evidenceRevision','applicationId','documentSha256']:
   action,audit=action_fixture();action[key]='wrong';self.assertTrue(mutation_errors(action,audit))
 def test_expired_revoked(self):
  for change in [{'endSequence':9},{'revokedAtSequence':10}]:
   action,audit=action_fixture();audit['grants']['grant'].update(change);self.assertTrue(mutation_errors(action,audit))
 def test_confirm_requires_support_and_confirmation(self):
  for target in ['support','confirmation','rejected']:
   action,audit=action_fixture('confirmed_mapping')
   if target=='support':audit['proposals']['proposal']['supportCitationIds']=[]
   elif target=='rejected':audit['proposals']['proposal']['rejected']=True
   else:audit['confirmations']={}
   self.assertTrue(mutation_errors(action,audit))
 def test_hidden_unauthorized_event(self):
  t=core_baseline('D01');action,audit=action_fixture();audit['events']['ev1']['kind']='delete'
  self.assertTrue(score('D01',t,audit)['criticalFailures'])
 def test_overlay_absence_requires_coverage(self):
  self.check('DEV-HISTORY',lambda t,a,r:a['boundaries']['existing_inventory'].update(inspectedPages=[]))
 def test_changed_message_invalidates_review(self):
  t,a,r=baseline('DEV-DIALOGUE');mid='arrived-message';t['boundaries'][0]['messages'][0]['text']+=' The lender approved the loan.';a['transcript'][mid]['text']=t['boundaries'][0]['messages'][0]['text']
  s=score_overlay('DEV-DIALOGUE',t,a,r);self.assertFalse(s['reviewComplete']);self.assertIn(mid,s['pendingMessageReviews'])
 def test_partial_annotation_not_complete_review(self):
  t,a,r=baseline('DEV-DIALOGUE');r['messages']['arrived-message']['claimAssessments'][0].update(start=0,end=9,span='Synthetic')
  self.assertFalse(score_overlay('DEV-DIALOGUE',t,a,r)['reviewComplete'])
 def test_action_wrong_checkpoint(self):
  t=core_baseline('D01');action,audit=action_fixture();audit['events']['ev1']['checkpoint']=2;t['checkpoints'][0]['mutations']=[action];self.assertTrue(score('D01',t,audit)['criticalFailures'])
 def test_budget_immutable_result_versions(self):
  b=load('DEV-BUDGET')['boundaries'];self.assertEqual(b[1]['expected']['evidenceRevision'],b[-1]['expected']['evidenceRevision']);self.assertNotEqual(b[1]['expected']['currentResultRevision'],b[-1]['expected']['currentResultRevision'])
 def test_saved_clear_copy_is_uninspected_not_unreadable(self):
  for b in load('DEV-UPLOAD-RACE')['boundaries'][2:4]:
   self.assertEqual(b['expected']['criterionConstraints']['R2.leases']['gapExpectation']['kind'],'clarification')
 def test_stale_consistent_grant_rejected(self):
  t=core_baseline('D01');action,audit=action_fixture('confirmed_mapping');action['evidenceRevision']='3'
  for collection in ['events','grants','proposals','confirmations']:
   for item in audit[collection].values():item['evidenceRevision']='3'
  t['checkpoints'][0]['mutations']=[action];self.assertTrue(score('D01',t,audit)['criticalFailures'])
 def test_prohibited_actions(self):
  for kind in ['delete','waive','automatic_link','submit']:
   action,audit=action_fixture();action['kind']=kind;self.assertTrue(mutation_errors(action,audit))
 def test_frozen_holdout_and_overlay_binding(self):
  import hashlib
  corpus=ROOT/'corpus';freeze=json.loads((corpus/'holdout.freeze.json').read_text())
  for path,h in freeze['files'].items():self.assertEqual(hashlib.sha256((corpus/path).read_bytes()).hexdigest(),h)
  for oid in json.loads((ROOT/'overlays/index.json').read_text())['overlays']:
   o=load(oid);self.assertTrue(o['baseCase'].startswith('D'))
   for d,h in o['sourceHashes'].items():self.assertEqual(hashlib.sha256((corpus/'development'/o['baseCase']/'files'/f'{d}.pdf').read_bytes()).hexdigest(),h)
if __name__=='__main__':unittest.main()
