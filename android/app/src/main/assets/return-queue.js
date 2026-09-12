/**
 * ReturnQueue: some useful observations are saved for a later, more natural
 * moment instead of being dumped immediately. One delivery per item, grounded
 * in real Study/Commitment/Goal data.
 */
export const ReturnKind=Object.freeze({PATTERN:'PATTERN',COMMITMENT:'COMMITMENT',GOAL:'GOAL',USAGE_RECOVERY:'USAGE_RECOVERY',THREAD_RESOLUTION:'THREAD_RESOLUTION',WEEKLY:'WEEKLY'});
export const MAX_RETURNS=40;
const HOUR=3600000,DAY=86400000;

export function enqueueReturn(s,item,now){
 s.returnQueue??=[];
 const id=item.id??`return:${item.kind}:${item.createdAt??now}`;
 if(s.returnQueue.some(x=>x.id===id))return null;
 const record={id,kind:Object.values(ReturnKind).includes(item.kind)?item.kind:ReturnKind.PATTERN,
  summary:String(item.summary??'').trim().slice(0,200),createdAt:now,
  availableAfter:Number.isFinite(item.availableAfter)?item.availableAfter:now,
  expiresAt:Number.isFinite(item.expiresAt)?item.expiresAt:now+3*DAY,
  speakerPreference:item.speakerPreference==='SAYO'?'SAYO':'NurseT',
  importance:Number.isFinite(item.importance)?item.importance:50,deliveredAt:null,
  relatedMaterialId:item.relatedMaterialId??null,relatedGoalId:item.relatedGoalId??null,relatedCommitmentId:item.relatedCommitmentId??null};
 s.returnQueue=[...s.returnQueue,record].slice(-MAX_RETURNS);
 return record;
}

export function dueReturn(s,now){
 const open=(s.returnQueue??[]).filter(x=>x.deliveredAt===null&&x.availableAfter<=now&&now<(x.expiresAt??Infinity));
 open.sort((a,b)=>(b.importance??0)-(a.importance??0)||(a.createdAt??0)-(b.createdAt??0)||String(a.id).localeCompare(String(b.id)));
 return open[0]??null;
}
export function markReturnDelivered(item,now){item.deliveredAt=now;return item}
export function pruneReturns(s,now){s.returnQueue=(s.returnQueue??[]).filter(x=>x.deliveredAt===null?now<(x.expiresAt??Infinity):now-x.deliveredAt<7*DAY);return s.returnQueue}

/** Study totals split around the session midpoint, from real segments only. */
export function sessionHalves(session){
 const segments=(session?.segments??[]).filter(p=>p.kind==='study'&&Number.isFinite(p.start)).sort((a,b)=>a.start-b.start);
 if(!segments.length)return null;
 const end=p=>Number.isFinite(p.end)?p.end:session.endTimestamp??p.start;
 const start=segments[0].start,finish=Math.max(...segments.map(end)),midpoint=(start+finish)/2;
 // "Back half felt stronger" is about the longest continuous run, not raw totals.
 let first=0,second=0,total=0;
 for(const p of segments){
  const seconds=Math.max(0,(end(p)-p.start)/1000);
  total+=seconds;
  if(p.start<midpoint)first=Math.max(first,seconds);else second=Math.max(second,seconds);
 }
 return {first,second,total,midpoint,start,finish,segments:segments.length};
}

/** Grounded deferred observation. Returns item fields, or null. */
 export function detectSessionReturn(session,offset){
 const halves=sessionHalves(session);
 if(!halves)return null;
 const total=halves.total;
 if(total<20*60)return null;
 // A single continuous block has no meaningful back/front pattern.
 if(halves.segments<2)return null;
 if(halves.second>=600&&halves.second>=halves.first*1.2)return {kind:ReturnKind.PATTERN,summary:'後半の方が集中が長く続いていたね',speakerPreference:'NurseT',importance:60,relatedMaterialId:session.relatedMaterialId??null};
 if(halves.first>=600&&halves.first>=halves.second*1.5)return {kind:ReturnKind.PATTERN,summary:'前半でしっかり進んでいたね',speakerPreference:'SAYO',importance:50,relatedMaterialId:session.relatedMaterialId??null};
 return null;
}

/** Next local morning 08:00 — a natural moment, not an alarm. */
export function nextMorning(now,offset){
 const local=new Date(now+offset*60000),y=local.getUTCFullYear(),m=local.getUTCMonth(),d=local.getUTCDate();
 let at=Date.UTC(y,m,d,8,0,0,0)-offset*60000;
 if(at<=now)at+=DAY;
 return at;
}

export function returnMessages(item){
 const speaker=item.speakerPreference==='SAYO'?'SAYO':'NurseT',other=speaker==='SAYO'?'NurseT':'SAYO';
 const first=speaker==='SAYO'?`昨日、${item.summary}`:`昨日は${item.summary}。`;
 const second=speaker==='SAYO'?'気になってた。':'記録に残っています。';
 return [{speaker,text:first},{speaker:other,text:second}];
}
