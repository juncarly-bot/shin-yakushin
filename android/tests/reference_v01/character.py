"""Intelligence provider produces intentions; a separate presenter owns visuals."""
from typing import Protocol
import datetime as dt
from domain import metrics
class IntelligenceProvider(Protocol):
 def react(self,state,event,context,now): ...
TEMPLATES={
'hello':[('SoftSmile','今日も、自分のペースで始めよう。'),('Neutral','来てくれてうれしい。今日は何を進めようか。'),('Interested','教材を開くところから、一緒に。')],
'return':[('SoftSmile','{days}日ぶりだね。また一緒に始められるね。'),('Happy','おかえり。前の記録も、ちゃんとここにあるよ。')],
'start':[('Interested','うん、ここで見守っているね。'),('SoftSmile','準備ができたね。一緒に始めよう。'),('Neutral','今は目の前の一つに、ゆっくり取り組もう。')],
'pause':[('Relaxed','少し手を止めよう。時間も止めておくね。'),('Neutral','大丈夫。再開するときに教えてね。')],
'break':[('Relaxed','いったん休もう。肩の力を抜いてね。'),('SoftSmile','ここまでお疲れさま。水分も忘れずに。'),('Sleepy','目を休めて、少し遠くを見ようか。')],
'resume':[('Interested','おかえり。続きから始めよう。'),('SoftSmile','うん、またここから。')],
'finish':[('Proud','{minutes}分、取り組めたね。今日の積み重ね、残しておいたよ。'),('SoftSmile','お疲れさま。{minutes}分、一緒に進められたね。'),('Happy','今日の一歩になったね。少しゆっくりしよう。')],
'exceeded':[('Surprise','今日は昨日より長く取り組めたね。よく頑張ったね。'),('Proud','昨日の時間を越えたね。積み重ねが見えてうれしい。')],
'milestone':[('Surprise','50分になったね。区切りがよければ、ひと息つこう。'),('Proud','気づけば50分。無理のないところで休んでね。')],
'progress':[('Happy','{title}、少し先へ進めたね。'),('Proud','{title}の積み重ねが、また一つ増えたね。')],
'goal':[('Happy','{title}、達成だね。ここまでの時間、大切な思い出になったよ。'),('Proud','{title}を終えられたね。一緒に喜びたいな。')],
'task':[('Happy','{title}、お疲れさま。一つずつでいいんだよ。'),('SoftSmile','{title}が終わったね。ちゃんと前に進んでいる。')],
'memory':[('SoftSmile','大切なこと、残しておこうね。'),('Happy','いつか一緒に振り返れるね。')],
'interact':[('SlightEmbarrassment','うん、ここにいるよ。'),('SoftSmile','今日は、どんな一日にしようか。'),('Thinking','次の一歩は、小さくてもいいと思うよ。'),('Relaxed','急がなくて大丈夫。少しずつ進もう。')],
'late':[('Sleepy','遅い時間だね。今日は短めでも大丈夫だよ。'),('Relaxed','夜も深くなってきたね。休む時間も大切にしよう。')],
'recall':[('Thinking','前に残したこと、覚えているよ。「{memory}」'),('SoftSmile','一緒に振り返ろうか。「{memory}」')],
'familiar':[('SoftSmile','一緒に机に向かう時間、少しずつ増えてきたね。'),('Happy','また今日も、続きを一緒に。')],
}
class LocalRulesProvider:
 def react(self,s,event,ctx,now):
  if not event:return
  prev=s['reaction'];quiet=s['settings']['quiet']
  if event=='interact' and prev and now-prev['timestamp']<20000:return
  hour=dt.datetime.fromtimestamp(now/1000,dt.timezone(dt.timedelta(minutes=s['settings']['utcOffsetMinutes']))).hour
  if event=='hello' and (hour>=23 or hour<5):event='late'
  elif event=='hello' and metrics(s,now)['studyDays']>=30:event='familiar'
  elif event=='interact' and s['memories'] and (not prev or prev['event']!='recall'):
   event='recall';memory=max(s['memories'],key=lambda m:(m['importance'],m['timestamp']));ctx=dict(memory=memory['text'][:100])
  choices=TEMPLATES[event];history=s['dialogueHistory']
  candidates=[(f'{event}:{i}',e,t) for i,(e,t) in enumerate(choices) if not prev or prev['templateId']!=f'{event}:{i}']
  key,emotion,message=min(candidates,key=lambda x:(history.get(x[0],{}).get('count',0),history.get(x[0],{}).get('last',0)))
  usage=history.setdefault(key,{'count':0,'last':0});usage['count']+=1;usage['last']=now
  s['reaction']=dict(templateId=key,event=event,emotion=emotion,gesture='SmallNod' if event in ('finish','task','goal') else 'None',text='' if quiet else message.format(**ctx),timestamp=now)
class NoVoice:
 def speak(self,text):pass
