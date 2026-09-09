import {templates as base} from './templates.js';
import {metrics,entity,report,dateKey,shiftDate} from './domain.js';
const templates={...base,half:[['Happy','{title}、もう半分まで来たね。'],['Proud','{title}、積み重ねが形になってきたね。']],material:[['SoftSmile','{title}の続きを、一緒に進められたね。'],['Proud','今日も{title}に取り組めたね。']],monthly:[['Proud','今月の積み重ねが、先月の時間を越えたね。'],['SoftSmile','先月から、また一歩進んできたね。']]};
export class LocalRulesProvider{
 react(s,event,context,now){if(!event)return;let c={...context};const prev=s.reaction,h=s.dialogueHistory;
 if(event==='interact'&&prev&&now-prev.timestamp<20000)return;
 if(event==='progress'&&context.progress/context.target>=.5&&context.progress<context.target)event='half';
 if(event==='finish'){
  const m=context.material&&entity(s,'materials',context.material);if(m){event='material';c.title=m.title}
  const d=dateKey(now,s.settings.utcOffsetMinutes),y=shiftDate(d,-1),t=report(s,now,d,d).seconds,yd=report(s,now,y,y).seconds;
  if(!m&&yd>0&&t>yd)event='exceeded';
 }
 if(event==='hello'){
  const hour=new Date(now+s.settings.utcOffsetMinutes*60000).getUTCHours();
  if(hour>=23||hour<5)event='late';else if(metrics(s,now).studyDays>=30)event='familiar';
  const d=dateKey(now,s.settings.utcOffsetMinutes),start=d.slice(0,8)+'01',prevEnd=shiftDate(start,-1),prevStart=prevEnd.slice(0,8)+'01';
  const prior=report(s,now,prevStart,prevEnd).seconds;
  if(prior>0&&report(s,now,start,d).seconds>prior&&now-(h['monthly:0']?.last??0)>86400000*7&&now-(h['monthly:1']?.last??0)>86400000*7)event='monthly';
 }
 if(event==='recall'&&!c.memory)return;
 const choices=(templates[event]??templates.hello).map(([emotion,text],i)=>({id:`${event}:${i}`,emotion,text})).filter(x=>x.id!==prev?.templateId);
 choices.sort((a,b)=>(h[a.id]?.count??0)-(h[b.id]?.count??0)||(h[a.id]?.last??0)-(h[b.id]?.last??0));const picked=choices[0];h[picked.id]={count:(h[picked.id]?.count??0)+1,last:now};s.reaction={templateId:picked.id,event,emotion:picked.emotion,gesture:'None',text:s.settings.quiet?'':picked.text.replace(/\{(\w+)\}/g,(_,k)=>String(c[k]??'')),timestamp:now};
 }
}
