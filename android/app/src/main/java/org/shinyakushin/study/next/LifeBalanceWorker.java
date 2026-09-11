package org.shinyakushin.study.next;

import android.content.Context;
import android.util.Log;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

/** Thin periodic wrapper; LifeBalanceCheck holds the read-only logic. */
public final class LifeBalanceWorker extends Worker {
    static final String TAG=LifeBalanceCheck.TAG;
    public LifeBalanceWorker(Context context,WorkerParameters parameters){super(context,parameters);}
    @Override public Result doWork(){
        try{LifeBalanceCheck.run(getApplicationContext(),System.currentTimeMillis());}
        catch(Throwable failure){Log.i(TAG,"checked reason=error");}
        return Result.success();
    }
}
