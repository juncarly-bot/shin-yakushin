package org.shinyakushin.study.next;

/**
 * Local, offline coaching policy. It receives only aggregate daily numbers that
 * already came from the read-only Usage/Study snapshot, never raw Usage events,
 * and it never writes StudySession, Reward, Bond, Memory or Usage state.
 *
 * The rules intentionally mirror app/src/main/assets/life-balance.js
 * coachingDecision(); tests/coaching-fixtures.tsv keeps both implementations on
 * the same contract.
 */
public final class CoachingPolicy {
    public static final String NONE="NONE", GENTLE="GENTLE", NORMAL="NORMAL", STRICT="STRICT";
    public static final String SAYO="SAYO", NURSE_T="NurseT";
    public static final String REASON_MODE="mode", REASON_COOLDOWN="cooldown", REASON_WITHIN_BUDGET="within-budget";
    public static final String REASON_GOAL_COMPLETE="goal-complete", REASON_BUDGET_EXCEEDED="budget-exceeded";

    /** Aggregate inputs only; every field is optional so a partial snapshot is safe. */
    public static final class Input {
        public String dailyMode="NORMAL";
        public boolean unlimited, restDay;
        public int budgetLimitMinutes, usedMinutes, studyGoalMinutes, studyCompletedMinutes;
        public String interventionLevel="NORMAL";
        public long cooldownMinutes=120, lastInterventionAt, now;
    }

    public static final class Decision {
        public final String level, speaker, reason;
        public final double progress;
        public final int exceededMinutes;
        Decision(String level,String speaker,String reason,double progress,int exceededMinutes){
            this.level=level;this.speaker=speaker;this.reason=reason;this.progress=progress;this.exceededMinutes=exceededMinutes;
        }
        public boolean actionable(){ return !NONE.equals(level) || REASON_GOAL_COMPLETE.equals(reason); }
    }

    private CoachingPolicy(){}

    public static Decision decide(Input in){
        Input value=in==null?new Input():in;
        String mode=value.dailyMode==null?NORMAL:value.dailyMode;
        int goal=Math.max(0,value.studyGoalMinutes), completed=Math.max(0,value.studyCompletedMinutes);
        double progress=goal==0?0:Math.min(1.0,(double)completed/goal);
        boolean unlimited=value.unlimited||"UNLIMITED".equals(mode)||value.budgetLimitMinutes<0;
        if("HOLIDAY".equals(mode)||"UNLIMITED".equals(mode)||value.restDay)return new Decision(NONE,null,REASON_MODE,progress,0);
        long cooldown=Math.max(0,value.cooldownMinutes)*60000L;
        if(value.lastInterventionAt>0&&value.now-value.lastInterventionAt<cooldown)return new Decision(NONE,null,REASON_COOLDOWN,progress,0);
        int exceeded=unlimited?0:Math.max(0,value.usedMinutes-Math.max(0,value.budgetLimitMinutes));
        if(exceeded<=0)return new Decision(NONE,null,REASON_WITHIN_BUDGET,progress,0);
        if(progress>=1)return new Decision(NONE,SAYO,REASON_GOAL_COMPLETE,progress,exceeded);
        boolean strict="FOCUS".equals(mode)||progress<0.35||STRICT.equals(value.interventionLevel);
        String level=strict?STRICT:(value.interventionLevel==null?NORMAL:value.interventionLevel);
        return new Decision(level,NURSE_T,REASON_BUDGET_EXCEEDED,progress,exceeded);
    }

    /** Same deterministic identity as life-balance.js interventionIdFor(). */
    public static String interventionId(String day,String mode,Decision decision,int exceededMinutes){
        int step=decision!=null&&REASON_BUDGET_EXCEEDED.equals(decision.reason)?exceededMinutes/30:0;
        String safeDay=day==null?"":day, safeMode=mode==null||mode.isEmpty()?NORMAL:mode;
        String reason=decision==null?"none":decision.reason;
        return safeDay+"|"+safeMode+"|"+reason+"|"+step;
    }
}
