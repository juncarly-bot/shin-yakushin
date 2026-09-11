package org.shinyakushin.study.next;

import android.app.*;
import android.content.*;
import org.json.*;

/**
 * One local reminder for a due promise. It never runs in a foreground service,
 * never calls Remote AI, and never includes study detail on the lock screen.
 * If POST_NOTIFICATIONS is denied it quietly does nothing.
 */
final class CommitmentNotifier {
    static final String CHANNEL = "commitment-reminder";
    static final String PREFS = "commitment-notify", KEY_SIG = "lastNotifiedSignature";
    static final int NOTIFICATION_ID = 203;
    static final String ACTION = "org.shinyakushin.COMMITMENT";
    private CommitmentNotifier() {}

    static void ensureChannel(Context c) {
        try {
            NotificationManager n = c.getSystemService(NotificationManager.class);
            n.createNotificationChannel(new NotificationChannel(CHANNEL, "約束の時間", NotificationManager.IMPORTANCE_DEFAULT));
        } catch (Exception ignored) {}
    }

    /** At most one reminder per (promise, due moment); snoozing arms exactly one later prompt. */
    static boolean maybeNotify(Context context, String commitmentId, String owner, long due, long now) {
        try {
            if (commitmentId == null || commitmentId.isEmpty()) return false;
            if (!LifeBalanceNotifier.notificationsEnabled(context)) return false;
            String signature = commitmentId + "@" + due;
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            if (signature.equals(prefs.getString(KEY_SIG, ""))) return false;
            ensureChannel(context);
            boolean nurse = "NurseT".equals(owner);
            Intent open = new Intent(context, MainActivity.class).setAction(ACTION)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra("commitmentId", commitmentId).putExtra("at", due);
            PendingIntent pending = PendingIntent.getActivity(context, NOTIFICATION_ID, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            Notification notification = new Notification.Builder(context, CHANNEL)
                .setSmallIcon(android.R.drawable.ic_popup_reminder)
                .setContentTitle(nurse ? CommitmentCopy.TITLE_NURSE_T : CommitmentCopy.TITLE_SAYO)
                .setContentText(nurse ? CommitmentCopy.BODY_NURSE_T : CommitmentCopy.BODY_SAYO)
                .setContentIntent(pending).setAutoCancel(true).build();
            NotificationManager manager = context.getSystemService(NotificationManager.class);
            if (manager == null) return false;
            manager.notify(NOTIFICATION_ID, notification);
            prefs.edit().putString(KEY_SIG, signature).apply();
            return true;
        } catch (Throwable unavailable) { return false; }
    }
}
