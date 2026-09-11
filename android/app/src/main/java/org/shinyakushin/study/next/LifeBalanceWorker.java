package org.shinyakushin.study.next;

import android.content.Context;
import android.util.Log;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import org.json.JSONObject;

/**
 * Bounded periodic check. It reads the committed Study state and the transient OS
 * usage aggregate, decides locally, and never writes StudySession, Reward, Bond,
 * Memory, Usage or Remote AI state. Every failure path is a safe no-op.
 */
public final class LifeBalanceWorker extends Worker {
    static final String TAG="LifeBalanceWorker";
    public LifeBalanceWorker(Context context,WorkerParameters parameters){super(context,parameters);}
    @Override public Result doWork(){
        try{return check();}
        catch(Throwable failure){Log.i(TAG,"checked reason=error");return Result.success();}
    }

    private Result check(){
        Context context=getApplicationContext();
        String raw=readState(context);
        if(raw==null){Log.i(TAG,"checked reason=no-state");return Result.success();}
        JSONObject state;
        try{state=new JSONObject(raw);}
        catch(Exception unreadable){Log.i(TAG,"checked reason=state-unreadable");return Result.success();}
        JSONObject settings=state.optJSONObject("settings");
        JSONObject lifeBalance=settings==null?null:settings.optJSONObject("lifeBalance");
        if(lifeBalance==null){Log.i(TAG,"checked reason=no-life-balance");return Result.success();}
        long now=System.currentTimeMillis();
        JSONObject snapshot;
        try{snapshot=LifeBalanceSnapshot.read(context,raw,now);}
        catch(Exception unavailable){Log.i(TAG,"checked reason=usage-unavailable");return Result.success();}
        if(!snapshot.optBoolean("permissionGranted",false)){Log.i(TAG,"checked reason=no-usage-access");return Result.success();}
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
        return Result.success();
    }

    /** Read-only open; the worker never commits, restores or repairs user state. */
    private static String readState(Context context){
        StateStore store=null;
        try{store=new StateStore(context);return store.read();}
        catch(Exception unavailable){return null;}
        finally{if(store!=null)store.close();}
    }
}
