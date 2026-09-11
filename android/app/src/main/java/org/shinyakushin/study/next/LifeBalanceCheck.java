package org.shinyakushin.study.next;

import android.content.Context;
import android.util.Log;
import org.json.JSONObject;

/**
 * Bounded local check shared by the periodic worker and the debug-only device
 * trigger. It reads the committed Study state and the transient OS usage
 * aggregate, decides locally, and never writes StudySession, Reward, Bond,
 * Memory, Usage or Remote AI state. Every failure path is a safe no-op.
 */
final class LifeBalanceCheck {
    static final String TAG="LifeBalanceWorker";
    private LifeBalanceCheck(){}

    /** Returns a small diagnostic summary; never throws. */
    static JSONObject run(Context context,long now){
        try{return check(context,now);}
        catch(Throwable failure){Log.i(TAG,"checked reason=error");return summary(false,"error",null,null,0,0,0);}
    }

    private static JSONObject check(Context context,long now){
        String raw=readState(context);
        if(raw==null){Log.i(TAG,"checked reason=no-state");return summary(false,"no-state",null,null,0,0,0);}
        JSONObject state;
        try{state=new JSONObject(raw);}
        catch(Exception unreadable){Log.i(TAG,"checked reason=state-unreadable");return summary(false,"state-unreadable",null,null,0,0,0);}
        JSONObject settings=state.optJSONObject("settings");
        JSONObject lifeBalance=settings==null?null:settings.optJSONObject("lifeBalance");
        if(lifeBalance==null){Log.i(TAG,"checked reason=no-life-balance");return summary(false,"no-life-balance",null,null,0,0,0);}
        JSONObject snapshot;
        try{snapshot=LifeBalanceSnapshot.read(context,raw,now);}
        catch(Exception unavailable){Log.i(TAG,"checked reason=usage-unavailable");return summary(false,"usage-unavailable",null,null,0,0,0);}
        if(!snapshot.optBoolean("permissionGranted",false)){Log.i(TAG,"checked reason=no-usage-access");return summary(false,"no-usage-access",null,null,0,0,0);}
        CoachingPolicy.Input input=new CoachingPolicy.Input();
        input.dailyMode=snapshot.optString("dailyMode",CoachingPolicy.NORMAL);
        input.unlimited="UNLIMITED".equals(input.dailyMode)||snapshot.isNull("entertainmentBudgetMinutes");
        input.budgetLimitMinutes=snapshot.isNull("entertainmentBudgetMinutes")?0:snapshot.optInt("entertainmentBudgetMinutes",0);
        input.usedMinutes=Math.max(0,snapshot.optInt("entertainmentUsedMinutes",0));
        input.studyGoalMinutes=Math.max(0,snapshot.optInt("studyGoalMinutes",0));
        input.studyCompletedMinutes=Math.max(0,snapshot.optInt("studyCompletedMinutes",0));
        input.interventionLevel=lifeBalance.optString("interventionLevel",CoachingPolicy.NORMAL);
        input.cooldownMinutes=Math.max(0,lifeBalance.optLong("cooldownMinutes",120));
        input.lastInterventionAt=Math.max(0,lifeBalance.optLong("lastInterventionAt",0));
        input.now=now;
        CoachingPolicy.Decision decision=CoachingPolicy.decide(input);
        String day=snapshot.optString("day","");
        String interventionId=CoachingPolicy.interventionId(day,input.dailyMode,decision,decision.exceededMinutes);
        boolean notified=LifeBalanceNotifier.maybeNotify(context,decision,interventionId,day,now,lifeBalance);
        Log.i(TAG,"checked notified="+notified+" reason="+decision.reason+" speaker="+(decision.speaker==null?"none":decision.speaker)
            +" level="+decision.level+" actionable="+decision.actionable()+" id="+interventionId
            +" usage="+input.usedMinutes+" study="+input.studyCompletedMinutes+"/"+input.studyGoalMinutes);
        JSONObject result=summary(true,decision.reason,decision.speaker,decision.level,input.usedMinutes,input.studyCompletedMinutes,input.studyGoalMinutes);
        try{result.put("actionable",decision.actionable()).put("notified",notified).put("interventionId",interventionId).put("mode",input.dailyMode);}
        catch(Exception ignored){}
        return result;
    }

    private static JSONObject summary(boolean checked,String reason,String speaker,String level,int usage,int study,int goal){
        JSONObject out=new JSONObject();
        try{out.put("checked",checked).put("reason",reason).put("speaker",speaker==null?JSONObject.NULL:speaker)
            .put("level",level==null?JSONObject.NULL:level).put("actionable",false).put("notified",false)
            .put("usageMinutes",usage).put("studyMinutes",study).put("goalMinutes",goal);}
        catch(Exception ignored){}
        return out;
    }

    /** Read-only open; the check never commits, restores or repairs user state. */
    private static String readState(Context context){
        StateStore store=null;
        try{store=new StateStore(context);return store.read();}
        catch(Exception unavailable){return null;}
        finally{if(store!=null)store.close();}
    }
}
