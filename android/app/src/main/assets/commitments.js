/**
 * Companion commitments: things the user explicitly intends to do later.
 *
 * Separate from Memory (long-term recall) and StudySession (what actually
 * happened). Only local validated code creates or completes a commitment.
 */
export const CommitmentKind=Object.freeze({START_STUDY:'START_STUDY',CONTINUE_STUDY:'CONTINUE_STUDY',REVIEW:'REVIEW'});
export const CommitmentStatus=Object.freeze({PENDING:'PENDING',SNOOZED:'SNOOZED',COMPLETED:'COMPLETED',DECLINED:'DECLINED',EXPIRED:'EXPIRED',CANCELLED:'CANCELLED'});
export const COMMITMENT_KINDS=Object.freeze(Object.values(CommitmentKind));
export const COMMITMENT_STATUSES=Object.freeze(Object.values(CommitmentStatus));
export const PROACTIVITY_LEVELS=Object.freeze(['LOW','NORMAL','HIGH']);
export const DEFAULT_MINUTES=15;
export const MAX_OPEN=20;

const DAY=86400000;
const pad=n=>String(n).padStart(2,'0');

/**
 * Only reliable expressions become a due time. Anything vague stays a question.
 * Returns {dueAt,label} or null — never a guess.
 */
export function parseDueAt(text,now,offsetMinutes=540){
 const value=String(text??'').normalize('NFKC');
 const local=new Date(now+offsetMinutes*60000),y=local.getUTCFullYear(),month=local.getUTCMonth(),day=local.getUTCDate();
 const at=(dayOffset,hour,minute=0)=>Date.UTC(y,month,day,hour,minute,0,0)-offsetMinutes*60000+dayOffset*DAY;
 let match=value.match(/(\d{1,2})\s*時間後/);
 if(match){const hours=Number(match[1]);if(hours>=1&&hours<=12)return {dueAt:now+hours*3600000,label:`${hours}時間後`}}
 match=value.match(/(\d{1,3})\s*分後/);
 if(match){const minutes=Number(match[1]);if(minutes>=1&&minutes<=720)return {dueAt:now+minutes*60000,label:`${minutes}分後`}}
 match=value.match(/(\d{1,2})\s*時(?!間)/);
 if(match){const hour=Number(match[1]);if(hour>=0&&hour<=23){const minute=/半/.test(value)?30:0;let dueAt=at(0,hour,minute);if(dueAt<=now)dueAt=at(1,hour,minute);return {dueAt,label:`${hour}時${minute?'半':''}`}}}
 if(/明日の朝|明日朝/.test(value))return {dueAt:at(1,8),label:'明日の朝'};
 if(/明日の夜|明日夜/.test(value))return {dueAt:at(1,20),label:'明日の夜'};
 if(/今日の夜|今夜|夜に/.test(value)){let dueAt=at(0,20);if(dueAt<=now)dueAt=at(1,20);return {dueAt,label:'今日の夜'}}
 if(/明日/.test(value))return {dueAt:at(1,9),label:'明日'};
 return null;
}

/** A two-second tap must never satisfy a commitment. */
export function isMeaningful(commitment,session,now=Date.now()){
 if(!commitment||!session||session.endTimestamp===null)return false;
 const seconds=(session.segments??[]).reduce((total,part)=>total+Math.max(0,((part.end??now)-part.start)/1000),0);
 const minutes=Number.isFinite(commitment.minutes)&&commitment.minutes>0?commitment.minutes:DEFAULT_MINUTES;
 const target=Math.max(60,Math.min(3600,minutes*60*0.8));
 return seconds>=target;
}

/** A commitment only completes when the study context matches what was promised. */
export function matchesStudy(commitment,session){
 if(!commitment||!session)return false;
 const pairs=[['relatedMaterialId'],['relatedTaskId'],['relatedGoalId']];
 const bound=pairs.map(([field])=>commitment[field]).filter(Boolean);
 if(!bound.length)return true;
 return pairs.some(([field])=>commitment[field]&&session[field]===commitment[field]);
}

export const isOpen=commitment=>commitment&&(commitment.status===CommitmentStatus.PENDING||commitment.status===CommitmentStatus.SNOOZED);

/** Next moment a pending/snoozed commitment should surface, or null. */
export function nextDue(commitments,now=Date.now()){
 let best=null;
 for(const commitment of commitments??[]){
  if(commitment.status===CommitmentStatus.PENDING)best=Math.min(best??Infinity,commitment.dueAt??Infinity);
  else if(commitment.status===CommitmentStatus.SNOOZED)best=Math.min(best??Infinity,commitment.snoozedUntil??Infinity);
 }
 return Number.isFinite(best)?best:null;
}

export const formatClock=(at,offsetMinutes=540)=>`${pad(new Date(at+offsetMinutes*60000).getUTCHours())}:${pad(new Date(at+offsetMinutes*60000).getUTCMinutes())}`;

/** Privacy-safe reminder copy, mirrored by CommitmentCopy.java. */
export const CommitmentCopy=Object.freeze({
 TITLE_SAYO:'約束の時間だよー',
 BODY_SAYO:'昨日の続き、やろ？',
 TITLE_NURSE_T:'そろそろ始める時間です。',
 BODY_NURSE_T:'まず15分から始めますか？'
});
export const commitmentMessage=owner=>owner==='NurseT'
 ?{title:CommitmentCopy.TITLE_NURSE_T,body:CommitmentCopy.BODY_NURSE_T}
 :{title:CommitmentCopy.TITLE_SAYO,body:CommitmentCopy.BODY_SAYO};
