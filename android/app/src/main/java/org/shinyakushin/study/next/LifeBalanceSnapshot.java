package org.shinyakushin.study.next;

import android.content.Context;
import java.time.*;
import java.util.*;
import org.json.*;

/** Read-only join of the committed Study state and transient OS usage aggregates. */
final class LifeBalanceSnapshot {
    static JSONObject read(Context context, String raw, long now) throws JSONException {
        JSONObject state = raw == null ? new JSONObject() : new JSONObject(raw);
        JSONObject settings = state.optJSONObject("settings");
        JSONObject cfg = settings == null ? null : settings.optJSONObject("lifeBalance");
        if (cfg == null) cfg = new JSONObject();
        ZoneId zone = ZoneId.systemDefault();
        String day = Instant.ofEpochMilli(now).atZone(zone).toLocalDate().toString();
        long start = UsageIntervals.dayStart(now, zone);
        String mode = cfg.optString("dailyMode", "NORMAL");
        if (cfg.has("modeDay") && !day.equals(cfg.optString("modeDay"))) mode = cfg.optString("defaultMode", "NORMAL");
        if (!Arrays.asList("NORMAL","HOLIDAY","FOCUS","UNLIMITED").contains(mode)) mode="NORMAL";
        JSONObject budgets=cfg.optJSONObject("budgetMinutes");
        int fallback=mode.equals("FOCUS")?60:mode.equals("HOLIDAY")?180:90;
        int budget=Math.max(0,Math.min(1440,budgets==null?fallback:budgets.optInt(mode,fallback)));
        int goal=Math.max(0,Math.min(1440,cfg.optInt("studyGoalMinutes",0)));
        long studyMs=0,recentStudy=0,recentBreak=0;boolean studying=false;
        JSONArray sessions=state.optJSONArray("sessions");
        if(sessions!=null)for(int i=0;i<sessions.length();i++){
            JSONObject session=sessions.optJSONObject(i);if(session==null)continue;
            JSONArray segments=session.optJSONArray("segments");if(segments==null)continue;
            for(int j=0;j<segments.length();j++){
                JSONObject segment=segments.optJSONObject(j);if(segment==null)continue;
                long a=segment.optLong("start",now),b=segment.isNull("end")?now:segment.optLong("end",now);
                long clipped=Math.max(0,Math.min(now,b)-Math.max(start,a));
                if("study".equals(segment.optString("kind"))){studyMs+=clipped;if(clipped>0)recentStudy=Math.max(recentStudy,Math.min(now,b));if(segment.isNull("end")&&a<=now)studying=true;}
                if("break".equals(segment.optString("kind"))&&clipped>0)recentBreak=Math.max(recentBreak,Math.min(now,b));
            }
        }
        AppUsageRepository repo=new AppUsageRepository(context);
        Map<String,AppUsageCategory> categories=new HashMap<>();JSONObject choices=cfg.optJSONObject("appCategories");
        if(choices!=null){Iterator<String> keys=choices.keys();while(keys.hasNext()){String pkg=keys.next();try{categories.put(pkg,AppUsageCategory.valueOf(choices.optString(pkg)));}catch(IllegalArgumentException ignored){}}}
        Map<String,Long> totals=UsageIntervals.categories(repo.todayDurations(now),categories);
        long used=totals.getOrDefault("ENTERTAINMENT",0L)/60000L;
        boolean unlimited=mode.equals("UNLIMITED");
        return new JSONObject().put("day",day).put("observedAt",now).put("permissionGranted",repo.hasUsageAccess())
            .put("dailyMode",mode).put("studyGoalMinutes",goal).put("studyCompletedMinutes",studyMs/60000L)
            .put("studyProgress",goal==0?0:Math.min(1.0,(double)studyMs/(goal*60000L)))
            .put("entertainmentBudgetMinutes",unlimited?JSONObject.NULL:budget).put("entertainmentUsedMinutes",used)
            .put("entertainmentRemainingMinutes",unlimited?JSONObject.NULL:Math.max(0,budget-used))
            .put("recentStudyAt",recentStudy).put("recentBreakAt",recentBreak).put("currentlyStudying",studying);
    }
}
