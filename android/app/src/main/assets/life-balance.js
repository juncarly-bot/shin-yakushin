/** Local-only life balance policy. Raw UsageStats events never enter this module. */
export const DailyModes=Object.freeze({NORMAL:'NORMAL',HOLIDAY:'HOLIDAY',FOCUS:'FOCUS',UNLIMITED:'UNLIMITED'});
export const InterventionLevels=Object.freeze({GENTLE:'GENTLE',NORMAL:'NORMAL',STRICT:'STRICT'});
export function entertainmentBudget(mode, usedMinutes, limits={NORMAL:90,HOLIDAY:180,FOCUS:60}){
  const unlimited=mode===DailyModes.UNLIMITED, limit=unlimited?null:Math.max(0,Number(limits[mode]??90)), used=Math.max(0,Number(usedMinutes||0));
  return {mode,limit,usedMinutes:used,remainingMinutes:unlimited?null:Math.max(0,limit-used),exceededMinutes:unlimited?0:Math.max(0,used-limit),ratio:unlimited||limit===0?0:used/limit,unlimited};
}
export function coachingDecision(c={}){
  const mode=c.dailyMode||DailyModes.NORMAL, budget=c.entertainmentBudget||entertainmentBudget(mode,0), studyGoal=Math.max(0,Number(c.studyGoalMinutes||0)), studyCompleted=Math.max(0,Number(c.studyCompletedMinutes||0));
  const progress=studyGoal?Math.min(1,studyCompleted/studyGoal):0, cooldown=Number(c.cooldownMinutes??120)*60000, last=Number(c.lastInterventionAt||0), now=Number(c.now||Date.now());
  if(mode===DailyModes.HOLIDAY||mode===DailyModes.UNLIMITED||c.restDay)return {level:'NONE',speaker:null,reason:'mode'};
  if(last>0&&now-last<cooldown)return {level:'NONE',speaker:null,reason:'cooldown'};
  if(budget.exceededMinutes<=0)return {level:'NONE',speaker:null,reason:'within-budget'};
  if(progress>=1)return {level:'NONE',speaker:'SAYO',reason:'goal-complete'};
  const strict=mode===DailyModes.FOCUS||progress<0.35||c.interventionLevel===InterventionLevels.STRICT;
  return {level:strict?'STRICT':(c.interventionLevel||'NORMAL'),speaker:'NurseT',reason:'budget-exceeded',progress,exceededMinutes:budget.exceededMinutes};
}
export function weeklyUsageSummary(days=[],previous={}){
  const out={studyMinutes:0,entertainmentMinutes:0,budgetSuccessDays:0,studyGoalSuccessDays:0,interventionCount:0,returnToStudyCount:0,categoryMinutes:{}};
  for(const d of days){out.studyMinutes+=Number(d.studyMinutes||0);out.entertainmentMinutes+=Number(d.entertainmentMinutes||0);if(d.budgetSuccess)out.budgetSuccessDays++;if(d.studyGoalSuccess)out.studyGoalSuccessDays++;out.interventionCount+=Number(d.interventionCount||0);out.returnToStudyCount+=Number(d.returnToStudyCount||0);for(const [k,v] of Object.entries(d.categoryMinutes||{}))out.categoryMinutes[k]=(out.categoryMinutes[k]||0)+Number(v||0)}
  return {...out,previousStudyMinutes:Number(previous.studyMinutes||0),studyDeltaMinutes:out.studyMinutes-Number(previous.studyMinutes||0)};
}
/** Build the aggregate budget from a real LifeBalanceSnapshot without re-reading Usage. */
export function budgetFromSnapshot(snapshot={}){
  const unlimited=snapshot.dailyMode===DailyModes.UNLIMITED||snapshot.entertainmentBudgetMinutes===null;
  const limit=unlimited?null:Math.max(0,Number(snapshot.entertainmentBudgetMinutes??90));
  const used=Math.max(0,Number(snapshot.entertainmentUsedMinutes||0));
  return {mode:snapshot.dailyMode,limit,usedMinutes:used,remainingMinutes:unlimited?null:Math.max(0,limit-used),exceededMinutes:unlimited?0:Math.max(0,used-limit),ratio:unlimited||limit===0?0:used/limit,unlimited};
}
/** Deterministic identity shared with the background worker so one day/reason fires once. */
export function interventionIdFor(snapshot={},decision={},budget={}){
  const step=decision.reason==='budget-exceeded'?Math.floor(Number(budget.exceededMinutes||0)/30):0;
  return [snapshot.day||'',snapshot.dailyMode||DailyModes.NORMAL,decision.reason||'none',step].join('|');
}
/** Real Usage + real Study snapshot -> local policy. Never mutates Usage or Study. */
export function coachingFromSnapshot(snapshot={},lifeBalance={},now=Date.now()){
  const budget=budgetFromSnapshot(snapshot);
  const decision=coachingDecision({dailyMode:snapshot.dailyMode,entertainmentBudget:budget,studyGoalMinutes:snapshot.studyGoalMinutes,studyCompletedMinutes:snapshot.studyCompletedMinutes,cooldownMinutes:lifeBalance.cooldownMinutes,interventionLevel:lifeBalance.interventionLevel,lastInterventionAt:lifeBalance.lastInterventionAt,now});
  const interventionId=interventionIdFor(snapshot,decision,budget);
  const duplicate=decision.level!=='NONE'&&lifeBalance.lastInterventionId===interventionId;
  return {...decision,budget,interventionId,day:snapshot.day||'',suppressed:duplicate,level:duplicate?'NONE':decision.level,speaker:duplicate?null:decision.speaker,reason:duplicate?'duplicate':decision.reason};
}
/** Short local text only; raw usage minutes never leave the device. */
export function coachingMessage(decision={},budget={}){
  if(decision.reason==='goal-complete')return '今日の目標まで届いたね。よく頑張った。';
  if(decision.reason!=='budget-exceeded')return '';
  const over=Math.max(0,Number(budget.exceededMinutes||0));
  return decision.speaker==='NurseT'?`娯楽が予定を${over}分超えています。そろそろ学習の続きに戻りませんか？`:'少し休んだら、学習の続きに戻ろう。';
}

/** Privacy-safe copy shared with the notification layer; never contains usage minutes. */
export const InterventionCopy=Object.freeze({
  TITLE_NURSE_T:'Tから呼ばれています', TITLE_SAYO:'小夜から',
  BODY_RETURN:'そろそろ戻ってきませんか？', BODY_GENTLE:'少し休んだら、学習の続きに戻ろう。',
  BODY_GOAL_COMPLETE:'今日の目標まで届いたね。よく頑張った。'
});
/** Local reconstruction of the intervention message; the Intent only carries ids. */
export function interventionMessage(reason,speaker){
  const title=speaker==='NurseT'?InterventionCopy.TITLE_NURSE_T:InterventionCopy.TITLE_SAYO;
  const body=reason==='goal-complete'?InterventionCopy.BODY_GOAL_COMPLETE:speaker==='NurseT'?InterventionCopy.BODY_RETURN:InterventionCopy.BODY_GENTLE;
  return {title,body};
}
