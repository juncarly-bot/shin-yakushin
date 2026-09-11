import java.nio.file.*;
import java.util.*;
import org.shinyakushin.study.next.*;

public class CoachingPolicyTest {
    static void eq(Object a,Object b){if(!Objects.equals(a,b))throw new AssertionError(a+" != "+b);}
    public static void main(String[] args) throws Exception {
        int checked=0;
        for(String line:Files.readAllLines(Paths.get("tests/coaching-fixtures.tsv"))){
            if(line.isEmpty()||line.startsWith("#"))continue;
            String[] f=line.split("\t",-1);
            CoachingPolicy.Input in=new CoachingPolicy.Input();
            in.dailyMode=f[1];in.budgetLimitMinutes=Integer.parseInt(f[2]);in.unlimited="UNLIMITED".equals(f[1]);
            in.usedMinutes=Integer.parseInt(f[3]);in.studyGoalMinutes=Integer.parseInt(f[4]);in.studyCompletedMinutes=Integer.parseInt(f[5]);
            in.interventionLevel=f[6];in.cooldownMinutes=Long.parseLong(f[7]);in.lastInterventionAt=Long.parseLong(f[8]);in.now=Long.parseLong(f[9]);
            CoachingPolicy.Decision d=CoachingPolicy.decide(in);
            eq(d.level,f[10]);eq(d.speaker,"null".equals(f[11])?null:f[11]);eq(d.reason,f[12]);
            checked++;
        }
        Map<String,Long> totals=UsageIntervals.categories(Map.of(
            "com.google.android.youtube",52*60000L,"com.twitter.android",38*60000L,
            "com.android.chrome",45*60000L,"com.openai.chatgpt",35*60000L),
            Map.of("com.google.android.youtube",AppUsageCategory.ENTERTAINMENT,"com.twitter.android",AppUsageCategory.ENTERTAINMENT,
                   "com.android.chrome",AppUsageCategory.STUDY,"com.openai.chatgpt",AppUsageCategory.STUDY));
        eq(totals.get("ENTERTAINMENT"),90*60000L);
        eq(totals.get("STUDY"),80*60000L);
        eq(totals.get("NEUTRAL"),null);
        CoachingPolicy.Input real=new CoachingPolicy.Input();
        real.dailyMode="FOCUS";real.budgetLimitMinutes=60;real.usedMinutes=(int)(totals.get("ENTERTAINMENT")/60000L);
        real.studyGoalMinutes=180;real.studyCompletedMinutes=35;real.now=1700000000000L;
        CoachingPolicy.Decision decision=CoachingPolicy.decide(real);
        eq(decision.level,"STRICT");eq(decision.speaker,"NurseT");eq(decision.reason,"budget-exceeded");eq(decision.exceededMinutes,30);
        eq(CoachingPolicy.interventionId("2026-09-11","FOCUS",decision,decision.exceededMinutes),"2026-09-11|FOCUS|budget-exceeded|1");
        real.usedMinutes=82;decision=CoachingPolicy.decide(real);
        eq(decision.exceededMinutes,22);eq(decision.level,"STRICT");
        System.out.println("CoachingPolicy: "+checked+" fixtures, STUDY/NEUTRAL exclusion and FOCUS 82/60 intervention PASS");
    }
}
