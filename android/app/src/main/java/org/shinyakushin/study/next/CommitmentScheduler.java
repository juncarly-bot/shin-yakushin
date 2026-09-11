package org.shinyakushin.study.next;

import android.content.Context;
import android.util.Log;
import androidx.work.*;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.concurrent.TimeUnit;

/**
 * One unique one-time reminder for the earliest open promise. WorkManager's
 * initialDelay is inexact on purpose: no exact-alarm permission and no
 * foreground service are needed, and a new promise simply replaces the pending
 * delay instead of stacking duplicates.
 */
final class CommitmentScheduler {
    static final String TAG = "CommitmentWorker", UNIQUE = "commitment-reminder";
    private CommitmentScheduler() {}

    static void ensure(Context context, String raw) {
        try {
            WorkManager manager = WorkManager.getInstance(context);
            long delay = nextDue(raw, System.currentTimeMillis());
            if (delay < 0) { manager.cancelUniqueWork(UNIQUE); Log.i(TAG, "unique " + UNIQUE + " scheduled=false"); return; }
            OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(CommitmentWorker.class)
                .setInitialDelay(delay, TimeUnit.MILLISECONDS).build();
            manager.enqueueUniqueWork(UNIQUE, ExistingWorkPolicy.REPLACE, request);
            Log.i(TAG, "unique " + UNIQUE + " scheduled=true delayMs=" + delay);
        } catch (Throwable unavailable) { Log.i(TAG, "unique " + UNIQUE + " scheduled=false"); }
    }

    /** Delay until the earliest open promise, or -1 when nothing is pending. Read-only. */
    static long nextDue(String raw, long now) {
        if (raw == null) return -1;
        try {
            JSONArray commitments = new JSONObject(raw).optJSONArray("commitments");
            if (commitments == null) return -1;
            long best = -1;
            for (int i = 0; i < commitments.length(); i++) {
                JSONObject c = commitments.optJSONObject(i);
                if (c == null) continue;
                String status = c.optString("status", "");
                long due;
                if ("PENDING".equals(status)) due = c.optLong("dueAt", -1);
                else if ("SNOOZED".equals(status)) due = c.optLong("snoozedUntil", -1);
                else continue;
                if (due <= 0) continue;
                long delay = Math.max(0, due - now);
                if (best < 0 || delay < best) best = delay;
            }
            return best;
        } catch (Exception unreadable) { return -1; }
    }
}
