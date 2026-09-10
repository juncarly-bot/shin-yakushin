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
