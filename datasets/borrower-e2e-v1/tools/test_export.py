import unittest,tempfile,json,hashlib
from pathlib import Path
from export_checkpoint import export,ROOT
class ExportTests(unittest.TestCase):
 def test_all_checkpoints_are_allowlisted(self):
  index=json.loads((ROOT/'corpus/index.json').read_text())
  for c in index['cases']:
   base=ROOT/'corpus'/c['split']/c['caseId'];sim=json.loads((base/'private/simulator.json').read_text())
   for n in range(1,c['checkpoints']+1):
    with tempfile.TemporaryDirectory() as tmp:
     out=export(c['caseId'],n,Path(tmp)/'input');docs=json.loads((out/'documents.json').read_text());expected={d for t in sim['turns'][:n] for d in t['uploadIds']}
     self.assertEqual({d['documentId'] for d in docs},expected)
     self.assertEqual({p.name for p in out.iterdir()},{'request.json','messages.json','documents.json'}|{d['filename'] for d in docs})
     for d in docs:self.assertEqual(hashlib.sha256((out/d['filename']).read_bytes()).hexdigest(),d['sha256'])
     self.assertNotIn('oracle',json.dumps(json.loads((out/'request.json').read_text())))
 def test_refuses_existing_destination(self):
  with tempfile.TemporaryDirectory() as tmp:
   with self.assertRaises(ValueError):export('D01',1,Path(tmp))
 def test_rejects_future_turn(self):
  with tempfile.TemporaryDirectory() as tmp:
   with self.assertRaises(ValueError):export('D01',4,Path(tmp)/'input')
if __name__=='__main__':unittest.main()
