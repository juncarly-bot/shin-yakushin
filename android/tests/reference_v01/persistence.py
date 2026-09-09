"""SQLite FULL transactions; validated atomic JSON backups and safe recovery."""
import json,sqlite3,os,time,copy
from pathlib import Path
from domain import fresh,validate,UnsupportedSchema
class Store:
 def __init__(self,path):
  self.path=Path(path);self.path.parent.mkdir(parents=True,exist_ok=True);self.recovered=False
  try:
   self.db=sqlite3.connect(self.path,check_same_thread=False)
   if self.db.execute('PRAGMA quick_check').fetchone()[0]!='ok':raise ValueError('DB integrity failed')
   self.db.execute('PRAGMA synchronous=FULL');self.db.execute('CREATE TABLE IF NOT EXISTS state(id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL)')
   row=self.db.execute('SELECT payload FROM state WHERE id=1').fetchone()
   self.state=validate(json.loads(row[0])) if row else fresh()
   if not row:self.save(self.state)
  except UnsupportedSchema:
   self.db.close();raise
  except (sqlite3.DatabaseError,ValueError,KeyError,TypeError):
   try:self.db.close()
   except Exception:pass
   backup=self.path.with_suffix('.backup.json')
   if not backup.exists():raise RuntimeError('保存データを開けません。元ファイルを保持しています。バックアップから復元してください')
   state=validate(json.loads(backup.read_text('utf-8')))
   os.replace(self.path,self.path.with_name(self.path.name+f'.corrupt-{time.time_ns()}'))
   self.db=sqlite3.connect(self.path,check_same_thread=False);self.db.execute('PRAGMA synchronous=FULL');self.db.execute('CREATE TABLE state(id INTEGER PRIMARY KEY CHECK(id=1),payload TEXT NOT NULL)');self.state=state;self.save(state);self.recovered=True
 def backup(self,state,path=None):
  target=Path(path) if path else self.path.with_suffix('.backup.json');tmp=target.with_suffix(target.suffix+'.tmp')
  with open(tmp,'w',encoding='utf-8') as f:json.dump(state,f,ensure_ascii=False,allow_nan=False);f.flush();os.fsync(f.fileno())
  os.replace(tmp,target)
 def save(self,state):
  validate(state)
  with self.db:self.db.execute('INSERT INTO state VALUES(1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',(json.dumps(state,ensure_ascii=False,allow_nan=False),))
  self.state=copy.deepcopy(state)
 def restore(self,data):
  data=validate(copy.deepcopy(data))
  self.backup(self.state,self.path.with_name('before-import-'+str(time.time_ns())+'.json'))
  data['revision']=self.state['revision']+1;self.save(data)
 def close(self):self.backup(self.state);self.db.close()
