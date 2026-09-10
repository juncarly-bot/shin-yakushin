package org.shinyakushin.study.next;

import android.app.AppOpsManager;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.drawable.Drawable;
import android.os.Process;
import android.provider.Settings;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Optional local UsageStats facade. Permission absence is a normal state. */
public final class AppUsageRepository {
    public static final class AppInfo {
        public final String packageName, label;
        public final Drawable icon;
        public final AppUsageCategory category;
        public final long foregroundMs;
        AppInfo(String packageName, String label, Drawable icon, AppUsageCategory category, long foregroundMs) {
            this.packageName = packageName; this.label = label; this.icon = icon; this.category = category; this.foregroundMs = foregroundMs;
        }
    }
    private final Context context;
    private final UsageStatsManager usage;
    private final PackageManager packages;
    private final Map<String, AppUsageCategory> classifications = new HashMap<>();
    public AppUsageRepository(Context context) {
        this.context = context.getApplicationContext();
        this.usage = (UsageStatsManager) this.context.getSystemService(Context.USAGE_STATS_SERVICE);
        this.packages = this.context.getPackageManager();
    }
    public boolean hasUsageAccess() {
        try {
            AppOpsManager ops = (AppOpsManager) context.getSystemService(Context.APP_OPS_SERVICE);
            int mode = ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.getPackageName());
            return mode == AppOpsManager.MODE_ALLOWED;
        } catch (RuntimeException ignored) { return false; }
    }
    public Intent usageAccessIntent() { return new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS); }
    public void setCategory(String packageName, AppUsageCategory category) {
        if (packageName != null && category != null) classifications.put(packageName, category);
    }
    public AppUsageCategory categoryFor(String packageName) { return classifications.getOrDefault(packageName, AppUsageCategory.NEUTRAL); }
    public List<AppInfo> todayApps(long now) {
        if (!hasUsageAccess() || usage == null) return Collections.emptyList();
        Map<String, Long> stats = todayDurations(now);
        List<AppInfo> result = new ArrayList<>();
        for (Map.Entry<String, Long> stat : stats.entrySet()) {
            if (stat.getValue() <= 0) continue;
            try {
                ApplicationInfo info = packages.getApplicationInfo(stat.getKey(), 0);
                if (packages.getLaunchIntentForPackage(stat.getKey()) == null) continue;
                result.add(new AppInfo(stat.getKey(), String.valueOf(packages.getApplicationLabel(info)), packages.getApplicationIcon(info), categoryFor(stat.getKey()), stat.getValue()));
            } catch (PackageManager.NameNotFoundException | RuntimeException ignored) { }
        }
        result.sort(Comparator.comparingLong((AppInfo x) -> x.foregroundMs).reversed());
        return result;
    }
    /** Missing events cannot be recovered exactly; never replace them with expanded daily buckets. */
    public Map<String, Long> todayDurations(long now) {
        if (!hasUsageAccess() || usage == null) return Collections.emptyMap();
        long start = UsageIntervals.dayStart(now, java.time.ZoneId.systemDefault());
        UsageIntervals intervals = new UsageIntervals(start, now);
        try {
            // Bounded lookback establishes a foreground session spanning local midnight.
            UsageEvents events = usage.queryEvents(Math.max(0, start - 86400000L), now);
            if (events == null) return Collections.emptyMap();
            UsageEvents.Event event = new UsageEvents.Event();
            while (events.hasNextEvent()) {
                events.getNextEvent(event);
                intervals.accept(event.getTimeStamp(), event.getEventType(), event.getPackageName(), event.getClassName());
            }
            return intervals.finish();
        } catch (RuntimeException ignored) { return Collections.emptyMap(); }
    }
    public DailyUsageContext summarize(long now, DailyMode mode, int studyGoalMinutes, int studyCompletedMinutes, int dailyBudgetMinutes) {
        Map<String, Long> categoryMs = UsageIntervals.categories(todayDurations(now), classifications);
        Map<String, Integer> totals = new HashMap<>();
        for (Map.Entry<String, Long> row : categoryMs.entrySet())
            totals.put(row.getKey(), (int) Math.min(Integer.MAX_VALUE, row.getValue() / 60000L));
        int entertainment = totals.getOrDefault("ENTERTAINMENT", 0);
        return new DailyUsageContext(hasUsageAccess(), mode, studyGoalMinutes, studyCompletedMinutes,
                new EntertainmentBudget(dailyBudgetMinutes, entertainment, mode == DailyMode.UNLIMITED), totals, 0);
    }
}
