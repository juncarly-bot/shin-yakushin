package org.shinyakushin.study.next;

import android.app.*;
import android.content.*;
import org.json.*;

/**
 * Local, opt-in notification for one actionable coaching decision. It never runs
 * in a foreground service, never calls Remote AI, and never includes usage
 * minutes on the lock screen. If POST_NOTIFICATIONS is denied it quietly does
 * nothing: Study, Conversation and Usage keep working.
 */
public final class LifeBalanceNotifier {
    static final String CHANNEL="life-balance", PREFS="life-balance-notify", KEY_ID="lastNotifiedId", KEY_AT="lastNotifiedAt";
    static final int NOTIFICATION_ID=202;
    static final String ACTION="org.shinyakushin.LIFE_BALANCE";
    private LifeBalanceNotifier(){}

    static void ensureChannel(Context c){
        try{NotificationManager n=c.getSystemService(NotificationManager.class);n.createNotificationChannel(new NotificationChannel(CHANNEL,"生活バランス",NotificationManager.IMPORTANCE_DEFAULT));}catch(Exception ignored){}
    }

    /** Channel permission plus per-app notification toggle; either can disable only notifications. */
    static boolean notificationsEnabled(Context c){
        try{
            if(!BreakReceiver.permitted(c))return false;
            NotificationManager n=c.getSystemService(NotificationManager.class);
            return n!=null&&n.areNotificationsEnabled();
        }catch(Exception unavailable){return false;}
    }

    /** Opt-in, once per intervention id, with a persistent cooldown. Returns true only when posted. */
    static boolean maybeNotify(Context context,CoachingPolicy.Decision decision,String interventionId,String day,long now,JSONObject lifeBalance){
        try{
            if(decision==null||decision.speaker==null||!decision.actionable())return false;
            if(lifeBalance!=null&&!lifeBalance.optBoolean("usageNotifications",true))return false;
            if(!notificationsEnabled(context))return false;
            long cooldown=lifeBalance==null?120:Math.max(0,lifeBalance.optLong("cooldownMinutes",120));
            SharedPreferences prefs=context.getSharedPreferences(PREFS,Context.MODE_PRIVATE);
            if(!InterventionGate.allow(true,true,true,interventionId,prefs.getString(KEY_ID,""),prefs.getLong(KEY_AT,0),cooldown,now))return false;
            ensureChannel(context);
            Intent open=new Intent(context,MainActivity.class).setAction(ACTION)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra("interventionId",interventionId).putExtra("speaker",decision.speaker)
                .putExtra("reason",decision.reason).putExtra("day",day).putExtra("at",now);
            PendingIntent pending=PendingIntent.getActivity(context,NOTIFICATION_ID,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
            Notification notification=new Notification.Builder(context,CHANNEL)
                .setSmallIcon(android.R.drawable.ic_popup_reminder)
                .setContentTitle(InterventionCopy.title(decision.speaker))
                .setContentText(InterventionCopy.body(decision.reason,decision.speaker))
                .setContentIntent(pending).setAutoCancel(true).build();
            NotificationManager manager=context.getSystemService(NotificationManager.class);
            if(manager==null)return false;
            manager.notify(NOTIFICATION_ID,notification);
            prefs.edit().putString(KEY_ID,interventionId).putLong(KEY_AT,now).apply();
            return true;
        }catch(Throwable unavailable){return false;}
    }
}
