package org.shinyakushin.study.next;
import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.os.Build;
import org.json.*;

/** One inexact alarm, no foreground service or background rendering loop. */
public final class BreakReceiver extends BroadcastReceiver {
    static final String CHANNEL="study-break";
    static PendingIntent alarm(Context c){return PendingIntent.getBroadcast(c,201,new Intent(c,BreakReceiver.class).setAction("org.shinyakushin.BREAK"),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
    static boolean permitted(Context c){return Build.VERSION.SDK_INT<33||c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED;}
    static void channel(Context c){NotificationManager n=c.getSystemService(NotificationManager.class);n.createNotificationChannel(new NotificationChannel(CHANNEL,"休憩の終わり",NotificationManager.IMPORTANCE_DEFAULT));}
    static void schedule(Context c,String raw){
        AlarmManager alarm=c.getSystemService(AlarmManager.class);alarm.cancel(alarm(c));c.getSystemService(NotificationManager.class).cancel(201);
        try{if(raw==null)return;JSONObject s=new JSONObject(raw),x=StateStore.active(s);if(!s.getJSONObject("settings").optBoolean("notifications")||!permitted(c)||x==null||x.isNull("breakUntil"))return;long when=x.getLong("breakUntil");if(when<=System.currentTimeMillis())return;alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,when,alarm(c));}catch(Exception ignored){}
    }
    @Override public void onReceive(Context c,Intent intent){
        StateStore store=null;try{store=new StateStore(c);String raw=store.read();if(raw==null)return;
            if(Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())||Intent.ACTION_MY_PACKAGE_REPLACED.equals(intent.getAction())){schedule(c,raw);LifeBalanceScheduler.ensure(c);CommitmentScheduler.ensure(c,raw);return;}
            JSONObject s=new JSONObject(raw),x=StateStore.active(s);if(x==null||x.isNull("breakUntil")||!s.getJSONObject("settings").optBoolean("notifications")||!permitted(c))return;
            if(x.getLong("breakUntil")>System.currentTimeMillis()){schedule(c,raw);return;}
            channel(c);PendingIntent open=PendingIntent.getActivity(c,201,new Intent(c,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
            Notification notification=new Notification.Builder(c,CHANNEL).setSmallIcon(android.R.drawable.ic_popup_reminder).setContentTitle("ひと息つけましたか").setContentText("準備ができたら、勉強の続きを。 ").setContentIntent(open).setAutoCancel(true).build();c.getSystemService(NotificationManager.class).notify(201,notification);
        }catch(Exception ignored){}finally{if(store!=null)store.close();}
    }
}
