package org.shinyakushin.study.next;

import android.content.Context;
import android.util.Log;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

/** Thin one-time wrapper; CommitmentCheck holds the read-only logic. */
public final class CommitmentWorker extends Worker {
    public CommitmentWorker(Context context, WorkerParameters parameters) { super(context, parameters); }
    @Override public Result doWork() {
        try { CommitmentCheck.run(getApplicationContext(), System.currentTimeMillis()); }
        catch (Throwable failure) { Log.i(CommitmentCheck.TAG, "checked reason=error"); }
        return Result.success();
    }
}
