/**
 * ContinuityEngine: what from the past is still alive, and whether it should be
 * mentioned now. Continuity is structured state (OpenThread), never a vague
 * transcript search — the remote model never decides that a topic comes back.
 */
export const ThreadStatus=Object.freeze({OPEN:'OPEN',WAITING:'WAITING',RESOLVED:'RESOLVED',ABANDONED:'ABANDONED',EXPIRED:'EXPIRED'});
export const ThreadSource=Object.freeze({STUCK:'STUCK',POSTPONE:'POSTPONE',STUDY:'STUDY',MANUAL:'MANUAL'});
export const MAX_THREADS=40;
export const THREAD_COOLDOWN=18*3600000,MAX_RESURFACE=3,THREAD_TTL=14*86400000;

const STUCK=/わからない|分からない|よく分から|むずかしい|難しい|つまず|引っかか|詰ま/;
const POSTPONE=/あとで|後で|今度|次に|また今度|保留/;
const RESOLVE=/わかった|分かった|理解できた|解決|できたよ|うまくいった/;

const clip=(x,n)=>String(x??'').trim().slice(0,n);
/** Pull the subject out of "境界条件まだよく分からない" -> "境界条件". */
export function extractTopic(value){
 const cleaned=String(value??'').replace(/[。、！!？?\s]/g,'').replace(/(まだ)?(よく)?(わから|分から|むずかし|難し|つまず|引っかか|詰ま).*$/,'').replace(/[がはをにの]$/,'');
 return clip(cleaned,40)||clip(value,20);
}

export function openThread(s,fields,now){
 const topic=clip(fields.topic,80);
 if(!topic)return null;
 s.openThreads??=[];
 // Identity is the topic itself: re-mentioning the same unresolved subject
 // updates the existing thread instead of stacking a new one.
 const id=fields.id?clip(fields.id,120):`thread:${topic}`;
 const existing=s.openThreads.find(t=>t.id===id);
 if(existing){if([ThreadStatus.RESOLVED,ThreadStatus.ABANDONED,ThreadStatus.EXPIRED].includes(existing.status)){existing.previousStatus=existing.status;existing.reopenedAt=now;existing.status=ThreadStatus.OPEN;existing.resurfaceCount=0;existing.cooldownUntil=0;existing.lastResurfacedAt=0;existing.expiresAt=now+THREAD_TTL;}existing.updatedAt=now;existing.lastTouchedAt=now;return existing}
 const thread={id,topic,summary:clip(fields.summary??topic,200),createdAt:now,updatedAt:now,lastTouchedAt:now,
  source:Object.values(ThreadSource).includes(fields.source)?fields.source:ThreadSource.STUCK,
  owner:fields.owner==='NurseT'?'NurseT':'SAYO',participants:Array.isArray(fields.participants)?fields.participants.filter(x=>['SAYO','NurseT'].includes(x)).slice(0,2):['SAYO'],
  relatedMaterialId:fields.relatedMaterialId??null,relatedTaskId:fields.relatedTaskId??null,relatedGoalId:fields.relatedGoalId??null,relatedCommitmentId:fields.relatedCommitmentId??null,
  priority:Number.isFinite(fields.priority)?fields.priority:50,
  status:fields.status===ThreadStatus.WAITING?ThreadStatus.WAITING:ThreadStatus.OPEN,
  lastResurfacedAt:0,resurfaceCount:0,cooldownUntil:0,expiresAt:Number.isFinite(fields.expiresAt)?fields.expiresAt:now+THREAD_TTL};
 s.openThreads=[...s.openThreads,thread].slice(-MAX_THREADS);
 return thread;
}

/** Detect a genuinely open thread from what the user actually said. */
export function detectThread(s,text,now,topic=null){
 const value=clip(text,200);
 if(!value)return null;
 if(STUCK.test(value)){
  const title=clip(topic?.item?.title??topic,60)||extractTopic(value);
  return openThread(s,{topic:title,summary:value,source:ThreadSource.STUCK,owner:'SAYO',priority:60,
   relatedMaterialId:topic?.kind==='materials'?topic.item.id:(topic?.item?.relatedMaterialId??null),
   relatedTaskId:topic?.kind==='tasks'?topic.item.id:null,relatedGoalId:topic?.kind==='goals'?topic.item.id:null},now);
 }
 if(POSTPONE.test(value)&&topic){
  return openThread(s,{topic:clip(topic?.item?.title,60),summary:value,source:ThreadSource.POSTPONE,owner:'SAYO',priority:40,
   relatedMaterialId:topic?.kind==='materials'?topic.item.id:(topic?.item?.relatedMaterialId??null)},now);
 }
 return null;
}

export function resolveThreads(s,text,now){
 if(!RESOLVE.test(clip(text,200))||/まだ|ない|ません|けど|しかし/.test(clip(text,200)))return [];
 const resolved=[];
 for(const t of [...(s.openThreads??[])].reverse()){
  if(t.status!==ThreadStatus.OPEN&&t.status!==ThreadStatus.WAITING)continue;
  if(t.topic&&clip(text,200).includes(t.topic)){t.status=ThreadStatus.RESOLVED;t.updatedAt=now;resolved.push(t);break}
 }
 return resolved;
}

/** A meaningful study on the related material resolves its open thread. */
export function resolveThreadsForStudy(s,session,now){
 // Time spent on a material is not evidence that a conceptual difficulty is solved.
 // Only the user's explicit topic-specific acknowledgement closes it.
 return [];
}

/** Choose the single thread worth resurfacing now, respecting every guard. */
export function selectThread(s,now){
 const candidates=[];
 for(const t of s.openThreads??[]){
  if(t.status!==ThreadStatus.OPEN&&t.status!==ThreadStatus.WAITING)continue;
  if(Number.isFinite(t.expiresAt)&&now>t.expiresAt){t.status=ThreadStatus.EXPIRED;t.updatedAt=now;continue}
  if((t.cooldownUntil??0)>now)continue;
  if((t.resurfaceCount??0)>=MAX_RESURFACE)continue;
  if((t.lastResurfacedAt??0)>0&&now-t.lastResurfacedAt<THREAD_COOLDOWN)continue;
  candidates.push(t);
 }
 candidates.sort((a,b)=>(b.priority??0)-(a.priority??0)||(a.lastTouchedAt??0)-(b.lastTouchedAt??0)||String(a.id).localeCompare(String(b.id)));
 return candidates[0]??null;
}

export function markThreadResurfaced(thread,now){thread.lastResurfacedAt=now;thread.resurfaceCount=(thread.resurfaceCount??0)+1;thread.cooldownUntil=now+THREAD_COOLDOWN;thread.updatedAt=now;return thread}
export function abandonThread(s,id,now){const t=(s.openThreads??[]).find(x=>x.id===id);if(t){t.status=ThreadStatus.ABANDONED;t.updatedAt=now}return t??null}

/** Resurfacing copy — grounded in the stored thread, never invented. */
export function threadMessages(thread,now=null,offset=540){
 const owner=thread.owner==='NurseT'?'NurseT':'SAYO';
 const other=owner==='SAYO'?'NurseT':'SAYO';
 const topic=thread.topic;
 const age=now===null?1:Math.floor((now+offset*60000)/86400000)-Math.floor((thread.createdAt+offset*60000)/86400000);
 const when=age===1?'昨日の':age===0?'さっきの':'前に話した';
 const line=thread.source===ThreadSource.POSTPONE?`そういや、${topic}の話、あとでって言ってたよね。`:`そういや${when}${topic}、あれどうなった？`;
 return [{speaker:owner,text:line},{speaker:other,text:owner==='SAYO'?'気になってた。':'記録では未解決のままです。'}];
}

export class ContinuityEngine{
 noteText(s,text,now,topic=null){const created=detectThread(s,text,now,topic);const resolved=resolveThreads(s,text,now);return {created,resolved}}
 noteStudy(s,session,now){return {resolved:resolveThreadsForStudy(s,session,now)}}
 select(s,now){return selectThread(s,now)}
 resurface(s,thread,now){return markThreadResurfaced(thread,now)}
}
