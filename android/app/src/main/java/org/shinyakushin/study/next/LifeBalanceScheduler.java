package org.shinyakushin.study.next;

import android.content.Context;
import android.util.Log;
import androidx.work.*;
import java.util.concurrent.TimeUnit;

/**
 * One unique periodic check. PeriodicWorkRequest represents the interval, so no
 * foreground service and no per-second monitoring is used, and a restart keeps a
 * single enqueued work item instead of stacking duplicates.
 */
public final class LifeBalanceScheduler {
    static final String TAG="LifeBalanceWorker", UNIQUE="life-balance-check";
    static final long INTERVAL_MINUTES=30;
    private LifeBalanceScheduler(){}

    /** Idempotent while the periodic work exists: KEEP never resets a running schedule. */
    static void ensure(Context context){
        try{
            PeriodicWorkRequest request=new PeriodicWorkRequest.Builder(LifeBalanceWorker.class,INTERVAL_MINUTES,TimeUnit.MINUTES).build();
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(UNIQUE,ExistingPeriodicWorkPolicy.KEEP,request);
            Log.i(TAG,"unique "+UNIQUE+" scheduled=true intervalMinutes="+INTERVAL_MINUTES);
        }catch(Throwable unavailable){Log.i(TAG,"unique "+UNIQUE+" scheduled=false");}
    }
}
