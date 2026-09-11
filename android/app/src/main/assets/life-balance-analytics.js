/** Local aggregate ledger. This module accepts summaries, never foreground events. */
const modes=['NORMAL','HOLIDAY','FOCUS','UNLIMITED'];
const finite=(n,max=100000)=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=max;
const dateOK=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
export const shiftDay=(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
export function localDay(t,zone=Intl.DateTimeFormat().resolvedOptions().timeZone){const p=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(t);return ['year','month','day'].map(k=>p.find(x=>x.type===k).value).join('-')}
export function dailyAggregate(input){
 if(!input||!dateOK(input.date)||typeof input.timeZone!=='string')throw Error('Invalid aggregate date');
 localDay(0,input.timeZone);
 const {startMs,endMs,observedAt}=input;
 if(!finite(startMs,9e15)||!finite(endMs,9e15)||!finite(observedAt,9e15)||endMs<=startMs||endMs-startMs>27*3600000||observedAt<endMs||localDay(startMs,input.timeZone)!==input.date||localDay(endMs-1,input.timeZone)!==input.date)throw Error('Invalid aggregate window');
 if(input.complete===true&&(localDay(startMs-1,input.timeZone)===input.date||localDay(endMs,input.timeZone)===input.date))throw Error('Incomplete day marked complete');
 const out={categoryCoverage:input.categoryCoverage!==false,date:input.date,timeZone:input.timeZone,startMs,endMs,observedAt,complete:input.complete===true,mode:modes.includes(input.mode)?input.mode:'NORMAL'};
 for(const key of ['studyMinutes','goalMinutes','entertainmentMinutes','studyAppMinutes','neutralMinutes','interventionCount','recoveryCount']){const v=input[key]??0;if(!finite(v,key.endsWith('Count')?10000:1620))throw Error('Invalid aggregate value');out[key]=v}
 if(out.studyMinutes>(endMs-startMs)/60000||out.entertainmentMinutes+out.studyAppMinutes+out.neutralMinutes>(endMs-startMs)/60000)throw Error('Aggregate exceeds window');
 out.budgetMinutes=out.mode==='UNLIMITED'?null:(finite(input.budgetMinutes,1440)?input.budgetMinutes:null);
 out.goalCompleted=out.goalMinutes>0&&out.studyMinutes>=out.goalMinutes;
 out.exceededMinutes=out.budgetMinutes===null?0:Math.max(0,out.entertainmentMinutes-out.budgetMinutes);
 out.budgetSuccess=out.budgetMinutes===null?null:out.entertainmentMinutes<=out.budgetMinutes;
 out.firstStudyStartMinute=finite(input.firstStudyStartMinute,1439)?input.firstStudyStartMinute:null;
 return out;
}
export function normalizeLedger(raw){
 const result={version:1,days:[],rejectedCount:0};
 if(raw===undefined)return result;
 if(!raw||raw.version!==1||!Array.isArray(raw.days))return {...result,rejectedCount:1};
 for(const item of raw.days){try{const next=replaceValidated(result,dailyAggregate(item));result.days=next.days}catch{result.rejectedCount++}}
 return result;
}
/** Replace cumulative observations; never add snapshots. Overlapping other dates are rejected. */
export function upsertDaily(ledger,input){
 const days=(ledger?.days||[]).map(d=>dailyAggregate(d));return replaceValidated({...ledger,days},dailyAggregate(input));
}
function replaceValidated(ledger,day){
 const days=ledger.days;
 const prior=days.find(d=>d.date===day.date);
 if(prior&&(prior.timeZone!==day.timeZone||prior.startMs!==day.startMs))throw Error('Timezone changed: ambiguous day requires explicit reconciliation');
 if(prior&&day.observedAt<prior.observedAt)throw Error('Stale observation');
 if(prior&&day.endMs<prior.endMs)throw Error('Clock rollback');
 if(prior?.complete&&!day.complete)throw Error('Cannot downgrade finalized day');
 if(days.some(d=>d.date!==day.date&&d.startMs<day.endMs&&day.startMs<d.endMs))throw Error('Overlapping daily windows');
 return {version:1,days:[...days.filter(d=>d.date!==day.date),day].sort((a,b)=>a.date.localeCompare(b.date)),rejectedCount:ledger?.rejectedCount||0};
}
export function weeklySummary(ledger,startDate){
 if(!dateOK(startDate))throw Error('Invalid week');
 const all=normalizeLedger(ledger).days;
 const collect=start=>{const days=all.filter(d=>d.date>=start&&d.date<shiftDay(start,7));const sum=k=>days.reduce((n,d)=>n+d[k],0);return {startDate:start,observedDays:days.length,completeDays:days.filter(d=>d.complete).length,studyMinutes:sum('studyMinutes'),entertainmentMinutes:sum('entertainmentMinutes'),studyAppMinutes:sum('studyAppMinutes'),neutralMinutes:sum('neutralMinutes'),averageStudyMinutes:days.length?sum('studyMinutes')/days.length:null,averageEntertainmentMinutes:days.length?sum('entertainmentMinutes')/days.length:null,studyGoalSuccessDays:days.filter(d=>d.complete&&d.goalCompleted).length,budgetSuccessDays:days.filter(d=>d.complete&&d.budgetSuccess===true).length,budgetEligibleDays:days.filter(d=>d.complete&&d.budgetMinutes!==null).length,interventionCount:sum('interventionCount'),recoveryCount:sum('recoveryCount'),categoryCoverage:days.every(d=>d.categoryCoverage),modeDistribution:Object.fromEntries(modes.map(m=>[m,days.filter(d=>d.mode===m).length]))}};
 const current=collect(startDate),previous=collect(shiftDay(startDate,-7));
 const comparable=current.completeDays===7&&previous.completeDays===7;
 return {...current,comparisonAvailable:comparable,studyDeltaMinutes:comparable?current.studyMinutes-previous.studyMinutes:null,entertainmentDeltaMinutes:comparable?current.entertainmentMinutes-previous.entertainmentMinutes:null};
}
export function behaviorInsights(ledger){
 const days=normalizeLedger(ledger).days.filter(d=>d.complete);if(days.length<10)return [];
 const early=days.filter(d=>d.firstStudyStartMinute!==null&&d.firstStudyStartMinute<720),late=days.filter(d=>d.firstStudyStartMinute!==null&&d.firstStudyStartMinute>=720);
 const insights=[];const avg=a=>a.reduce((n,d)=>n+d.studyMinutes,0)/a.length;
 if(early.length>=5&&late.length>=5&&Math.abs(avg(early)-avg(late))>=15)insights.push({type:'STUDY_START_ASSOCIATION',sampleDays:early.length+late.length,differenceMinutes:Math.round(avg(early)-avg(late)),text:`この期間では、午前中に始めた日の勉強時間が、それ以外の日より平均${Math.round(Math.abs(avg(early)-avg(late)))}分${avg(early)>avg(late)?'長い':'短い'}傾向があります。因果関係は確認できません。`});
 const high=days.filter(d=>d.entertainmentMinutes>120&&d.goalMinutes>0),low=days.filter(d=>d.entertainmentMinutes<=120&&d.goalMinutes>0);
 const rate=a=>a.filter(d=>d.goalCompleted).length/a.length;
 if(high.length>=5&&low.length>=5&&Math.abs(rate(high)-rate(low))>=0.2)insights.push({type:'ENTERTAINMENT_ASSOCIATION',sampleDays:high.length+low.length,text:`この期間では、娯楽が2時間を超えた日の目標達成率が、それ以外の日より${rate(high)<rate(low)?'低い':'高い'}傾向があります。因果関係は確認できません。`});
 return insights.slice(0,3);
}
/** Read-only analytics: caller supplies intervention IDs and authoritative study sessions. */
export function recoveryAnalytics(interventions,sessions,{now=Date.now(),windowMinutes=30,minimumMinutes=10}={}){
 const used=new Set(),out=[];
 for(const event of [...interventions].filter(e=>typeof e.id==='string'&&finite(e.timestamp,9e15)).sort((a,b)=>b.timestamp-a.timestamp)){
  if(out.some(x=>x.interventionId===event.id))continue;
  const session=sessions.find(s=>!used.has(s.sessionId)&&s.startTimestamp>=event.timestamp&&s.startTimestamp<=event.timestamp+windowMinutes*60000&&s.segments.filter(p=>p.kind==='study').reduce((n,p)=>n+Math.max(0,Math.min(p.end??now,now)-p.start),0)>=minimumMinutes*60000);
  if(session){used.add(session.sessionId);out.push({interventionId:event.id,sessionId:session.sessionId})}
 }
 return out;
}
/** Native finalized days still worth applying: an already-final day is never re-observed. */
export function pendingFinalizedDays(ledger,nativeDays){
 const finalized=new Set(normalizeLedger(ledger).days.filter(d=>d.complete).map(d=>d.date));
 return (nativeDays??[]).filter(d=>d&&typeof d.date==='string'&&!finalized.has(d.date));
}
/** Per-day counts from the authoritative local timeline and StudySessions; read-only, no rewards. */
export function dailyCounts(state,day,zone=Intl.DateTimeFormat().resolvedOptions().timeZone,options={}){
 if(!dateOK(day))return {interventionCount:0,recoveryCount:0};
 const events=(state?.messages??[]).filter(m=>m.intent==='intervention'&&Number.isFinite(m.at)&&localDay(m.at,zone)===day).map(m=>({id:m.id,timestamp:m.at}));
 const sessions=(state?.sessions??[]).filter(s=>Number.isFinite(s.startTimestamp));
 const recovered=recoveryAnalytics(events,sessions,{...options,now:options.now??Date.now()});
 return {interventionCount:events.length,recoveryCount:recovered.length};
}
export function weeklyContext(ledger,startDate,{enabled=true,relevant=false}={}){
 if(!enabled||!relevant)return null;
 const s=weeklySummary(ledger,startDate);
 return {observedDays:s.observedDays,completeDays:s.completeDays,studyMinutes:s.studyMinutes,studyGoalSuccessDays:s.studyGoalSuccessDays,entertainmentMinutes:s.entertainmentMinutes,budgetSuccessDays:s.budgetSuccessDays,studyDeltaVsPreviousWeek:s.studyDeltaMinutes,entertainmentDeltaVsPreviousWeek:s.entertainmentDeltaMinutes,selectedInsights:behaviorInsights(ledger).map(i=>({type:i.type,text:i.text}))};
}
export const isWeeklyQuestion=text=>/^(今週|先週)(は|の記録は)?(どうだった|どう|どんな感じ|の記録|を振り返って)[?？。！!]*$/.test(String(text).trim());
export function weekStart(now,previous=false){const d=localDay(now),weekday=new Date(d+'T00:00:00Z').getUTCDay();return shiftDay(d,-((weekday+6)%7)-(previous?7:0))}
export function weeklyReply(context){if(!context||context.observedDays===0)return '生活バランスの週次記録はまだありません。記録が揃ってから一緒に振り返りましょう。';return `記録のある${context.observedDays}日分では、勉強は${Math.floor(context.studyMinutes/60)}時間${Math.floor(context.studyMinutes%60)}分、娯楽は${Math.floor(context.entertainmentMinutes/60)}時間${Math.floor(context.entertainmentMinutes%60)}分です。${context.studyDeltaVsPreviousWeek===null?'先週との比較に必要な記録はまだ揃っていません。':`先週より勉強が${Math.abs(context.studyDeltaVsPreviousWeek)}分${context.studyDeltaVsPreviousWeek>=0?'増え':'減り'}ています。`}`}
/** Current native bridge provides a partial day; never claim that it is a complete day. */
export function aggregateFromSnapshot(snapshot,sessions=[],zone=Intl.DateTimeFormat().resolvedOptions().timeZone,counts=null){
 if(snapshot?.permissionGranted!==true)return null;
 const observedAt=snapshot.observedAt,date=localDay(observedAt,zone);
 if(date!==snapshot.day)throw Error('Timezone changed during snapshot');
 // Date uses the device zone. Explicit other-zone callers must supply native boundaries.
 let startMs=snapshot.startMs;
 if(startMs===undefined){if(zone!==Intl.DateTimeFormat().resolvedOptions().timeZone)throw Error('Native day boundary required');const d=new Date(observedAt);d.setHours(0,0,0,0);startMs=d.getTime()}
 if(observedAt===startMs)return null;
 const starts=sessions.filter(s=>s.startTimestamp>=startMs&&s.startTimestamp<observedAt).map(s=>s.startTimestamp);
 const first=starts.length?Math.min(...starts):null;
 const parts=first===null?null:new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(first);
 const minute=parts?Number(parts.find(p=>p.type==='hour').value)*60+Number(parts.find(p=>p.type==='minute').value):null;
 return dailyAggregate({date,timeZone:zone,startMs,endMs:observedAt,observedAt,complete:false,mode:snapshot.dailyMode,budgetMinutes:snapshot.entertainmentBudgetMinutes,studyMinutes:snapshot.studyCompletedMinutes,goalMinutes:snapshot.studyGoalMinutes,entertainmentMinutes:snapshot.entertainmentUsedMinutes,studyAppMinutes:snapshot.studyAppMinutes,neutralMinutes:snapshot.neutralMinutes,categoryCoverage:snapshot.studyAppMinutes!==undefined&&snapshot.neutralMinutes!==undefined,firstStudyStartMinute:minute,interventionCount:counts?.interventionCount,recoveryCount:counts?.recoveryCount});
}
