"""Independent synthetic matching oracle. Never send oracle.json to the model."""
from pathlib import Path
import hashlib,json,shutil
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[1]/'artifacts/testing/isolated-deployment/matching-fixtures'
ROOT.mkdir(parents=True,exist_ok=True)
requirements=[
 {'id':'M1','title':'April rent roll - Cedar Court','entity':'Cedar Court Holdings LLC','property':'18 Cedar Lane','period':'April 30, 2026','criteria':['Exact property/entity','As of April 30, 2026','Unit, tenant and monthly rent for each unit']},
 {'id':'M2','title':'April B1 bank statement','entity':'Cedar Court Holdings LLC','account':'B1','period':'April 2026','criteria':['Exact entity and account B1','All statement pages for April 2026','Closing cash balance']},
 {'id':'M3','title':'April cash balance evidence','entity':'Cedar Court Holdings LLC','account':'B1','period':'April 30, 2026','criteria':['Exact entity and account B1','Cash balance as of April 30, 2026']},
 {'id':'M4','title':'April rent roll - Cedar Annex','entity':'Cedar Court Holdings LLC','property':'22 Cedar Lane','period':'April 30, 2026','criteria':['Exact property/entity','As of April 30, 2026','Unit, tenant and monthly rent for each unit']},
]
common=['Cedar Court Holdings LLC','18 Cedar Lane','Rent roll as of April 30, 2026','Unit 101 | Synthetic Tenant A | Monthly rent $1250','Unit 102 | Synthetic Tenant B | Monthly rent $1450']
cases=[
 {'id':'C1','file':'package-01.pdf','pages':36,'facts':{1:['Document contents','Property rent schedule: page 32','Other pages: synthetic administrative notes'],32:common},'targets':['M1'],'citationPage':32,'quote':'18 Cedar Lane','reason':'Clear property/entity/period beyond old 12-page limit'},
 {'id':'C2','file':'cedar-current-rent-roll.pdf','pages':1,'facts':{1:['Pine Court Properties LLC','90 Pine Road','Rent roll as of April 30, 2026','Unit 101 | Synthetic Tenant A | Monthly rent $1250']},'targets':[],'citationPage':1,'quote':'Pine Court Properties LLC','reason':'Filename is plausible but entity/property are wrong'},
 {'id':'C3','file':'package-03.pdf','pages':1,'facts':{1:['Cedar Court Holdings LLC','18 Cedar Lane','Rent roll as of March 31, 2026','Unit 101 | Synthetic Tenant A | Monthly rent $1250']},'targets':[],'citationPage':1,'quote':'March 31, 2026','reason':'Wrong exact required period; may suggest M1 with a gap, never auto-link as clear'},
 {'id':'C4','file':'package-04.pdf','pages':2,'facts':{1:['Bank statement page 1 of 2','Cedar Court Holdings LLC','Account B1 | Statement period April 1-30, 2026','Opening cash balance $60000'],2:['Bank statement page 2 of 2','Cedar Court Holdings LLC | Account B1','Closing cash balance as of April 30, 2026: $62000']},'targets':['M2','M3'],'citationPage':2,'quote':'Closing cash balance as of April 30, 2026: $62000','reason':'One document supports two requests'},
 {'id':'C5','file':'package-05.pdf','pages':1,'facts':{1:['Cedar Court Holdings LLC','Property: not specified','Rent roll as of April 30, 2026','Unit 101 | Synthetic Tenant A | Monthly rent $1250']},'targets':[],'citationPage':1,'quote':'Property: not specified','reason':'Ambiguous M1 versus M4; ask which property'},
 {'id':'C6','file':'package-06.pdf','pages':1,'scan':True,'facts':{1:common},'targets':['M1'],'citationPage':1,'quote':'18 Cedar Lane','reason':'Image-only page, actual visual reading required'},
]
font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',27)
for case in cases:
 c=canvas.Canvas(str(ROOT/case['file']),pagesize=(612,792),invariant=1)
 c.setTitle('Synthetic supporting document')
 for page in range(1,case['pages']+1):
  lines=case['facts'].get(page,[f'Administrative notes - sheet {page}','No additional property schedule on this sheet.'])
  if case.get('scan'):
   img=Image.new('RGB',(1224,1584),'white');d=ImageDraw.Draw(img)
   d.text((72,64),'SYNTHETIC EVALUATION DOCUMENT',font=font,fill='black')
   for i,line in enumerate(lines):d.text((72,160+i*64),line,font=font,fill='black')
   d.text((72,1500),f'Page {page} of {case["pages"]}',font=font,fill='black')
   c.drawImage(ImageReader(img),0,0,width=612,height=792)
  else:
   c.setFont('Helvetica-Bold',12);c.drawString(36,752,'SYNTHETIC EVALUATION DOCUMENT')
   c.setFont('Helvetica',11)
   for i,line in enumerate(lines):c.drawString(36,700-i*26,line)
   c.setFont('Helvetica',9);c.drawString(36,32,f'Page {page} of {case["pages"]}')
  c.showPage()
 c.save()
 case['sha256']=hashlib.sha256((ROOT/case['file']).read_bytes()).hexdigest()
shutil.copyfile(ROOT/'package-01.pdf',ROOT/'renamed-record.pdf')
cases.append({'id':'C7','file':'renamed-record.pdf','duplicateOf':'C1','sha256':cases[0]['sha256'],'targets':['M1'],'reason':'Exact renamed duplicate; same evidence identity, no duplicate link/progress'})
cases.append({'id':'C8','file':'package-01.pdf','sha256':cases[0]['sha256'],'targets':[],'precondition':'Borrower explicitly rejected M1 for this document after C1, then retries processing','reason':'Do not recreate rejected link; preserve manual decision'})
(ROOT/'oracle.json').write_text(json.dumps({'version':'deployment-matching.v1','requirements':requirements,'cases':cases,'gate':{'incorrectAutomaticLinks':0,'ambiguousMustAsk':True,'clearPositiveCasesRequired':['C1','C4','C6'],'manualCorrectionsWin':True,'noReadinessClaims':True}},indent=2)+'\n')
print(f'Created {len(cases)-1} PDF fixtures and separate oracle in {ROOT}')
