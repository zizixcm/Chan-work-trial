"""Provider-free byte, extraction, locator, split and freeze validation; renders every PDF."""
import json,hashlib,subprocess,argparse
from pathlib import Path
from pypdf import PdfReader
from PIL import Image,ImageOps,ImageDraw
import pypdfium2 as pdfium
ROOT=Path(__file__).resolve().parents[1]
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--corpus',type=Path,default=ROOT/'corpus');ap.add_argument('--render',action='store_true');a=ap.parse_args();root=a.corpus
 index=json.loads((root/'index.json').read_text());assert len(index['cases'])==12
 assert sum(c['split']=='development' for c in index['cases'])==8
 checks=0;pages=0;scans=0;hashes={};native={}
 for case in index['cases']:
  base=root/case['split']/case['caseId'];m=json.loads((base/'manifest.json').read_text());o=json.loads((base/'private/oracle.json').read_text());s=json.loads((base/'private/simulator.json').read_text())
  docs={d['documentId']:d for d in m['documents']};thumbs=[]
  for did,d in docs.items():
   path=root/d['path'];assert digest(path)==d['sha256'];r=PdfReader(path);assert len(r.pages)==d['pageCount'];pages+=len(r.pages)
   assert d['sha256'] not in hashes or hashes[d['sha256']]==case['split'],'cross-split duplicate';hashes[d['sha256']]=case['split']
   native[did]=[]
   for i,p in enumerate(r.pages):
    text=p.extract_text() or '';native[did].append(text);spec=o['sourcePages'][did][i]
    if spec.get('scan'):assert not text.strip();scans+=1
    else:
     normalized=' '.join(text.split())
     for line in spec['lines']:assert ' '.join(line.split()) in normalized,(did,i,line)
    checks+=1
   if a.render:
    target=ROOT/'review'/'renders'/case['caseId']/did;target.parent.mkdir(parents=True,exist_ok=True)
    rendered=pdfium.PdfDocument(path)
    for page_no in range(len(rendered)):
     img=rendered[page_no].render(scale=1.2).to_pil();img.save(str(target)+f'-{page_no+1:02d}.png')
    rendered.close()
    for p in sorted(target.parent.glob(did+'-*.png')):
     im=Image.open(p).convert('RGB');im.thumbnail((200,260));tile=Image.new('RGB',(220,290),'white');tile.paste(im,((220-im.width)//2,5));ImageDraw.Draw(tile).text((5,270),p.stem,fill='black');thumbs.append(tile)
  for cp in o['checkpoints']:
   assert len(cp['findings'])==14; assert len({f['criterionId'] for f in cp['findings']})==14
   for f in cp['findings']:
    assert f['state'] in ['met','unmet','unknown']
    for g in f['supportGroups']:
     for r in g:assert r['documentId'] in cp['activeDocumentIds'] and 1<=r['page']<=docs[r['documentId']]['pageCount']
    if f['state']=='met':assert not f['missingDocumentIds']
  if a.render:
   for offset in range(0,len(thumbs),20):
    group=thumbs[offset:offset+20];sheet=Image.new('RGB',(1100,290*((len(group)+4)//5)),'#cccccc')
    for i,im in enumerate(group):sheet.paste(im,((i%5)*220,(i//5)*290))
    sheet.save(ROOT/'review'/f'{case["caseId"]}-contact-{offset//20+1}.png')
  out=ROOT/'review'/'extracted'/f'{case["caseId"]}.json';out.parent.mkdir(exist_ok=True,parents=True);out.write_text(json.dumps({did:native[did] for did in docs},indent=2)+'\n')
 frozen=json.loads((root/'holdout.freeze.json').read_text())
 actual={str(p.relative_to(root)):digest(p) for p in (root/'holdout').rglob('*') if p.is_file()}
 assert frozen['files']==actual,'frozen holdout changed'
 result={'cases':12,'documents':sum(c['documents'] for c in index['cases']),'pages':pages,'scanPages':scans,'nativePageChecks':checks,'freeze':'pass','crossSplitExactDuplicates':0,'rendered':a.render,'semanticReview':'separate independent review required'}
 (ROOT/'review'/'validation.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
if __name__=='__main__':main()
