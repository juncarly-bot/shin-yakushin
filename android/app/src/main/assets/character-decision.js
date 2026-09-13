/**
 * Character perception and decision.
 *
 * Situation (authoritative, locally assembled)
 *   -> perceive(character)      what this companion notices first
 *   -> decide(character)        stance + recommendation + emotion
 *   -> dialogue.js              wording, including reactions to the other companion
 *
 * The two companions must be able to reach different, individually valid
 * conclusions about the exact same situation. Nothing here talks to a model and
 * nothing here mutates state.
 */
import {active,entity,report,dateKey,totals} from './domain.js';
import {profileFor} from './characters.js';

export const ConversationMode=Object.freeze({
 CASUAL:'CASUAL',STUDY_START:'STUDY_START',STUDY_CONTINUATION:'STUDY_CONTINUATION',POST_STUDY:'POST_STUDY',
 PLANNING:'PLANNING',REVIEW:'REVIEW',RECOVERY:'RECOVERY',RETURN_AFTER_ABSENCE:'RETURN_AFTER_ABSENCE',
 OPEN_THREAD_FOLLOWUP:'OPEN_THREAD_FOLLOWUP',COMMITMENT_FOLLOWUP:'COMMITMENT_FOLLOWUP',DEFERRED_RETURN:'DEFERRED_RETURN'
});
export const CONVERSATION_MODES=Object.freeze(Object.values(ConversationMode));

const HOUR=3600000;
export const isLateNight=(now,offset)=> {const h=Number(new Date(now+offset*60000).toISOString().slice(11,13));return h>=23||h<5};

const FATIGUE=/もう疲れ|へとへと|しんど|限界|もう無理|疲れたー/;
const SLEEPY=/眠い|眠たい|もう寝|寝る/;
const PLANNING=/計画|予定|スケジュール|何時|時間割|見積|何分|何時間|ペース|間に合|配分|組み方|どう組/;
const AMBITION=/やろうかな|やるぞ|頑張る|がんばる|\d{1,2}\s*時間/;
const REVIEW=/振り返|レビュー|今週|先週|まとめ|記録の整理/;
const STUCK=/わからない|分からない|よく分から|むずかしい|難しい|つまず|引っかか|詰ま/;
const POSTPONE=/あとで|後で|今度|次に|また今度|保留/;

/** Which conversation this is. Modes exist so the companions do not force every turn into a Study CTA. */
export function conversationMode(situation){
 const {text='',activeStudy,studyMinutes=0,goalMinutes=0,lastMinutes=0,event=null,thread=null,commitment=null,recovery=false}=situation;
 if(commitment)return ConversationMode.COMMITMENT_FOLLOWUP;
 if(thread)return ConversationMode.OPEN_THREAD_FOLLOWUP;
 if(activeStudy)return ConversationMode.STUDY_CONTINUATION;
 if(FATIGUE.test(text))return ConversationMode.RECOVERY;
 if(SLEEPY.test(text))return ConversationMode.CASUAL;
 if(PLANNING.test(text)||AMBITION.test(text))return ConversationMode.PLANNING;
 if(REVIEW.test(text)||['dailyReview','weeklyReview'].includes(event))return ConversationMode.REVIEW;
 if(event==='finish'||event==='goal')return ConversationMode.POST_STUDY;
 if(event==='start'||event==='resume')return ConversationMode.STUDY_START;
 if(recovery)return ConversationMode.RETURN_AFTER_ABSENCE;
 if(lastMinutes>0&&studyMinutes===0)return ConversationMode.CASUAL;
 return ConversationMode.CASUAL;
}

/** Local, bounded view of the world. Reads authoritative state; never writes it. */
export function buildSituation(s,now,extra={}){
 const offset=s.settings?.utcOffsetMinutes??540,today=dateKey(now,offset),session=active(s);
 const day=report(s,now,today,today),studyMinutes=Math.floor(day.seconds/60);
 const goalMinutes=Number(s.settings?.lifeBalance?.studyGoalMinutes||0);
 const finished=[...s.sessions].filter(x=>x.endTimestamp!==null).sort((a,b)=>b.endTimestamp-a.endTimestamp);
 const last=finished[0]??null,lastMinutes=last?Math.floor(totals(last,last.endTimestamp).study/60):0;
 const studyDays=new Set(finished.flatMap(x=>(x.segments||[]).filter(p=>p.kind==='study').map(p=>dateKey(p.start,offset)))).size;
 const text=String(extra.text??''),event=extra.event??null;
 const base={
  text,event,mode:null,activeStudy:Boolean(session),activeMinutes:session?Math.floor(totals(session,now).study/60):0,
  studyMinutes,goalMinutes,goalNear:goalMinutes>0&&studyMinutes>=goalMinutes*0.8&&studyMinutes<goalMinutes,
  goalReached:goalMinutes>0&&studyMinutes>=goalMinutes,lastMinutes,last,
  lateNight:isLateNight(now,offset),fatigue:FATIGUE.test(text),sleepy:SLEEPY.test(text),
  planning:PLANNING.test(text)||AMBITION.test(text),review:REVIEW.test(text),stuck:STUCK.test(text),postpone:POSTPONE.test(text),
  studyDays,offset,now
 };
 base.thread=extra.thread??null;base.commitment=extra.commitment??null;base.mode=extra.mode??conversationMode(base);
 base.topic=extra.topic??(base.thread?.topic??entity(s,'materials',session?.relatedMaterialId)?.title??'');
 return base;
}

/**
 * What this companion notices first. The bias is per-character, so the same
 * situation produces different observations before any wording exists.
 */
export function perceive(situation,id){
 const profile=profileFor(id),notices=[];
 const add=(bias,text)=>{if(bias)notices.push(text)};
 if(id==='SAYO'){
  add(situation.fatigue,'いまは気持ちが先に疲れている');
  add(situation.sleepy,'もう眠たそう');
  add(situation.goalNear,'あと少しで届きそうなこと');
  add(situation.stuck,'まだ引っかかっているところ');
  add(situation.lastMinutes>=90,'今日はよく続いたこと');
  add(situation.mode===ConversationMode.PLANNING,'やる気が出ていること');
 }else{
  add(situation.lateNight,'もう遅い時間であること');
  add(situation.activeMinutes>=90,'連続で90分を越えていること');
  add(situation.goalNear,'目標までの残り');
  add(situation.planning||situation.mode===ConversationMode.PLANNING,'見積もりの現実性');
  add(situation.lastMinutes>0,'前回の進み方とペース');
  add(situation.stuck,'どこで止まっているか');
 }
 return {character:id,notices,attentionBias:profile.attentionBias};
}

const decision=(stance,kind,emotion,extra={})=>({stance,recommendation:{kind,...extra},emotion,wantsToSpeak:true,...extra});

/**
 * The conclusion this companion reaches. Deterministic and side-effect free.
 * `recommendation.kind` uses a shared vocabulary: NONE / START / CONTINUE /
 * BREAK / STOP / PLAN_NEXT / REST / REVIEW / CHAT / CELEBRATE.
 */
export function decide(situation,id){
 const mode=situation.mode;
 if(id==='SAYO'){
  if(situation.sleepy&&!situation.fatigue)return decision('sleep','REST','calm',{minutes:0});
 if(situation.fatigue)return decision('wind-down','STOP','calm',{minutes:0});
  if(mode===ConversationMode.POST_STUDY||situation.event==='finish')return decision('celebrate','CELEBRATE','pleased',{minutes:situation.lastMinutes});
 if(situation.lateNight&&(situation.goalNear||situation.studyMinutes>=60))return decision('wind-down','STOP','relaxed');
 if(situation.activeStudy&&situation.activeMinutes>=90)return decision('let-go','BREAK','relaxed',{minutes:10});
  if(mode===ConversationMode.REVIEW)return decision('recall','REVIEW','pleased');
  if(mode===ConversationMode.PLANNING)return decision('enthuse','START','pleased',{minutes:15});
  if(situation.stuck)return decision('next-step','CONTINUE','focused');
  if(mode===ConversationMode.CASUAL)return decision('chat','CHAT','calm');
  return decision('small-start','START','focused',{minutes:15});
 }
 if(situation.activeStudy&&situation.activeMinutes>=90)return decision('suggest-break','BREAK','calm',{minutes:10});
 if(situation.fatigue)return decision('agree-and-plan','PLAN_NEXT','calm',{minutes:15});
 if(situation.sleepy)return decision('observe','REST','calm');
 if(situation.lateNight&&situation.goalNear)return decision('plan-next','PLAN_NEXT','calm',{minutes:Math.max(5,situation.goalMinutes-situation.studyMinutes)});
 if(mode===ConversationMode.POST_STUDY||situation.event==='finish')return decision('acknowledge','CELEBRATE','pleased');
 if(mode===ConversationMode.PLANNING)return decision('feasibility-check','PLAN_NEXT','focused',{minutes:90});
 if(mode===ConversationMode.REVIEW)return decision('structured-review','REVIEW','calm');
 if(situation.goalReached)return decision('acknowledge','CELEBRATE','pleased');
 if(mode===ConversationMode.CASUAL)return decision('observe','CHAT','calm');
 return decision('observe','NONE','calm');
}

/** Both decisions at once, so callers can compare without recomputing. */
export function decideBoth(situation){return {SAYO:decide(situation,'SAYO'),NurseT:decide(situation,'NurseT')}}

/** Two characters disagree when their conclusions differ before wording. */
export function decisionsDiffer(a,b){return a.stance!==b.stance||a.recommendation.kind!==b.recommendation.kind}
