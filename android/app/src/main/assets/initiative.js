/**
 * Companion Initiative: a local, deterministic proposal engine.
 *
 * It only ever observes and describes. Every state change is performed later by
 * a validated local command after the user chooses an action. It never touches
 * StudySession, Reward, Bond, Memory or Usage.
 */
import {active,report,dateKey,entity,totals} from './domain.js';
import {previousStudy} from './companion.js';
import {CommitmentKind,CommitmentStatus,PROACTIVITY_LEVELS,isOpen,formatClock,DEFAULT_MINUTES} from './commitments.js';

export const InitiativeKind=Object.freeze({
 CONTINUE_PREVIOUS_STUDY:'CONTINUE_PREVIOUS_STUDY',START_SMALL_SESSION:'START_SMALL_SESSION',
 FOLLOW_UP_COMMITMENT:'FOLLOW_UP_COMMITMENT',REVIEW_TODAY:'REVIEW_TODAY',REVIEW_WEEK:'REVIEW_WEEK',
 RETURN_TO_STUDY:'RETURN_TO_STUDY',TAKE_BREAK:'TAKE_BREAK',FINISH_FOR_TODAY:'FINISH_FOR_TODAY',
 RECORD_PROGRESS:'RECORD_PROGRESS',RESUME_UNFINISHED_TASK:'RESUME_UNFINISHED_TASK',
 LIGHT_STUDY_DAY:'LIGHT_STUDY_DAY',CELEBRATE_RECOVERY:'CELEBRATE_RECOVERY'
});
export const INITIATIVE_KINDS=Object.freeze(Object.values(InitiativeKind));
export {PROACTIVITY_LEVELS};
export const ActionKind=Object.freeze({START_STUDY:'START_STUDY',SNOOZE:'SNOOZE',DECLINE:'DECLINE',REVIEW:'REVIEW',BREAK:'BREAK'});

const HOUR=3600000,MINUTE=60000,DAY=86400000;
const CAPS={LOW:{perDay:2,cooldown:4*HOUR,decline:12*HOUR},NORMAL:{perDay:4,cooldown:90*MINUTE,decline:12*HOUR},HIGH:{perDay:6,cooldown:30*MINUTE,decline:6*HOUR}};
const DEDUPE_WINDOW=6*HOUR;
/** After a promise is surfaced, wait before the same promise appears again. */
const REPROMPT_GAP=30*MINUTE;

const proposal=(fields)=>({id:fields.id,kind:fields.kind,createdAt:fields.createdAt,speakerPlan:fields.speakerPlan??['SAYO'],reason:fields.reason,title:fields.title,
 messageHint:fields.messageHint??null,messages:fields.messages??[],actionOptions:fields.actionOptions??[],
 relatedMaterialId:fields.relatedMaterialId??null,relatedTaskId:fields.relatedTaskId??null,relatedGoalId:fields.relatedGoalId??null,
 relatedPlanId:fields.relatedPlanId??null,commitmentId:fields.commitmentId??null,expiresAt:fields.expiresAt,priority:fields.priority});

export function proactivityOf(s){const level=s.settings?.companion?.proactivity;return PROACTIVITY_LEVELS.includes(level)?level:'NORMAL'}

/** A promise the user explicitly made outranks every generic suggestion. */
export function dueCommitment(s,now){
 const open=(s.commitments??[]).filter(isOpen).filter(c=>{
  const due=c.status===CommitmentStatus.SNOOZED?(c.snoozedUntil??Infinity):(c.dueAt??Infinity);
  if(!(due<=now&&now-due<36*HOUR))return false;
  if((c.promptCount??0)>=2)return false;
  if((c.lastPromptAt??0)>0&&now-(c.lastPromptAt??0)<REPROMPT_GAP&&!(c.status===CommitmentStatus.SNOOZED&&now>=(c.snoozedUntil??0)))return false;
  return true;
 });
 open.sort((a,b)=>((a.snoozedUntil??a.dueAt)??0)-((b.snoozedUntil??b.dueAt)??0));
 return open[0]??null;
}

function commitmentActions(commitment,minutes){return [
 {id:'start',kind:ActionKind.START_STUDY,label:`${minutes}分やる`,minutes,relatedMaterialId:commitment.relatedMaterialId??null,relatedTaskId:commitment.relatedTaskId??null,relatedGoalId:commitment.relatedGoalId??null},
 {id:'later',kind:ActionKind.SNOOZE,label:'30分後',minutes:30},
 {id:'stop',kind:ActionKind.DECLINE,label:'今日はやめる',quietToday:true}
]}

function commitmentProposal(s,commitment,now,offset){
 const minutes=Number.isFinite(commitment.minutes)&&commitment.minutes>0?commitment.minutes:DEFAULT_MINUTES;
 const material=entity(s,'materials',commitment.relatedMaterialId),title=commitment.title||material?.title||'続き';
 const at=commitment.snoozedUntil??commitment.dueAt;
 const lead=commitment.owner==='NurseT'?'NurseT':'SAYO';
 return proposal({id:`FOLLOW_UP_COMMITMENT:${commitment.commitmentId}`,kind:InitiativeKind.FOLLOW_UP_COMMITMENT,createdAt:now,speakerPlan:[lead],
  reason:'commitment-due',title,commitmentId:commitment.commitmentId,
  messages:[{speaker:'SAYO',text:`${formatClock(at,offset)}だよー。`},{speaker:'SAYO',text:'昨日の続き、やろ？'}],
  actionOptions:commitmentActions(commitment,minutes).map(option=>option.id==='start'?{...option,label:'始める'}:option),expiresAt:now+6*HOUR,priority:100});
}

/** Pure evaluation. Returns an InitiativeProposal or null; never mutates. */
export function evaluate(s,now,{source='open'}={}){
 const offset=s.settings?.utcOffsetMinutes??540,today=dateKey(now,offset),companion=s.settings?.companion??{},state=s.initiative??{};
 const level=proactivityOf(s),caps=CAPS[level],due=dueCommitment(s,now);
 if(due)return commitmentProposal(s,due,now,offset);
 const quietDay=companion.quietDay===today;
 if(quietDay)return null;
 if((state.snoozeUntil??0)>now)return null;
 const shownDay=state.shownDay===today?Number(state.shownCount??0):0;
 if(shownDay>=caps.perDay)return null;
 const snoozeExpired=(state.snoozeUntil??0)>0&&now>=(state.snoozeUntil??0);
 if(!snoozeExpired){
  if(now-(state.lastPromptAt??0)<caps.cooldown)return null;
  if(state.lastDeclinedKind&&now-(state.lastDeclinedAt??0)<caps.decline&&state.lastDeclinedKind===(state.lastKind??null))return null;
  if(state.lastKind&&now-(state.lastPromptAt??0)<DEDUPE_WINDOW)return null;
 }
 const running=active(s);
 if(running){
  const minutes=Math.floor(totals(running,now).study/60);
  if(minutes>=90&&running.segments.at(-1).kind==='study')return proposal({id:'TAKE_BREAK',kind:InitiativeKind.TAKE_BREAK,createdAt:now,speakerPlan:['NurseT'],reason:'long-session',title:running.title,
   messages:[{speaker:'NurseT',text:'90分続いています。一度休憩してからでも遅くありません。'}],actionOptions:[{id:'break',kind:ActionKind.BREAK,label:'休憩する'},{id:'later',kind:ActionKind.SNOOZE,label:'まだ続ける',minutes:30}],expiresAt:now+2*HOUR,priority:70});
  return null;
 }
 const day=report(s,now,today,today),studiedMinutes=Math.floor(day.seconds/60),goal=Number(s.settings?.lifeBalance?.studyGoalMinutes||0);
 if(goal>0&&studiedMinutes>=goal)return null;
 const previous=previousStudy(s),hour=Number(new Date(now+offset*60000).toISOString().slice(11,13));
 const previousDay=previous&&dateKey(previous.lastStudied,offset)!==today;
 if(previous&&previousDay&&(goal===0||studiedMinutes<goal)){
  const item=previous.item,material=previous.material??(previous.kind==='materials'?item:null),title=material?.title??item.title;
  const related={relatedMaterialId:previous.kind==='materials'?item.id:item.relatedMaterialId??null,relatedTaskId:previous.kind==='tasks'?item.id:null,relatedGoalId:item.relatedGoalId??null};
  const kind=previous.kind==='tasks'?InitiativeKind.RESUME_UNFINISHED_TASK:InitiativeKind.CONTINUE_PREVIOUS_STUDY;
  return proposal({id:`${kind}:${item.id}`,kind,createdAt:now,speakerPlan:['SAYO'],reason:'previous-study',title,
   messages:[{speaker:'SAYO',text:`昨日${title}の途中だったよね。`},{speaker:'SAYO',text:'15分だけ続きやらない？'}],
   actionOptions:commitmentActions({minutes:DEFAULT_MINUTES,...related},DEFAULT_MINUTES),expiresAt:now+6*HOUR,priority:60,...related});
 }
 const plan=(s.plans??[]).find(p=>p.date===today&&!p.done&&!p.archived);
 if(plan)return proposal({id:`START_SMALL_SESSION:${plan.id}`,kind:InitiativeKind.START_SMALL_SESSION,createdAt:now,speakerPlan:['SAYO'],reason:'today-plan',title:plan.title,
  messages:[{speaker:'SAYO',text:`今日は${plan.title}の予定だったね。`},{speaker:'SAYO',text:'小さく始めよっか。'}],
  actionOptions:commitmentActions({minutes:DEFAULT_MINUTES,relatedPlanId:plan.id,relatedTaskId:plan.relatedTaskId??null,relatedMaterialId:plan.relatedMaterialId??null,relatedGoalId:plan.relatedGoalId??null},DEFAULT_MINUTES),
  expiresAt:now+6*HOUR,priority:50,relatedPlanId:plan.id,relatedTaskId:plan.relatedTaskId??null,relatedMaterialId:plan.relatedMaterialId??null,relatedGoalId:plan.relatedGoalId??null});
 const nearly=(s.goals??[]).find(g=>!g.archived&&!g.done&&g.target>0&&g.progress/g.target>=0.8&&g.progress<g.target);
 if(nearly)return proposal({id:`RECORD_PROGRESS:${nearly.id}`,kind:InitiativeKind.RECORD_PROGRESS,createdAt:now,speakerPlan:['NurseT'],reason:'goal-nearly-complete',title:nearly.title,
  messages:[{speaker:'NurseT',text:`目標まであと${Math.max(0,nearly.target-nearly.progress)}${nearly.unit}ですね。`},{speaker:'NurseT',text:'今日は復習だけでもよさそうです。'}],
  actionOptions:[{id:'review',kind:ActionKind.REVIEW,label:'今日を振り返る'},{id:'later',kind:ActionKind.SNOOZE,label:'あとで',minutes:60}],expiresAt:now+6*HOUR,priority:40,relatedGoalId:nearly.id});
 const mode=s.settings?.lifeBalance?.dailyMode??'NORMAL';
 const weekly=source==='open'&&mode!=='FOCUS'&&hour>=18&&new Date(now+offset*60000).getUTCDay()===0&&day.sessions.length>0;
 if(weekly)return proposal({id:'REVIEW_WEEK',kind:InitiativeKind.REVIEW_WEEK,createdAt:now,speakerPlan:['NurseT'],reason:'weekly-review',title:'今週の振り返り',
  messages:[{speaker:'NurseT',text:'今週の記録を、一緒に振り返りませんか？'}],actionOptions:[{id:'review',kind:ActionKind.REVIEW,label:'振り返る'},{id:'later',kind:ActionKind.SNOOZE,label:'あとで',minutes:180}],expiresAt:now+12*HOUR,priority:30});
 return null;
}

/** Follow-up after a study session ends; kept separate from Reward/Bond. */
export function followUp(s,now){
 const session=s.sessions.at(-1),material=session?.relatedMaterialId?entity(s,'materials',session.relatedMaterialId):null;
 if(!session||session.endTimestamp===null)return null;
 const minutes=Math.floor(totals(session,session.endTimestamp).study/60);
 if(minutes<10)return null;
 const title=material?.title??session.title;
 return proposal({id:`REVIEW_TODAY:${session.sessionId}`,kind:InitiativeKind.REVIEW_TODAY,createdAt:now,speakerPlan:['SAYO','NurseT'],reason:'study-finish',title,
  messages:[{speaker:'SAYO',text:'お、ちゃんと戻ってきたね。'},{speaker:'NurseT',text:`今日は${minutes}分です。まだ集中できそうですか？`}],
  actionOptions:[{id:'more',kind:ActionKind.START_STUDY,label:'あと15分',minutes:DEFAULT_MINUTES,relatedMaterialId:material?.id??null},{id:'stop',kind:ActionKind.DECLINE,label:'今日は終了'}],expiresAt:now+3*HOUR,priority:80});
}

export function validateProposal(value){
 if(!value||typeof value!=='object')return false;
 if(!INITIATIVE_KINDS.includes(value.kind))return false;
 if(typeof value.id!=='string'||!value.id||value.id.length>200)return false;
 if(typeof value.reason!=='string')return false;
 if(!Array.isArray(value.messages)||value.messages.length<1||value.messages.length>3)return false;
 return value.messages.every(m=>['SAYO','NurseT'].includes(m?.speaker)&&typeof m?.text==='string'&&m.text.length>0&&m.text.length<=800);
}
