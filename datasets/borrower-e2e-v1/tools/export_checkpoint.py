"""Explicit allowlist export for a future runner; never export oracle or future files."""
import argparse,json,shutil,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def export(cid,checkpoint,destination):
 base=ROOT/'corpus'/('development' if cid.startswith('D') else 'holdout')/cid
 if destination.exists():raise ValueError('Destination must be new')
 sim=json.loads((base/'private/simulator.json').read_text());manifest=json.loads((base/'manifest.json').read_text())
 if not 1<=checkpoint<=len(sim['turns']):raise ValueError('checkpoint out of range')
 destination.mkdir(parents=True);shutil.copyfile(base/'agent/request.json',destination/'request.json')
 history=[];released=set()
 for t in sim['turns'][:checkpoint]:
  history.append({k:t[k] for k in ['borrowerText','uploadIds','supersedes','rejectedMatches'] if k in t});released.update(t['uploadIds'])
 docs=[]
 for d in manifest['documents']:
  if d['documentId'] not in released:continue
  source=ROOT/'corpus'/d['path'];assert hashlib.sha256(source.read_bytes()).hexdigest()==d['sha256']
  shutil.copyfile(source,destination/d['filename']);docs.append({k:d[k] for k in ['documentId','filename','sha256','pageCount','seriesId','version']})
 (destination/'messages.json').write_text(json.dumps(history,indent=2)+'\n');(destination/'documents.json').write_text(json.dumps(docs,indent=2)+'\n')
 return destination
if __name__=='__main__':
 ap=argparse.ArgumentParser();ap.add_argument('case');ap.add_argument('checkpoint',type=int);ap.add_argument('destination',type=Path);a=ap.parse_args();print(export(a.case,a.checkpoint,a.destination))
