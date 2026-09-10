package org.shinyakushin.study.next;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/** Bounded, summarized context safe to pass to dialogue generation. */
public final class DailyUsageContext {
    public final boolean permissionGranted;
    public final DailyMode mode;
    public final int studyGoalMinutes;
    public final int studyCompletedMinutes;
    public final EntertainmentBudget entertainmentBudget;
    public final Map<String, Integer> categoryMinutes;
    public final long lastInterventionAt;

    public DailyUsageContext(boolean permissionGranted, DailyMode mode, int studyGoalMinutes,
            int studyCompletedMinutes, EntertainmentBudget budget, Map<String, Integer> categoryMinutes,
            long lastInterventionAt) {
        this.permissionGranted = permissionGranted;
        this.mode = mode == null ? DailyMode.NORMAL : mode;
        this.studyGoalMinutes = Math.max(0, studyGoalMinutes);
        this.studyCompletedMinutes = Math.max(0, studyCompletedMinutes);
        this.entertainmentBudget = budget == null ? new EntertainmentBudget(90, 0, false) : budget;
        this.categoryMinutes = Collections.unmodifiableMap(new LinkedHashMap<>(categoryMinutes == null ? Collections.emptyMap() : categoryMinutes));
        this.lastInterventionAt = Math.max(0, lastInterventionAt);
    }
    public double studyProgress() { return studyGoalMinutes == 0 ? 0.0 : Math.min(1.0, (double) studyCompletedMinutes / studyGoalMinutes); }
    public boolean shouldMentionUsage() { return permissionGranted && (entertainmentBudget.exceededMinutes() > 0 || studyProgress() < 0.5); }
}
