package org.shinyakushin.study.next;

import android.app.AppOpsManager;
import android.app.usage.UsageStats;
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
        long start = now - 24L * 60 * 60 * 1000;
        Map<String, UsageStats> stats;
        try { stats = usage.queryAndAggregateUsageStats(start, now); } catch (RuntimeException ignored) { return Collections.emptyList(); }
        List<AppInfo> result = new ArrayList<>();
        for (UsageStats stat : stats.values()) {
            if (stat.getTotalTimeInForeground() <= 0) continue;
            try {
                ApplicationInfo info = packages.getApplicationInfo(stat.getPackageName(), 0);
                if (packages.getLaunchIntentForPackage(stat.getPackageName()) == null) continue;
                result.add(new AppInfo(stat.getPackageName(), String.valueOf(packages.getApplicationLabel(info)), packages.getApplicationIcon(info), categoryFor(stat.getPackageName()), stat.getTotalTimeInForeground()));
            } catch (PackageManager.NameNotFoundException ignored) { }
        }
        result.sort(Comparator.comparingLong((AppInfo x) -> x.foregroundMs).reversed());
        return result;
    }
    public DailyUsageContext summarize(long now, DailyMode mode, int studyGoalMinutes, int studyCompletedMinutes, int dailyBudgetMinutes) {
        List<AppInfo> apps = todayApps(now);
        int entertainment = 0;
        Map<String, Integer> totals = new HashMap<>();
        for (AppInfo app : apps) {
            int minutes = (int) Math.min(Integer.MAX_VALUE, app.foregroundMs / 60000L);
            totals.merge(app.category.name(), minutes, Integer::sum);
            if (app.category == AppUsageCategory.ENTERTAINMENT) entertainment += minutes;
        }
        return new DailyUsageContext(hasUsageAccess(), mode, studyGoalMinutes, studyCompletedMinutes,
                new EntertainmentBudget(dailyBudgetMinutes, entertainment, mode == DailyMode.UNLIMITED), totals, 0);
    }
}
