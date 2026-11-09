"""Export only currently available agent input for a development overlay boundary."""
import json,argparse,shutil,hashlib
from pathlib import Path
from score_overlay import load
ROOT=Path(__file__).resolve().parents[1]
def export_overlay(oid,boundary,dest):
 if oid not in json.loads((ROOT/'overlays/index.json').read_text())['overlays']:raise ValueError('unknown overlay')
 oracle=load(oid)
 scenario=json.loads((ROOT/'overlays'/oid/'scenario.json').read_text())
 if scenario['baseCase']!=oracle['baseCase']:raise ValueError('Case binding mismatch')
 inputs=scenario['inputs'];ids=[x['boundaryId'] for x in inputs]
 if boundary not in ids:raise ValueError('unknown boundary')
 if dest.exists():raise ValueError('destination must be new')
 current=inputs[ids.index(boundary)];expected=next(b['expected'] for b in oracle['boundaries'] if b['boundaryId']==boundary)
 if current['evidenceRevision']!=expected['evidenceRevision']:raise ValueError('Revision binding mismatch')
 if {d['documentId'] for d in current['savedFiles'] if d['activity']=='active'}!=set(expected['activeDocumentIds']):raise ValueError('Active binding mismatch')
 if {d['documentId'] for d in current['savedFiles'] if d['activity']=='superseded'}!=set(expected['inactiveDocumentIds']):raise ValueError('Inactive binding mismatch')
 if len(current['savedFiles'])!=len(expected['activeDocumentIds'])+len(expected['inactiveDocumentIds']):raise ValueError('Inventory binding mismatch')
 if {d['documentId'] for d in current['pendingUploads']}!=set(expected['pendingUploadIds']):raise ValueError('Pending binding mismatch')
 base=ROOT/'corpus/development'/scenario['baseCase'];dest.mkdir(parents=True)
 shutil.copyfile(base/'agent/request.json',dest/'request.json')
 (dest/'inventory.json').write_text(json.dumps(current,indent=2)+'\n')
 # Pending uploads are metadata only; historical superseded documents are marked and retained.
 for d in current['savedFiles']:
  source=base/'files'/d['filename'];assert hashlib.sha256(source.read_bytes()).hexdigest()==d['sha256'];shutil.copyfile(source,dest/d['filename'])
 return dest
if __name__=='__main__':
 ap=argparse.ArgumentParser();ap.add_argument('overlay');ap.add_argument('boundary');ap.add_argument('destination',type=Path);a=ap.parse_args();print(export_overlay(a.overlay,a.boundary,a.destination))
