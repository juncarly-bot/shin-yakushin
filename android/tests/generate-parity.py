"""Golden migration fixture from unchanged v0.1 code. Synthetic data only."""
import sys,json,pathlib
sys.path.insert(0,str(pathlib.Path(__file__).parent/'reference_v01'))
from domain import fresh,apply,metrics,report
T=1788582000000
s=fresh()
def act(a,p,t=T):
 global s
 s,_,_=apply(s,a,p,t)
act('saveEntity',dict(kind='goals',title='QA goal',target=100,progress=20,unit='%'))
gid=s['goals'][0]['id']
act('saveEntity',dict(kind='materials',title='QA book',target=500,progress=145,unit='pages'))
mid=s['materials'][0]['id']
act('saveEntity',dict(kind='tasks',title='QA task',relatedMaterialId=mid,relatedGoalId=gid))
tid=s['tasks'][0]['id']
act('saveEntity',dict(kind='plans',title='QA plan',date='2026-09-05',relatedTaskId=tid))
pid=s['plans'][0]['id']
act('visit',{})
act('start',dict(sessionId='v01-session',relatedPlanId=pid))
act('break',dict(sessionId='v01-session',minutes=10),T+50*60000)
act('resume',dict(sessionId='v01-session'),T+60*60000)
act('finish',dict(sessionId='v01-session',note='synthetic'),T+100*60000)
act('saveEntity',dict(kind='tasks',id=tid,title='QA task',done=True,relatedMaterialId=mid,relatedGoalId=gid),T+100*60000)
act('memory',dict(text='Synthetic memory'))
result={'state':s,'now':T+100*60000,'metrics':metrics(s,T+100*60000),'report':report(s,T+100*60000,'2026-09-05','2026-09-06')}
(pathlib.Path(__file__).parent/'v01-golden.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print('v0.1 golden fixture generated from original domain')
