"""Pure local domain. Session segments are the only authoritative study clock."""
import copy, datetime as dt, math, uuid
VERSION=1
class UnsupportedSchema(ValueError):pass
KINDS=('materials','goals','tasks','plans')
def ident(): return str(uuid.uuid4())
def fresh():
 return dict(schemaVersion=VERSION,revision=0,sessions=[],materials=[],goals=[],tasks=[],plans=[],memories=[],visits=[],progressEvents=[],dialogueHistory={},reaction=None,settings={'name':'','utcOffsetMinutes':540,'breakMinutes':5,'quiet':False},lastSeen=None)
def day(t,offset=540): return dt.datetime.fromtimestamp(t/1000,dt.timezone(dt.timedelta(minutes=offset))).date().isoformat()
def number(v,minimum=0,maximum=253402214400000):
 if isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) or not minimum<=v<=maximum: raise ValueError('数値が範囲外です')
 return v
def text(v,limit=2000):
 if not isinstance(v,str) or len(v)>limit: raise ValueError('文字数または形式を確認してください')
 return v.strip()
def totals(s,now):
 out={'study':0,'break':0,'pause':0}
 for p in s['segments']:
  out[p['kind']]+=max(0,(p['end'] if p['end'] is not None else now)-p['start'])/1000
 return out
def link(s,kind,id):
 if not id:return None
 return next((x for x in s[kind] if x['id']==id),None)
def relations(s,p):
 r={k:p.get(k) or None for k in ('relatedMaterialId','relatedGoalId','relatedTaskId','relatedPlanId')}
 for field,kind in [('relatedPlanId','plans'),('relatedTaskId','tasks'),('relatedMaterialId','materials'),('relatedGoalId','goals')]:
  if r[field]:
   obj=link(s,kind,r[field])
   if not obj: raise ValueError('関連先が見つかりません')
   for k in r:
    if k!=field and obj.get(k) and not r[k]:r[k]=obj[k]
 return r
def remember(s,category,message,now,related=None,importance=1):
 key=f'{category}:{related}' if related else ident()
 if any(m['id']==key for m in s['memories']):return
 s['memories'].append(dict(id=key,category=category,text=message,timestamp=now,relatedId=related,importance=importance))
 manual=[m for m in s['memories'] if m['category']=='manual']
 auto=[m for m in s['memories'] if m['category']!='manual']
 auto=sorted(auto,key=lambda m:(m['importance'],m['timestamp']),reverse=True)[:300]
 s['memories']=sorted(manual+auto,key=lambda m:m['timestamp'])
def metrics(s,now):
 completed=[x for x in s['sessions'] if x['endTimestamp'] is not None]
 secs=sum(totals(x,now)['study'] for x in completed)
 days=set()
 for x in completed:
  for p in x['segments']:
   if p['kind']=='study' and p['end']>p['start']:
    lo=dt.date.fromisoformat(day(p['start'],s['settings']['utcOffsetMinutes']));hi=dt.date.fromisoformat(day(p['end']-1,s['settings']['utcOffsetMinutes']))
    while lo<=hi:days.add(lo.isoformat());lo+=dt.timedelta(days=1)
 streak=0;cursor=dt.date.fromisoformat(day(now,s['settings']['utcOffsetMinutes']))
 if cursor.isoformat() not in days:cursor-=dt.timedelta(days=1)
 while cursor.isoformat() in days:streak+=1;cursor-=dt.timedelta(days=1)
 return dict(streak=streak,studyBond=round(secs/3600,2),familiarity=len(s['visits']),sharedMemories=len(s['memories']),reward=sum(int(totals(x,now)['study']//60) for x in completed),studyDays=len(days),seconds=secs)
def report(s,now,start,end):
 offset=s['settings']['utcOffsetMinutes']; tz=dt.timezone(dt.timedelta(minutes=offset))
 a=dt.date.fromisoformat(start); b=dt.date.fromisoformat(end)
 if b<a or (b-a).days>366:raise ValueError('日付範囲を確認してください')
 daily={}; mats={};sessions=[]
 while a<=b:
  lo=dt.datetime.combine(a,dt.time(),tz).timestamp()*1000; hi=lo+86400000;secs=0
  for x in s['sessions']:
   local=0
   for p in x['segments']:
    if p['kind']=='study':local+=max(0,min(p['end'] if p['end'] is not None else now,hi)-max(p['start'],lo))/1000
   secs+=local
   if local:
    if x['sessionId'] not in sessions:sessions.append(x['sessionId'])
    mid=x['relatedMaterialId'] or 'free'; mats[mid]=mats.get(mid,0)+local
  daily[a.isoformat()]=secs;a+=dt.timedelta(days=1)
 events=[e for e in s['progressEvents'] if start<=day(e['timestamp'],offset)<=end]
 return dict(daily=daily,seconds=sum(daily.values()),sessions=sessions,materials=mats,completedTasks=[x for x in s['tasks'] if x.get('completedAt') and start<=day(x['completedAt'],offset)<=end],goalProgress=[e for e in events if e['kind']=='goals'],materialProgress=[e for e in events if e['kind']=='materials'],studyDays=sum(v>0 for v in daily.values()))
def apply(s,action,p,now):
 s=copy.deepcopy(s); event=None;ctx={}
 active=next((x for x in s['sessions'] if x['endTimestamp'] is None),None)
 if action=='visit':
  today=day(now,s['settings']['utcOffsetMinutes'])
  if today not in s['visits']:s['visits'].append(today)
  gap=0 if s['lastSeen'] is None else (now-s['lastSeen'])/86400000
  event='return' if gap>=7 else 'hello';s['lastSeen']=now;ctx['days']=int(gap)
 elif action=='start':
  sid=text(p.get('sessionId',''),100)
  if not sid:raise ValueError('sessionId が必要です')
  if any(x['sessionId']==sid for x in s['sessions']):return s,None,{}
  if active:raise ValueError('学習中です。現在の学習へ戻ってください')
  r=relations(s,p);source='plan' if r['relatedPlanId'] else ('linked' if any(r.values()) else 'free')
  s['sessions'].append(dict(sessionId=sid,startTimestamp=now,endTimestamp=None,sourceType=source,note='',title=text(p.get('title','自由学習'),200) or '自由学習',segments=[dict(kind='study',start=now,end=None)],breakUntil=None,milestones=[],**r));event='start'
 elif action in ('pause','resume','break','finish','milestone'):
  sid=p.get('sessionId'); x=next((x for x in s['sessions'] if x['sessionId']==sid),None)
  if not x:raise ValueError('学習が見つかりません')
  if x['endTimestamp'] is not None:return s,None,{}
  prev=x['segments'][-1];now=max(now,prev['start'])
  if action=='milestone':
   if totals(x,now)['study']>=3000 and '50min' not in x.get('milestones',[]):
    x.setdefault('milestones',[]).append('50min')
    remember(s,'long','50分、一緒に机に向かった日。',now,sid,2);event='milestone'
  elif action=='finish':
   prev['end']=now;x['endTimestamp']=now;x['breakUntil']=None;x['note']=text(p.get('note',''))
   secs=totals(x,now)['study'];event='finish';ctx['minutes']=int(secs//60)
   if secs>=3000:remember(s,'long',f'{int(secs//60)}分、一緒に勉強した。',now,sid,2)
   if len(s['sessions'])==1:remember(s,'first','はじめて一緒に勉強した日。',now,sid,3)
   m=metrics(s,now)
   if m['studyDays'] in (3,7,30,100,180,365):remember(s,'consistency',f'{m["studyDays"]}日、勉強を積み重ねた。',now,str(m['studyDays']),3)
   offset=s['settings']['utcOffsetMinutes'];today=day(now,offset);yesterday=(dt.date.fromisoformat(today)-dt.timedelta(days=1)).isoformat()
   td=report(s,now,today,today)['seconds']; yd=report(s,now,yesterday,yesterday)['seconds']
   if yd>0 and td>yd: event='exceeded'
  else:
   kind={'pause':'pause','resume':'study','break':'break'}[action]
   if prev['kind']==kind:return s,None,{}
   prev['end']=now;x['segments'].append(dict(kind=kind,start=now,end=None));x['breakUntil']=now+number(p.get('minutes',5),1,180)*60000 if kind=='break' else None;event=action
 elif action=='classify':
  x=next((x for x in s['sessions'] if x['sessionId']==p.get('sessionId')),None)
  if not x:raise ValueError('学習が見つかりません')
  x.update(relations(s,p));x['note']=text(p.get('note',x['note']))
 elif action=='saveEntity':
  kind=p.get('kind')
  if kind not in KINDS:raise ValueError('種類が不正です')
  title=text(p.get('title',''),200)
  if not title:raise ValueError('名前を入力してください')
  obj=link(s,kind,p.get('id'));old=copy.deepcopy(obj)
  if not obj:obj=dict(id=ident(),createdAt=now,completedAt=None,progress=0);s[kind].append(obj)
  obj.update(title=title,memo=text(p.get('memo','')),archived=bool(p.get('archived',False)))
  if kind in ('materials','goals'):
   target=number(p.get('target',100),1);progress=number(p.get('progress',0),0,target)
   obj.update(target=target,progress=progress,unit=text(p.get('unit','ページ' if kind=='materials' else '%'),30))
   if not old or old['progress']!=progress:
    s['progressEvents'].append(dict(id=ident(),kind=kind,relatedId=obj['id'],title=title,before=old['progress'] if old else 0,after=progress,timestamp=now))
    if progress>0: event='progress';ctx={'title':title};remember(s,'progress',f'{title}：{progress:g} {obj["unit"]}へ。',now,ident())
   obj['completedAt']=obj.get('completedAt') or now if progress>=target else None
   if obj['completedAt'] and (not old or not old.get('completedAt')):
    event='goal' if kind=='goals' else 'progress';remember(s,'achievement',f'{title}を達成した。',now,obj['id'],5)
  else:
   obj.update(relations(s,p));done=bool(p.get('done',False));obj['done']=done;obj['completedAt']=(obj.get('completedAt') or now) if done else None
   if kind=='plans':dt.date.fromisoformat(p.get('date',''));obj['date']=p['date']
   if done and (not old or not old.get('done')):event='task';ctx={'title':title};remember(s,'task',f'{title}を終えた。',now,obj['id'],2)
 elif action=='memory':
  if len([x for x in s['memories'] if x['category']=='manual'])>=100:raise ValueError('手動の思い出は100件まで保存できます。バックアップを残してください')
  message=text(p.get('text',''))
  if not message:raise ValueError('思い出を入力してください')
  remember(s,'manual',message,now,None,5);event='memory'
 elif action=='settings':
  s['settings']={'name':text(p.get('name',''),80),'utcOffsetMinutes':int(number(p.get('utcOffsetMinutes',540),-720,840)),'breakMinutes':number(p.get('breakMinutes',5),1,180),'quiet':bool(p.get('quiet',False))}
 elif action=='interact':event='interact'
 else:raise ValueError('不明な操作です')
 return s,event,ctx

def validate(s):
 if not isinstance(s,dict):raise ValueError('バックアップ形式が不正です')
 if s.get('schemaVersion')!=VERSION:raise UnsupportedSchema('対応していない保存形式です。元データは変更していません')
 base=fresh()
 if not set(base)<=set(s):raise ValueError('バックアップに必要な項目がありません')
 number(s['revision'],0)
 for kind in (*KINDS,'sessions','memories','visits','progressEvents'):
  if not isinstance(s[kind],list):raise ValueError('バックアップ形式が不正です')
 ids={}
 for kind in KINDS:
  ids[kind]=set()
  for o in s[kind]:
   oid=text(o['id'],100)
   if oid in ids[kind]:raise ValueError('重複IDです')
   ids[kind].add(oid);text(o['title'],200);text(o['memo']);number(o['createdAt']);
   if o['completedAt'] is not None:number(o['completedAt'])
   if kind in ('materials','goals'):number(o['target'],1);number(o['progress'],0,o['target']);text(o['unit'],30)
   else:
    if not isinstance(o['done'],bool):raise ValueError('完了状態が不正です')
    if kind=='plans':dt.date.fromisoformat(o['date'])
 session_ids=set();active=0
 for x in s['sessions']:
  sid=text(x['sessionId'],100)
  if not sid or sid in session_ids:raise ValueError('StudySessionが重複しています')
  session_ids.add(sid);number(x['startTimestamp']);text(x['title'],200);text(x['note'])
  if x['sourceType'] not in ('free','plan','linked'):raise ValueError('学習種別が不正です')
  end=x['endTimestamp'];active+=end is None
  if end is not None:number(end,x['startTimestamp'])
  if not x['segments']:raise ValueError('時間区間がありません')
  last=x['startTimestamp']
  for i,p in enumerate(x['segments']):
   if p['kind'] not in ('study','break','pause') or p['start']!=last:raise ValueError('時間区間が不正です')
   number(p['start']);pe=p['end']
   if pe is None:
    if end is not None or i!=len(x['segments'])-1:raise ValueError('未終了区間が不正です')
   else:number(pe,p['start'])
   last=pe
  if last!=end:raise ValueError('終了時刻が一致しません')
  if x['breakUntil'] is not None:number(x['breakUntil'])
  for f,k in [('relatedMaterialId','materials'),('relatedGoalId','goals'),('relatedTaskId','tasks'),('relatedPlanId','plans')]:
   if x[f] is not None and x[f] not in ids[k]:raise ValueError('関連先がありません')
 if active>1:raise ValueError('複数の学習が同時進行しています')
 for k in ('tasks','plans'):
  for o in s[k]:relations(s,o)
 seen=set()
 for m in s['memories']:
  mid=text(m['id'],200)
  if mid in seen:raise ValueError('思い出IDが重複しています')
  seen.add(mid);text(m['text']);text(m['category'],50);number(m['timestamp']);number(m['importance'],0,10)
 if len(s['memories'])>400:raise ValueError('思い出の上限を超えています')
 for v in s['visits']:dt.date.fromisoformat(v)
 if len(set(s['visits']))!=len(s['visits']):raise ValueError('訪問日が重複しています')
 for e in s['progressEvents']:
  text(e['id'],100);text(e['title'],200);number(e['timestamp']);number(e['before']);number(e['after'])
  if e['kind'] not in ('materials','goals') or e['relatedId'] not in ids[e['kind']]:raise ValueError('進捗履歴が不正です')
 if not isinstance(s['dialogueHistory'],dict):raise ValueError('会話履歴が不正です')
 for k,v in s['dialogueHistory'].items():text(k,100);number(v['count']);number(v['last'])
 if s['lastSeen'] is not None:number(s['lastSeen'])
 if s['reaction'] is not None:
  for k in ('text','emotion','gesture','event','templateId'):text(s['reaction'][k])
  number(s['reaction']['timestamp'])
 cfg=s['settings'];text(cfg['name'],80);number(cfg['utcOffsetMinutes'],-720,840);number(cfg['breakMinutes'],1,180)
 if not isinstance(cfg['quiet'],bool):raise ValueError('設定が不正です')
 return s
