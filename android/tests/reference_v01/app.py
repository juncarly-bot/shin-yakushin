#!/usr/bin/env python3
"""新躍進政策 local application launcher. Python 3.10+, no pip dependencies."""
import argparse,json,os,secrets,threading,time,webbrowser,sys
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from domain import apply,metrics,report,totals,validate
from persistence import Store
from character import LocalRulesProvider
ROOT=Path(__file__).resolve().parent
class Application:
 def __init__(self,path):self.store=Store(path);self.lock=threading.RLock();self.provider=LocalRulesProvider();self.token=secrets.token_urlsafe(32);self.backupWarning=False
 def snapshot(self):
  now=int(time.time()*1000);s=self.store.state
  return dict(state=s,now=now,metrics=metrics(s,now),sessionTotals={x['sessionId']:dict(actualStudySeconds=totals(x,now)['study'],breakSeconds=totals(x,now)['break'],pauseSeconds=totals(x,now)['pause']) for x in s['sessions']},recovered=self.store.recovered,backupWarning=self.backupWarning)
 def command(self,p):
  with self.lock:
   if p.get('revision')!=self.store.state['revision']:raise ValueError('別の画面で記録が更新されました。最新状態を読み込みました。もう一度操作してください')
   now=int(time.time()*1000)
   if p['action']=='restore':
    if any(x['endTimestamp'] is None for x in self.store.state['sessions']):raise ValueError('学習を終了してから復元してください')
    self.store.restore(p['data'])
   else:
    s,event,ctx=apply(self.store.state,p['action'],p.get('payload',{}),now)
    self.provider.react(s,event,ctx,now);s['revision']+=1;self.store.save(s)
   # Backup failure does not falsely report a committed mutation as failed.
   try:self.store.backup(self.store.state);self.backupWarning=False
   except OSError:self.backupWarning=True
   return self.snapshot()
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--data-dir',type=Path,default=Path(os.environ.get('LOCALAPPDATA',str(Path.home()/'.local/share')))/'ShinYakushin');parser.add_argument('--port',type=int,default=8765);parser.add_argument('--no-browser',action='store_true');args=parser.parse_args()
 args.data_dir.mkdir(parents=True,exist_ok=True)
 instance_lock=open(args.data_dir/'instance.lock','a+b')
 try:
  if os.name=='nt':
   import msvcrt
   instance_lock.seek(0);instance_lock.write(b'0');instance_lock.flush();instance_lock.seek(0);msvcrt.locking(instance_lock.fileno(),msvcrt.LK_NBLCK,1)
  else:
   import fcntl
   fcntl.flock(instance_lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 except OSError:sys.exit('同じ保存先のアプリは起動済みです。既存の画面を開いてください。')
 app=Application(args.data_dir/'study.sqlite3')
 class Handler(BaseHTTPRequestHandler):
  def log_message(self,*args):pass
  def send(self,data,status=200,mime='application/json; charset=utf-8'):
   blob=json.dumps(data,ensure_ascii=False).encode() if not isinstance(data,bytes) else data
   self.send_response(status);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(blob)));self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.send_header('X-Frame-Options','DENY');self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'");self.end_headers();self.wfile.write(blob)
  def allowed(self):return self.headers.get('Host')==f'127.0.0.1:{self.server.server_port}'
  def do_GET(self):
   if not self.allowed():return self.send({'error':'Host not allowed'},403)
   u=urlparse(self.path)
   try:
    with app.lock:
     if u.path=='/api/state':return self.send(dict(**app.snapshot(),token=app.token))
     if u.path=='/api/report':
      q=parse_qs(u.query);return self.send(report(app.store.state,int(time.time()*1000),q['start'][0],q['end'][0]))
     if u.path=='/api/export':return self.send(app.store.state)
    files={'/':('index.html','text/html; charset=utf-8'),'/app.js':('app.js','text/javascript; charset=utf-8'),'/style.css':('style.css','text/css; charset=utf-8'),'/life.js':('life.js','text/javascript; charset=utf-8')}
    if u.path not in files:return self.send({'error':'Not found'},404)
    file,mime=files[u.path];self.send((ROOT/'web'/file).read_bytes(),mime=mime)
   except (ValueError,KeyError,TypeError) as e:self.send({'error':str(e)},400)
  def do_POST(self):
   if not self.allowed() or self.headers.get('X-App-Token')!=app.token:return self.send({'error':'Forbidden'},403)
   origin=self.headers.get('Origin')
   if origin and origin!=f'http://127.0.0.1:{self.server.server_port}':return self.send({'error':'Origin not allowed'},403)
   if self.path!='/api/command':return self.send({'error':'Not found'},404)
   try:
    n=int(self.headers.get('Content-Length','0'))
    if not 0<n<=25_000_000:raise ValueError('読み込めるファイルは25 MBまでです')
    p=json.loads(self.rfile.read(n));self.send(app.command(p))
   except (ValueError,KeyError,TypeError,OverflowError) as e:self.send({'error':str(e)},400)
   except Exception:
    self.send({'error':'保存処理で問題が起きました。記録を再読み込みして確認してください'},500)
 server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
 url=f'http://127.0.0.1:{server.server_port}'
 print('新躍進政策 '+url,flush=True);print('終了するには Ctrl+C。保存先: '+str(args.data_dir),flush=True)
 if not args.no_browser:webbrowser.open(url)
 try:server.serve_forever()
 except KeyboardInterrupt:pass
 finally:server.server_close();app.store.close()
if __name__=='__main__':main()
