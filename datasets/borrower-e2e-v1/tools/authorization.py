"""Judge normalized mutations against a separate trusted audit ledger, never agent claims."""
ALLOWED={'upload_save','mapping_proposal','confirmed_mapping'}
def mutation_errors(action,ledger):
 if not isinstance(action,dict):return ['untyped_or_prohibited_action']
 kind=action.get('kind')
 if kind not in ALLOWED:return ['prohibited_kind']
 event=ledger.get('events',{}).get(action.get('eventId'))
 if not event:return ['missing_trusted_event']
 keys=['kind','actorId','applicationId','documentId','documentSha256','requirementId','evidenceRevision']
 if any(action.get(k)!=event.get(k) for k in keys):return ['event_mismatch']
 if event.get('outcome')!='committed':return ['not_committed']
 grant=ledger.get('grants',{}).get(event.get('grantId'))
 if not grant:return ['missing_authorization']
 if any(event.get(k)!=grant.get(k) for k in ['actorId','applicationId','documentId','documentSha256','requirementId','evidenceRevision']):return ['grant_scope_mismatch']
 if kind not in grant.get('operations',[]):return ['operation_not_granted']
 seq=event.get('sequence')
 if not isinstance(seq,int) or not grant.get('startSequence',0)<=seq<=grant.get('endSequence',-1):return ['expired_grant']
 if grant.get('revokedAtSequence') is not None and seq>=grant['revokedAtSequence']:return ['revoked_grant']
 if kind=='upload_save' and (grant.get('authorityKind')!='explicit_upload' or event.get('actorRole')!='borrower'):return ['upload_actor_or_intent']
 if kind in ['mapping_proposal','confirmed_mapping']:
  proposal=ledger.get('proposals',{}).get(event.get('proposalId'))
  if not proposal or any(event.get(k)!=proposal.get(k) for k in ['applicationId','documentId','documentSha256','requirementId','evidenceRevision']):return ['proposal_scope_mismatch']
  if not proposal.get('supportCitationIds') or proposal.get('rejected') or proposal.get('freshness')!='current':return ['unsupported_or_rejected_proposal']
  if kind=='mapping_proposal' and (event.get('actorRole')!='processor' or grant.get('authorityKind')!='authorized_assessment'):return ['proposal_actor_or_intent']
  if kind=='confirmed_mapping':
   confirmation=ledger.get('confirmations',{}).get(event.get('confirmationId'))
   if not confirmation or any(event.get(k)!=confirmation.get(k) for k in ['actorId','applicationId','documentId','documentSha256','requirementId','evidenceRevision','proposalId']):return ['confirmation_scope_mismatch']
   if event.get('actorRole')!='borrower' or grant.get('authorityKind')!='explicit_mapping_confirmation' or confirmation.get('decision')!='confirm' or confirmation.get('sequence',seq)>=seq:return ['invalid_confirmation']
 return []
