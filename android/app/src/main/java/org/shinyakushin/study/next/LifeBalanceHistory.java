package org.shinyakushin.study.next;

import android.content.Context;
import java.time.*;
import java.util.*;
import org.json.*;

/**
 * Read-only finalized past days for the weekly ledger. Each day is a bounded
 * local-midnight window joined from the transient OS usage aggregate and the
 * committed read-only Study segments. Nothing here writes Study, Reward, Bond,
 * Memory or Usage state; the JS ledger remains the single writer.
 */
final class LifeBalanceHistory {
    static final int DAYS=7;
    private LifeBalanceHistory(){}

    static JSONArray read(Context context,String raw,long now) throws JSONException {
        JSONObject state=raw==null?new JSONObject():new JSONObject(raw);
        JSONObject settings=state.optJSONObject("settings");
        JSONObject cfg=settings==null?null:settings.optJSONObject("lifeBalance");
        if(cfg==null)cfg=new JSONObject();
        JSONArray days=new JSONArray();
        AppUsageRepository repo=new AppUsageRepository(context);
        if(!repo.hasUsageAccess())return days;
        ZoneId zone=ZoneId.systemDefault();
        Map<String,AppUsageCategory> categories=new HashMap<>();
        JSONObject choices=cfg.optJSONObject("appCategories");
        if(choices!=null){Iterator<String> keys=choices.keys();while(keys.hasNext()){String pkg=keys.next();try{categories.put(pkg,AppUsageCategory.valueOf(choices.optString(pkg)));}catch(IllegalArgumentException ignored){}}}
        // A past day is judged against the configured default mode, never today's special day.
        String mode=cfg.optString("defaultMode","NORMAL");
        if(!Arrays.asList("NORMAL","HOLIDAY","FOCUS","UNLIMITED").contains(mode))mode="NORMAL";
        JSONObject budgets=cfg.optJSONObject("budgetMinutes");
        int fallback=mode.equals("FOCUS")?60:mode.equals("HOLIDAY")?180:90;
        int budget=Math.max(0,Math.min(1440,budgets==null?fallback:budgets.optInt(mode,fallback)));
        int goal=Math.max(0,Math.min(1440,cfg.optInt("studyGoalMinutes",0)));
        boolean unlimited=mode.equals("UNLIMITED");
        LocalDate today=Instant.ofEpochMilli(now).atZone(zone).toLocalDate();
        for(int back=1;back<=DAYS;back++){
            LocalDate date=today.minusDays(back);
            long start=date.atStartOfDay(zone).toInstant().toEpochMilli();
            long end=date.plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli();
            if(end>now)continue;
            Map<String,Long> totals=UsageIntervals.categories(repo.durations(start,end),categories);
            days.put(new JSONObject()
                .put("date",date.toString()).put("timeZone",zone.getId())
                .put("startMs",start).put("endMs",end).put("observedAt",end).put("complete",true)
                .put("mode",mode).put("budgetMinutes",unlimited?JSONObject.NULL:budget)
                .put("studyMinutes",studyMilliseconds(state,start,end)/60000L).put("goalMinutes",goal)
                .put("entertainmentMinutes",totals.getOrDefault("ENTERTAINMENT",0L)/60000L)
                .put("studyAppMinutes",totals.getOrDefault("STUDY",0L)/60000L)
                .put("neutralMinutes",totals.getOrDefault("NEUTRAL",0L)/60000L)
                .put("categoryCoverage",true));
        }
        return days;
    }

    /** Read-only Study mapping; the sum is clipped to the finalized window. */
    private static long studyMilliseconds(JSONObject state,long start,long end){
        long total=0;
        JSONArray sessions=state.optJSONArray("sessions");
        if(sessions==null)return 0;
        for(int i=0;i<sessions.length();i++){
            JSONObject session=sessions.optJSONObject(i);if(session==null)continue;
            JSONArray segments=session.optJSONArray("segments");if(segments==null)continue;
            for(int j=0;j<segments.length();j++){
                JSONObject segment=segments.optJSONObject(j);if(segment==null)continue;
                if(!"study".equals(segment.optString("kind")))continue;
                long a=segment.optLong("start",end),b=segment.isNull("end")?end:segment.optLong("end",end);
                total+=Math.max(0,Math.min(end,b)-Math.max(start,a));
            }
        }
        return total;
    }
}
