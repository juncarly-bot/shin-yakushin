"""Validate staged official VVMs; generate packaged content hashes. Does not download."""
import json,zipfile,hashlib
from html.parser import HTMLParser
class NoticeText(HTMLParser):
 def __init__(self):super().__init__();self.skip=0;self.parts=[]
 def handle_starttag(self,tag,attrs):
  if tag in ('script','style'):self.skip+=1
 def handle_endtag(self,tag):
  if tag in ('script','style'):self.skip=max(0,self.skip-1)
 def handle_data(self,data):
  if not self.skip and data.strip():self.parts.append(data.strip())
def notice(p):
 text=p.read_text(errors='replace')
 if p.suffix=='.html':
  parser=NoticeText();parser.feed(text);text='\n'.join(parser.parts)
 return '\n--- '+str(p.name)+' ---\n'+text

from pathlib import Path
root=Path(__file__).resolve().parents[1]/'app/src/main'
assets=root/'assets/voicevox'
def digest(p):
 with p.open('rb') as f: return hashlib.file_digest(f,'sha256').hexdigest()
def verify():
 for filename,name,expected in [('15.vvm','小夜/SAYO',{46:'ノーマル'}),('11.vvm','ナースロボ＿タイプＴ',{47:'ノーマル',48:'楽々',49:'恐怖',50:'内緒話'})]:
  with zipfile.ZipFile(assets/filename) as z:
   manifest=json.loads(z.read('manifest.json'))
   meta=json.loads(z.read(manifest['metas_filename']))
   match=next(x for x in meta if x['name']==name)
   styles={x['id']:x['name'] for x in match['styles']}
   for i,label in expected.items():
    if styles.get(i)!=label: raise ValueError(f'{filename}: mismatched style {i}')
  print(filename,name,expected,'SHA-256',digest(assets/filename))
 for required in ['dict/sys.dic','dict/unk.dic','dict/matrix.bin','dict/char.bin','dict/left-id.def','dict/right-id.def','dict/rewrite.def','dict/pos-id.def']:
  if not (assets/required).is_file(): raise ValueError('missing '+required)
 for component in ['core','onnxruntime','open-jtalk','vvm','sayo','nurse-t']:
  if not (assets/'licenses'/component).is_dir() or not list((assets/'licenses'/component).iterdir()):raise ValueError('missing license notices: '+component)
 for required in ['voicevox/include/voicevox_core.h','jniLibs/arm64-v8a/libvoicevox_core.so','jniLibs/arm64-v8a/libvoicevox_onnxruntime.so']:
  if not (root/required).is_file():raise ValueError('missing '+required)
 notices='\n\n'.join(notice(p) for p in sorted((assets/'licenses').rglob('*')) if p.is_file())
 (root/'assets/licenses.txt').write_text(notices)
 files={str(p.relative_to(assets)):digest(p) for p in sorted(assets.rglob('*')) if p.is_file() and p.name!='manifest.json'}
 (assets/'manifest.json').write_text(json.dumps({'core':'0.17.0','onnxruntime':'1.23.2','files':files},ensure_ascii=False,indent=2))
 print('Bundle metadata and presence checks PASS. Native ABI/SONAME/16KB and license completeness require separate review.')
if __name__=='__main__':verify()
