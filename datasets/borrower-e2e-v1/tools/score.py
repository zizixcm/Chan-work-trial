"""Offline evaluator-only normalized trace scorer. No provider or application imports."""
import json,copy,argparse
from pathlib import Path
from authorization import mutation_errors
ROOT=Path(__file__).resolve().parents[1]
def load_case(cid):
 split='development' if cid.startswith('D') else 'holdout';base=ROOT/'corpus'/split/cid
 return json.loads((base/'private/oracle.json').read_text()),json.loads((base/'manifest.json').read_text())
def score(cid,trace,trusted_actions=None):
 oracle,manifest=load_case(cid);docs={d['documentId']:d for d in manifest['documents']};critical=[];errors=[];shape=[];state_hits=0;total=0;gap_hits=0;gap_total=0;unknowns=0
 cps=trace.get('checkpoints',[])
 if len(cps)!=len(oracle['checkpoints']):errors.append('checkpoint_count')
 for pos,gold in enumerate(oracle['checkpoints']):
  if pos>=len(cps):continue
  observed=cps[pos];findings=observed.get('findings',[]);by={f.get('criterionId'):f for f in findings}
  if set(by)!={f['criterionId'] for f in gold['findings']} or len(by)!=len(findings):shape.append(f'{pos+1}:criterion_inventory')
  coverage={(r.get('documentId'),r.get('page')) for r in observed.get('inspectedPages',[])}
  active=set(gold['activeDocumentIds'])
  for d,p in coverage:
   if d not in active or not isinstance(p,int) or not 1<=p<=docs[d]['pageCount']:shape.append(f'{pos+1}:coverage_locator')
  for expected in gold['findings']:
   key=expected['criterionId'];f=by.get(key,{});state=f.get('state');total+=1
   if state not in ['met','unmet','unknown']:shape.append(f'{pos+1}:{key}:state')
   if state in expected.get('allowedStates',[expected['state']]):state_hits+=1
   else:errors.append(f'{pos+1}:{key}:state_expected_{expected["state"]}')
   if state=='unknown':unknowns+=1
   if state=='met' and 'met' not in expected.get('allowedStates',[expected['state']]):critical.append(f'{pos+1}:{key}:false_complete')
   citations=f.get('citations',[]);supported=set()
   for cite in citations:
    d=cite.get('documentId');p=cite.get('page');q=cite.get('quote','')
    valid=d in active and isinstance(p,int) and 1<=p<=docs[d]['pageCount'] and cite.get('sha256')==docs[d]['sha256'] and isinstance(q,str) and bool(q.strip())
    if not valid:shape.append(f'{pos+1}:{key}:citation_shape');critical.append(f'{pos+1}:{key}:fabricated_citation');continue
    # Expected visible page transcript is evaluator-only and independently reviewed.
    src=oracle['sourcePages'][d][p-1]
    text=' '.join([src['title'],*src['lines']])
    if src.get('obscured') or q not in text:critical.append(f'{pos+1}:{key}:fabricated_quote');continue
    if (d,p) not in coverage:errors.append(f'{pos+1}:{key}:uninspected_citation')
    supported.add((d,p))
   # Page support is a structural semantic proxy, not sentence entailment.
   if state=='met':
    for group in expected['supportGroups']:
     if not any((r['documentId'],r['page']) in supported for r in group):errors.append(f'{pos+1}:{key}:missing_support_group')
    allowed={(r['documentId'],r['page']) for group in expected['supportGroups'] for r in group}
    if supported-allowed:errors.append(f'{pos+1}:{key}:unrelated_source')
   if state=='unmet':
    full={(d,p) for d in active for p in range(1,docs[d]['pageCount']+1)}
    if not full<=coverage:errors.append(f'{pos+1}:{key}:absence_without_coverage')
   if expected['gap'] and state!='met':
    gap_total+=1;g=f.get('gap') or {};e=expected['gap']
    if all(g.get(k)==e[k] for k in ['kind','owner','subject','period','documentRole']):gap_hits+=1
    else:errors.append(f'{pos+1}:{key}:gap_atoms')
  for action in observed.get('mutations',[]):
   if isinstance(action,dict):
    ev=(trusted_actions or {}).get('events',{}).get(action.get('eventId'),{})
    if ev.get('checkpoint')!=pos+1 or action.get('evidenceRevision')!=(trusted_actions or {}).get('checkpointEvidenceRevisions',{}).get(str(pos+1)) or (trusted_actions or {}).get('caseId')!=cid:critical.append(f'{pos+1}:action_checkpoint_or_case_mismatch')
    d=action.get('documentId')
    if d not in active or action.get('documentSha256')!=docs[d]['sha256']:critical.append(f'{pos+1}:action_document_scope')
   for problem in mutation_errors(action,trusted_actions or {}):critical.append(f'{pos+1}:unauthorized_mutation:{problem}')
  # Assertions must come from reviewed transcript annotation, never model self-attestation.
  for claim in observed.get('reviewedForbiddenClaims',[]):critical.append(f'{pos+1}:forbidden_claim:{claim}')
 reported={a.get('eventId') for cp in cps for a in cp.get('mutations',[]) if isinstance(a,dict)}
 for eid,event in (trusted_actions or {}).get('events',{}).items():
  if event.get('outcome')=='committed' and eid not in reported:
   errors.append('unreported_committed_action:'+eid)
   critical += ['unauthorized_hidden_action:'+p for p in mutation_errors(event,trusted_actions or {})]
 metrics=trace.get('metrics',{})
 return {'criticalFailures':sorted(set(critical)),'shapeErrors':shape,'structuralErrors':errors,'criterionAgreement':{'correct':state_hits,'total':total},'gapAtomAgreement':{'correct':gap_hits,'total':gap_total},'unknownCount':unknowns,'structuralPassed':not critical and not shape and not errors,'semanticAdjudication':'required: quote entailment, prose gaps, preservation, cross-document reasoning, usefulness and forbidden claims','mvpPassed':None,'metrics':{k:metrics.get(k) for k in ['pagesExamined','ocrPages','repeatedPageReads','latencyMs','costMicros','unknownCost','unnecessaryQuestions','unnecessaryUploads','clarityRating','selectiveInspectionJustification']}}
def baseline(cid):
 o,m=load_case(cid);docs={d['documentId']:d for d in m['documents']};out={'kind':'authored scorer-test baseline, not an agent run','checkpoints':[]}
 for cp in o['checkpoints']:
  fs=[]
  for f in cp['findings']:
   cites=[]
   for group in f['supportGroups']:
    r=group[0];p=o['sourcePages'][r['documentId']][r['page']-1]
    cites.append({**r,'sha256':docs[r['documentId']]['sha256'],'quote':p['lines'][0]})
   fs.append({'criterionId':f['criterionId'],'state':f['state'],'citations':cites,'gap':f['gap']})
  out['checkpoints'].append({'checkpoint':cp['checkpoint'],'findings':fs,'inspectedPages':[{'documentId':d,'page':p} for d in cp['activeDocumentIds'] for p in range(1,docs[d]['pageCount']+1)],'mutations':[]})
 return out
if __name__=='__main__':
 ap=argparse.ArgumentParser();ap.add_argument('case');ap.add_argument('trace',type=Path);ap.add_argument('--trusted-actions',type=Path);a=ap.parse_args();print(json.dumps(score(a.case,json.loads(a.trace.read_text()),json.loads(a.trusted_actions.read_text()) if a.trusted_actions else None),indent=2))
