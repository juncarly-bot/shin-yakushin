package org.shinyakushin.study.next;

import android.content.Context;
import android.util.Log;
import org.json.*;

/**
 * Bounded local check shared by the one-time worker and the debug trigger. It
 * reads the committed promise list only, decides locally whether a reminder is
 * warranted, and never writes StudySession, Reward, Bond, Memory, Usage or
 * Remote AI state. Every failure path is a safe no-op.
 */
final class CommitmentCheck {
    static final String TAG = "CommitmentWorker";
    static final long WINDOW = 6 * 3600000L;
    private CommitmentCheck() {}

    static JSONObject run(Context context, long now) {
        try { return check(context, now); }
        catch (Throwable failure) { Log.i(TAG, "checked reason=error"); return summary(false, "error"); }
    }

    private static JSONObject check(Context context, long now) {
        String raw = readState(context);
        if (raw == null) { Log.i(TAG, "checked reason=no-state"); return summary(false, "no-state"); }
        JSONObject state;
        try { state = new JSONObject(raw); }
        catch (Exception unreadable) { Log.i(TAG, "checked reason=state-unreadable"); return summary(false, "state-unreadable"); }
        JSONObject settings = state.optJSONObject("settings");
        if (settings == null || !settings.optBoolean("notifications")) { Log.i(TAG, "checked reason=notifications-off"); return summary(false, "notifications-off"); }
        if (activeSession(state)) { Log.i(TAG, "checked reason=study-active"); return summary(false, "study-active"); }
        JSONArray commitments = state.optJSONArray("commitments");
        if (commitments == null) { Log.i(TAG, "checked reason=no-due"); return summary(false, "no-due"); }
        String bestId = null, bestOwner = null;
        long bestDue = 0;
        for (int i = 0; i < commitments.length(); i++) {
            JSONObject c = commitments.optJSONObject(i);
            if (c == null) continue;
            String status = c.optString("status", "");
            long due;
            if ("PENDING".equals(status)) due = c.optLong("dueAt", -1);
            else if ("SNOOZED".equals(status)) due = c.optLong("snoozedUntil", -1);
            else continue;
            if (due <= 0 || due > now || now - due >= WINDOW) continue;
            if (bestId == null || due < bestDue) { bestId = c.optString("commitmentId", ""); bestOwner = c.optString("owner", "SAYO"); bestDue = due; }
        }
        if (bestId == null || bestId.isEmpty()) { Log.i(TAG, "checked reason=no-due"); return summary(false, "no-due"); }
        boolean notified = CommitmentNotifier.maybeNotify(context, bestId, bestOwner, bestDue, now);
        Log.i(TAG, "checked notified=" + notified + " reason=commitment-due id=" + bestId);
        JSONObject result = summary(true, "commitment-due");
        try { result.put("commitmentId", bestId).put("owner", bestOwner).put("notified", notified); } catch (Exception ignored) {}
        return result;
    }

    private static boolean activeSession(JSONObject state) {
        JSONArray sessions = state.optJSONArray("sessions");
        if (sessions == null) return false;
        for (int i = 0; i < sessions.length(); i++) {
            JSONObject s = sessions.optJSONObject(i);
            if (s != null && s.isNull("endTimestamp")) return true;
        }
        return false;
    }

    private static JSONObject summary(boolean checked, String reason) {
        JSONObject out = new JSONObject();
        try { out.put("checked", checked).put("reason", reason).put("notified", false); } catch (Exception ignored) {}
        return out;
    }

    /** Read-only open; the check never commits, restores or repairs user state. */
    private static String readState(Context context) {
        StateStore store = null;
        try { store = new StateStore(context); return store.read(); }
        catch (Exception unavailable) { return null; }
        finally { if (store != null) store.close(); }
    }
}
