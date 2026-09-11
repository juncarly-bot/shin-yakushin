package org.shinyakushin.study.next;

/**
 * Pure gate for surfacing a local coaching decision as a notification. It keeps
 * the rules out of the Android layer so duplicate suppression and cooldown can
 * be verified without a device. The persisted last id / timestamp live in
 * SharedPreferences, so the behaviour survives an app restart.
 */
public final class InterventionGate {
    private InterventionGate(){}

    public static boolean allow(boolean actionable,boolean usagePermission,boolean notificationsEnabled,
            String interventionId,String lastNotifiedId,long lastNotifiedAt,long cooldownMinutes,long now){
        if(!actionable||!usagePermission||!notificationsEnabled)return false;
        if(interventionId==null||interventionId.isEmpty())return false;
        if(interventionId.equals(lastNotifiedId))return false;
        long cooldown=Math.max(0,cooldownMinutes)*60000L;
        if(lastNotifiedAt>0&&now>=lastNotifiedAt&&now-lastNotifiedAt<cooldown)return false;
        return true;
    }
}
