"""Offline deterministic authoring. Entire module is evaluator-private, never an agent input."""
import argparse, hashlib, io, json, textwrap, shutil
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parents[1]
def dump(p,x):
 p.parent.mkdir(parents=True,exist_ok=True); p.write_text(json.dumps(x,indent=2,sort_keys=True)+'\n')
def sha(b): return hashlib.sha256(b).hexdigest()
CRITERIA={
'R1.identity':'Rent roll identifies the declared property and reporting date 2026-09-30.',
'R1.units':'Roll includes all declared units, tenants, monthly rents and lease start/end dates.',
'R2.leases':'Executed-copy evidence for each declared occupied unit, identifying parties, property, rent and term.',
'R2.chain':'Applicable lease amendments are supplied; an explicit no-amendments declaration resolves applicability only.',
'R2.compare':'Explain material lease/roll differences using the applicable document chain; unresolved contradictions remain uncertain.',
'R3.year':'Actual operating results for the declared property, 2025-01-01 through 2025-12-31.',
'R3.current':'Actual operating results for the declared property, 2026-01-01 through 2026-09-30.',
'R3.compare':'Compare contractual rent with reported rental income on stated bases; explain material differences without assuming error.',
'R4.july':'Complete July 2026 statement for the declared borrower account and holder.',
'R4.august':'Complete August 2026 statement for the declared borrower account and holder.',
'R4.september':'Complete September 2026 statement for the declared borrower account and holder.',
'R5.formation':'Formation certificate identifies the declared borrower.',
'R5.governing':'Operating agreement and all declared applicable entity amendments are supplied.',
'R5.consistency':'Ownership totals 100%; current manager and signing provisions are consistent across supplied entity documents. Unclear legal authority goes to lender.'}
POLICY={'version':'CRE-E2E-policy.1','reviewDate':'2026-10-15','transaction':'income-producing commercial real estate refinance','criteria':CRITERIA,'requests':['Current rent roll','Leases and applicable amendments','Property operating statements','Borrower bank statements','Entity ownership and signing authority'],'rules':['Authored fictional test policy, not general lending law.','Completion is qualifying documentary evidence only; not acceptance, authenticity, enforceability, submission readiness or approval.','Executed-copy evidence means both fictional party signature marks and dates appear; never authenticate them.','All declared units are occupied. Only the declared account is requested. Formation certificate and operating agreement are requested for every LLC.','All rent differences are material for these authored cases. Operating income is accrual base rent; bank deposits may differ and do not replace operating results.','No amendment applicability requires explicit borrower declaration; a declaration does not replace an applicable amendment.','State met/unmet/unknown per criterion. Mixed states express partial satisfaction; public assessment is appears_complete/incomplete/unknown.','No automatic linking, deletion, submission, lender messaging, or authority decisions.']}
# Distinct packages, layout families and paths are allocated before bytes are generated.
CASES=[
('D01','Aster Quay','Mira Fen','Sol Venn',2,'plain','gradual'),
('D02','Brindle Arcade','Tavi Orr','Nela Kest',2,'plain','bank_gap'),
('D03','Copper Finch','Ivo Pell','Runa Dax',2,'plain','amendment'),
('D04','Dapple Works','Elin Vos','Pax Neri',2,'plain','wrong_entity'),
('D05','Ember Landing','Oren Valee','Lysa Quill',2,'plain','wrong_period'),
('D06','Fable Yard','Zena Tor','Bram Uli',2,'plain','long'),
('D07','Garnet Walk','Nori Fenn','Eris Tarn',2,'plain','scan'),
('D08','Hollowmere','Vela Rusk','Ari Noll',2,'plain','authority'),
('H01','Juniper Loom','Kira Mott','Davi Senn',3,'ledger','merged'),
('H02','Kestrel Basin','Fenn Arlo','Zuri Hask',4,'folio','quarter'),
('H03','Lumen Forge','Mavi Esk','Olin Raye',3,'cards','two_amendments'),
('H04','Mossglass Court','Tera Nix','Uvo Renn',4,'memo','conflict_long')]

def pdf(pages,layout):
 out=io.BytesIO(); c=canvas.Canvas(out,pagesize=(612,792),invariant=1,pageCompression=1)
 for n,p in enumerate(pages,1):
  lines=[]
  for line in p['lines']: lines+=textwrap.wrap(line,83 if layout=='plain' else 72) or ['']
  assert len(lines)<36
  if p.get('scan'):
   im=Image.new('RGB',(1224,1584),'#f3f1ec'); d=ImageDraw.Draw(im)
   font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Courier New.ttf',23)
   for j,line in enumerate(['SYNTHETIC - FICTIONAL DOCUMENT',p['title']]+lines+[f'File page {n} of {len(pages)}']): d.text((90,90+j*36),line,fill='black',font=font)
   if p.get('obscured'): d.rectangle((86,155,1160,560),fill='#333333')
   c.drawImage(ImageReader(im),0,0,612,792)
  else:
   color={'plain':(.10,.22,.29),'ledger':(.20,.32,.22),'folio':(.29,.18,.36),'cards':(.15,.29,.39),'memo':(.34,.24,.12)}[layout]
   c.setFillColorRGB(*color); c.rect(0,700,612,92,fill=1,stroke=0); c.setFillColorRGB(1,1,1)
   c.setFont('Helvetica',9); c.drawString(42,764,'SYNTHETIC - FICTIONAL DOCUMENT')
   c.setFont('Helvetica-Bold',16); c.drawString(42,730,p['title'][:60])
   c.setFillColorRGB(0,0,0); c.setFont('Courier' if layout=='ledger' else 'Times-Roman' if layout in ['folio','memo'] else 'Helvetica',11)
   y=674
   for line in lines:
    c.drawString(45 if layout!='cards' else 62,y,line); y-=17
   c.setFont('Helvetica',9); c.drawString(42,27,f'File page {n} of {len(pages)} | Fictional evaluation copy')
  c.showPage()
 c.save(); return out.getvalue()

def build_case(spec,index,dest):
 cid,prop,manager,other,units,layout,mode=spec; split='development' if cid[0]=='D' else 'holdout'
 base=dest/split/cid; borrower=prop+' Holdings LLC'; account=str(7300+index*17); rents=[1800+index*137+j*240 for j in range(units)]
 tenants=[prop.split()[0]+' '+x for x in ['Studio','Supply','Atelier','Market'][:units]]
 amendment=mode in ['amendment','two_amendments']; count=2 if mode=='two_amendments' else 1 if amendment else 0
 current=list(rents); current[0]+=count*125
 facts={'property':prop,'borrower':borrower,'manager':manager,'otherOwner':other,'accountSuffix':account,'units':[str(101+j) for j in range(units)],'tenants':tenants,'baseRents':rents,'currentRents':current,'leaseAmendments':count,'entityAmendments':1 if mode in ['authority','conflict_long'] else 0}
 docs={}; sources={}; roles={}; serial=0
 def page(title,*lines,**kw): return dict(title=title,lines=list(lines),**kw)
 def add(role,pages):
  nonlocal serial
  serial+=1; did='f'+sha(f'{cid}/{serial}'.encode())[:12]; b=pdf(pages,layout); path=base/'files'/f'{did}.pdf'; path.parent.mkdir(parents=True,exist_ok=True); path.write_bytes(b)
  docs[did]={'documentId':did,'filename':f'{did}.pdf','sha256':sha(b),'pageCount':len(pages),'version':1,'seriesId':did,'path':str(path.relative_to(dest))}
  sources[did]=pages; roles[role]=did; return did
 def ref(d,p=1): return {'documentId':d,'page':p}
 def rr():
  return page('Occupancy schedule',f'Property: {prop}. Owner: {borrower}. Reporting date: 2026-09-30.',*[f'Unit {101+j}: {tenants[j]}; monthly base rent USD {current[j]}; lease 2025-01-01 to 2029-12-31.' for j in range(units)])
 roll=add('roll',[rr()])
 leasepages=[]
 for j in range(units):
  leasepages.append(page('Lease instrument',f'Lease {cid}-{101+j}. Property: {prop}; unit {101+j}.',f'Landlord: {borrower}; tenant: {tenants[j]}.',f'Term: 2025-01-01 to 2029-12-31. Monthly base rent USD {rents[j]}.',f'Landlord signature: /s/ {manager}, manager; dated 2024-12-20.',f'Tenant signature: /s/ {other}, authorized tenant representative; dated 2024-12-20.','Signature marks are fictional; this is an executed-copy simulation.'))
 if mode in ['long','conflict_long']:
  filler=[page('Lease operating provision',f'Property: {prop}. Lease appendix section {j}.',f'Premises maintenance: tenant keeps interior fixtures in orderly condition. Section {j} covers routine notice and inspection scheduling.','This provision does not change rent, term, parties or signing provisions.') for j in range(1,30)]
  leasepages=[page('Lease collection contents','Pages 2-30: operating provisions.',f'Pages 31-{30+units}: lease parties, economics and execution pages.','Contents identifies locations only; inspect the cited evidence.')]+filler+leasepages
 if mode in ['scan','quarter']: leasepages[-1]['scan']=True
 leases=add('leases',leasepages); lease_refs=[ref(leases,len(leasepages)-units+j+1) for j in range(units)]
 amend=[]
 for j in range(count):
  amend.append(add(f'amend{j}',[page('Lease amendment',f'Lease {cid}-101. Property: {prop}; unit 101; landlord {borrower}; tenant {tenants[0]}.',f'Amendment {j+1}, effective 2026-0{4+j*3}-01: monthly base rent becomes USD {rents[0]+125*(j+1)}.',f'Other terms unchanged. Landlord /s/ {manager}; tenant /s/ {other}; both dated 2026-0{3+j*3}-20.')]))
 income2025=sum(rents)*12; income2026=sum(rents)*9+(750 if count==1 else 1125 if count==2 else 0)
 def ops(period,income,budget=False):
  return page('Property operating report',f'Property: {prop}. Owner: {borrower}. Period: {period}.',f'Basis: accrual. {"BUDGET ONLY - projected, not actual" if budget else "ACTUAL RESULTS"}.',f'Rental income USD {income}; other income USD 0.',f'Operating expenses USD {income//3}; NOI USD {income-income//3}.','Income is base rent earned; no vacancies, concessions or other rent adjustments.', 'Cash deposits in bank statements are not a measure of accrual income.')
 annual=add('annual',[ops('2025-01-01 to 2025-12-31',income2025)])
 ytd=add('current',[ops('2026-01-01 to 2026-09-30',income2026)])
 bank=[]
 def bankpages(month,holder=borrower):
  return [page('Account statement',f'Holder: {holder}. Fictional bank: Paper Lantern Test Bank. Account ending {account}.',f'Statement month: 2026-{month:02d}. Statement page 1 of 2.', f'Opening USD {50000+(month-7)*3000}; deposits USD 12000; withdrawals USD 9000; closing USD {53000+(month-7)*3000}.'),page('Account activity',f'Holder: {holder}. Account ending {account}. Statement month: 2026-{month:02d}. Statement page 2 of 2.','Deposits: transfers USD 12000. Withdrawals: operating payments USD 9000.','End of statement. Deposits are transfers, not rent receipts.')]
 for m in [7,8,9]: bank.append(add(f'bank{m}',bankpages(m)))
 formation=add('formation',[page('Certificate of formation',f'Entity: {borrower}. Entity type: limited liability company.',f'Formed 2024-10-01. Organizer: {manager}. Fictional registry reference {cid}-REG.','This document establishes the named entity; it does not itself establish current manager authority.')])
 governing=add('governing',[page('Operating agreement',f'Entity: {borrower}. Effective 2024-10-01.',f'Members: {manager} 60%; {other} 40%. Total ownership 100%.',f'Manager: {manager}. Manager may execute refinancing documents for this company.',f'Member signature /s/ {manager}; member signature /s/ {other}; dated 2024-10-01.')])
 authority=None
 if mode in ['authority','conflict_long']:
  authority=add('entity_amendment',[page('Operating agreement amendment',f'Entity: {borrower}. Amendment 1 effective 2026-09-01.',f'Members remain {manager} 60%; {other} 40%.',f'Manager is now {other}. Prior manager {manager} remains proposed refinance signer.', 'Signing authority of the former manager for this refinance is not specified.',f'Member /s/ {manager}; member /s/ {other}; dated 2026-09-01.')])
 # File packaging differs materially in holdout, including joined evidence and page roles.
 if mode=='merged':
  joined=add('income_bundle',[page('Income binder contents','Page 2: rent roll. Pages 3-5: leases. Page 6: prior year. Page 7: current period.'),rr()]+leasepages+[ops('2025-01-01 to 2025-12-31',income2025),ops('2026-01-01 to 2026-09-30',income2026)])
  roll=leases=annual=ytd=joined; lease_refs=[ref(joined,j+3) for j in range(units)]; roll_refs=[ref(joined,2)]; year_refs=[ref(joined,6)]; ytd_refs=[ref(joined,7)]
 else: roll_refs=[ref(roll)]; year_refs=[ref(annual)]; ytd_refs=[ref(ytd)]
 if mode=='quarter':
  qp=[page('Quarterly account archive','July: pages 2-3; August: pages 4-5; September: pages 6-7.')]+sum([bankpages(m) for m in [7,8,9]],[])
  qp[4]['scan']=True; quarter=add('quarter_archive',qp); bank=[quarter]*3; bankrefs=[[ref(quarter,2+i*2),ref(quarter,3+i*2)] for i in range(3)]
 else: bankrefs=[[ref(d,1),ref(d,2)] for d in bank]
 support={'R1.identity':roll_refs,'R1.units':roll_refs,'R2.leases':lease_refs,'R2.chain':[ref(d) for d in amend], 'R2.compare':roll_refs+lease_refs+[ref(d) for d in amend],'R3.year':year_refs,'R3.current':ytd_refs,'R3.compare':roll_refs+lease_refs+year_refs+ytd_refs+[ref(d) for d in amend], 'R4.july':bankrefs[0],'R4.august':bankrefs[1],'R4.september':bankrefs[2], 'R5.formation':[ref(formation)],'R5.governing':[ref(governing)]+([ref(authority)] if authority else []),'R5.consistency':[ref(governing)]+([ref(authority)] if authority else [])}
 allgood=list(dict.fromkeys([roll,leases,annual,ytd,*bank,formation,governing,*amend]+([authority] if authority else [])))
 declaration=f'I declare all {units} units occupied by the tenants listed; only account ending {account} is requested. There are {count} lease amendments and {facts["entityAmendments"]} entity amendments.'
 turns=[]
 def turn(files,text,**kw): turns.append({'uploadIds':list(dict.fromkeys(files)),'borrowerText':text,**kw})
 if mode=='merged':
  turn([formation,governing],declaration+' I have the company records first.');turn([bank[0],bank[2]],'Here are two monthly statements.');turn([roll,bank[1]],'Here is the income binder and remaining statement.')
 elif mode=='quarter':
  turn([bank[0],annual],declaration+' Can this quarterly archive cover the months?');turn([governing,formation,roll],'Here is the roll and company paperwork.');turn([leases,ytd],'Here are the remaining operating and lease records.')
 elif mode in ['amendment','two_amendments']:
  turn([roll,leases,annual,ytd],declaration+' I will look for the amendments.');turn([*bank,formation,governing], 'I think the rent changed; I do not recall when.' if mode=='amendment' else 'Company records and statements are attached; I found amendment 2 too.', **{})
  if mode=='two_amendments': turns[-1]['uploadIds'].append(amend[1])
  turn(amend,'These are all the declared lease amendments. Please compare the effective dates.')
 elif mode=='bank_gap':
  incomplete=add('bank_partial',bankpages(8)[:1]); duplicate=add('duplicate',sources[bank[0]]); docs[duplicate]['duplicateOf']=bank[0]
  turn([roll,leases,annual,ytd,bank[0],incomplete],declaration+' These are the files I found.');turn([duplicate,formation,governing,bank[2]],'I renamed one statement. Does that finish the missing month?');turn([bank[1]],'Here is the complete August statement.',supersedes={incomplete:bank[1]})
 elif mode=='wrong_entity':
  wrong=add('wrong_holder',bankpages(8,'Stray Orchard Services LLC'))
  turn([roll,leases,annual,ytd,*[bank[0],wrong,bank[2]]],declaration);turn([formation,governing],'That August file belongs to another company. Do not match it to my bank request.',rejectedMatches=[{'documentId':wrong,'requirementId':'R4'}]);turn([bank[1]],'Here is the correct account statement.')
 elif mode=='wrong_period':
  wrong=add('old_period',[ops('2024-01-01 to 2024-12-31',income2025)]); budget=add('budget',[ops('2026-01-01 to 2026-09-30',income2026,True)])
  turn([roll,leases,wrong,budget],declaration);turn([*bank,formation,governing,annual],'Here is last year and the other records.');turn([ytd],'Here are the actual current-year results.')
 elif mode=='scan':
  badpages=[dict(p) for p in leasepages];badpages[-1]=dict(badpages[-1],scan=True,obscured=True);bad=add('obscured',badpages)
  turn([roll,bad,annual,ytd],declaration);turn([*bank,formation,governing],'I cannot read that copy either.');turn([leases],'Here is the clearer copy.',supersedes={bad:leases})
 elif mode=='conflict_long':
  turn([governing,formation,*bank],declaration+' I am the proposed signer.');turn([roll,leases,annual], 'I also found a later company amendment.', **{});turn([authority,ytd],'The amendment changes the manager; I have no further authority documents.')
 else:
  turn([roll,annual],declaration);turn([leases,ytd,*bank], 'Here are leases, current results and statements.');turn([formation,governing]+([authority] if authority else []),'Here is the company file.'+(' I have no further authority evidence.' if authority else ''))
 # Author per-checkpoint oracle; no generator/source/transcript data exported to agent.
 available=[]; checkpoints=[]; aliases={}
 for tno,t in enumerate(turns,1):
  available+=t['uploadIds']; available=list(dict.fromkeys(available))
  for old,new in t.get('supersedes',{}).items():
   if old in available: available.remove(old)
  findings=[]
  for crit,refs in support.items():
   missing=[r for r in refs if r['documentId'] not in available]
   state='unmet' if missing else 'met'; reason='Required documentary component is not yet supplied.' if missing else 'Supplied evidence covers the criterion.'
   owner='borrower'; kind='missing_evidence' if missing else None
   if crit=='R2.chain' and count==0: reason='Borrower explicitly declares no lease amendments; no amendment upload applies.'
   if crit in ['R2.compare','R3.compare'] and missing:
    state='unknown';kind='clarification';reason='Comparison cannot yet be completed; required comparison sources are not supplied.'
   if amendment and crit in ['R2.compare','R3.compare'] and any(d not in available for d in amend): reason='Current roll differs from original lease; applicable amendment effective dates are not fully documented. Neither source is presumed wrong.'
   if mode=='scan' and roles.get('obscured') in available and crit=='R2.leases':state='unknown';kind='unreadable';reason='Last tenant execution page is obscured; request a clearer copy, not a new lease.'
   if crit=='R5.consistency' and authority and authority not in available and governing in available:state='unknown';kind='clarification';reason='Declared entity amendment is not supplied; current manager and signing provisions cannot yet be reconciled.'
   if mode=='scan' and roles.get('obscured') in available and crit in ['R2.compare','R3.compare']:state='unknown';kind='unreadable';reason='Lease collection is supplied, but the last tenant page is obscured; comparison remains uncertain pending a clearer copy.'
   if crit=='R5.consistency' and authority in available:state='unknown';kind='lender_decision';owner='lender';reason='Amendment names a new manager; authority of former manager as proposed signer is unclear. Lender must resolve.'
   if mode=='bank_gap' and crit=='R4.august' and bank[1] not in available:reason='August statement page 2 of 2 is missing.'+(' July duplicate cannot supply August.' if roles['duplicate'] in available else '')
   if mode=='wrong_entity' and crit=='R4.august' and bank[1] not in available:reason='August upload has a different holder; correct borrower account August statement remains missing.'
   if mode=='wrong_period' and crit in ['R3.year','R3.current'] and missing:reason='2025 actual full-year statement required; supplied 2024 report does not qualify.' if crit=='R3.year' else 'Current-year actual results required; budget is not actual results.'
   validrefs=[r for r in refs if r['documentId'] in available]
   if crit=='R5.consistency' and authority in available: validrefs=refs
   if mode=='scan' and roles.get('obscured') in available and crit in ['R2.leases','R2.compare','R3.compare']:validrefs.append(ref(roles['obscured'],1))
   groups=[[r] for r in validrefs]
   if mode=='bank_gap' and roles['duplicate'] in available:
    for group in groups:
     if group[0]['documentId']==bank[0]:group.append(ref(roles['duplicate'],group[0]['page']))
   findings.append({'criterionId':crit,'state':state,'reason':reason,'gap':None if state=='met' else {'kind':kind,'owner':owner,'subject':borrower if crit.startswith(('R4','R5')) else prop,'period': {'R4.july':'2026-07','R4.august':'2026-08','R4.september':'2026-09'}.get(crit) if crit.startswith('R4') else None if crit.startswith('R5') else '2025-01-01/2025-12-31' if crit=='R3.year' else '2026-01-01/2026-09-30' if crit.startswith('R3') else '2026-09-30','documentRole':CRITERIA[crit],'description':reason},'assertionSupport':[{'turn':1,'field':'borrowerText','quote':declaration,'scope':'amendment applicability only'}] if crit=='R2.chain' and count==0 else [],'supportGroups':groups,'supportFacts':[{'documentId':r['documentId'],'page':r['page'],'visibleLines':sources[r['documentId']][r['page']-1]['lines'],'semanticRule':CRITERIA[crit]} for r in validrefs],'absenceCoverage':{'inventory':available.copy(),'rule':'For global absence inspect every supplied active page; targeted missing-page finding also requires explicit statement pagination. Uninspected evidence supports uncertainty, never confident absence.'} if state=='unmet' else None,'missingDocumentIds':sorted(set(r['documentId'] for r in missing))})
  if mode=='two_amendments' and tno==2:
   alternative=next(f for f in findings if f['criterionId']=='R2.compare')
   alternative['allowedStates']=['unknown','met']
   alternative['alternativeRationale']='Amendment 2 explicitly sets current rent and can explain the current roll. Amendment 1 remains missing for complete chain and historical YTD comparison; retain those gaps. A conservative unknown pending the complete chain is also defensible.'
  checkpoints.append({'checkpoint':tno,'activeDocumentIds':available.copy(),'findings':findings,'forbiddenClaims':['lender accepted','loan approved','signature authenticated','legally enforceable','ready to submit','deleted rejected file','automatic linking enabled'],'expectedBehavior':['Explain arrivals and their supported requests.','Describe partial support and precise remaining pieces.','Preserve earlier supported findings unless relevant evidence changed.','Give focused next actions with borrower/lender/operator ownership.'],'correction':t.get('supersedes',{}),'rejectedMatches':t.get('rejectedMatches',[])})
 # All actual sources recorded for audit, including unused complete variants, but unavailable files stay outside agent export.
 dump(base/'agent'/'request.json',{'schemaVersion':'borrower-e2e-input.1','policy':POLICY,'application':{k:facts[k] for k in ['property','borrower','manager','accountSuffix','units']},'initialMessage':turns[0]['borrowerText']})
 dump(base/'private'/'simulator.json',{'facts':facts,'turns':turns,'availableFileIds':list(docs),'disclosureRules':['Initial declaration is public. Release only current turn files and message.','Advance after agent response or a focused relevant request; equivalent question wording is allowed.','If asked about unavailable facts say I do not know; never invent files, waivers, signatures or authority.','If an earlier turn question is repeated, repeat the same answer and record unnecessaryQuestion.','Do not reveal oracle, expected states, internal modes, future files or complete catalog.','At each upload or reply capture an agent checkpoint. Tool order and wording are unconstrained.','After final turn no additional files exist. A lender or operator obligation remains unresolved.'],'allowedQuestionTopics':['missing requested period or page','lease amendment dates','unclear scan','manager authority','document identity'],'budgetInterrupt':{'eligible':mode in ['long','conflict_long'],'trigger':'Evaluator may pause after document identification before deep evidence inspection.','expected':'Retain supported findings; mark uninspected criteria unknown and operator-owned reading limit; resume with prior observations.','noForcedToolOrder':True}})
 dump(base/'private'/'oracle.json',{'version':'CRE-E2E-oracle.1','status':'provisional','checkpoints':checkpoints,'sourcePages':sources,'roles':roles,'crossDocumentArithmetic':{'annualBaseRent':income2025,'currentPeriodBaseRent':income2026,'currentMonthlyRent':sum(current),'calculation':'2025: sum original monthly rents *12. 2026: original *9 plus amendment 1 uplift for April-September and amendment 2 uplift for July-September when applicable.'},'semanticReviewRequired':True})
 dump(base/'manifest.json',{'datasetVersion':'1.0.0','caseId':cid,'split':split,'mode':mode,'layoutFamily':layout,'leakageGroup':cid,'synthetic':True,'provenance':'Fictional facts authored from scratch; no private source bytes or excerpts. Shared domain families only.','documents':list(docs.values()),'status':'provisional'})
 return {'caseId':cid,'split':split,'mode':mode,'layout':layout,'documents':len(docs),'checkpoints':len(turns)}
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--output',type=Path,required=True);a=ap.parse_args()
 if a.output.exists():raise SystemExit('Refusing existing output; use a new directory and compare manifests.')
 a.output.mkdir(parents=True);dump(a.output/'policy.json',POLICY)
 cases=[build_case(s,i,a.output) for i,s in enumerate(CASES,1)];dump(a.output/'index.json',{'version':'1.0.0','cases':cases})
 files={str(p.relative_to(a.output)):sha(p.read_bytes()) for p in sorted(a.output.rglob('*')) if p.is_file() and p.relative_to(a.output).parts[0]=='holdout'}
 dump(a.output/'holdout.freeze.json',{'version':'1.0.0','purpose':'Frozen synthetic generalization; if outcomes drive tuning, retire and replace.','files':files})
 print(json.dumps({'cases':len(cases),'documents':sum(c['documents'] for c in cases)}))
if __name__=='__main__': main()
