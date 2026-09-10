package org.shinyakushin.study.next;

import java.time.Instant;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.Map;

/** Streaming, non-persistent, single foreground-app accounting. */
public final class UsageIntervals {
    private final long start, end;
    private long previous = Long.MIN_VALUE, opened;
    private String active;
    private String activity;
    private boolean ordered = true;
    private final Map<String, Long> totals = new HashMap<>();
    public UsageIntervals(long start, long end) {
        if (end < start) throw new IllegalArgumentException("Invalid interval");
        this.start = start; this.end = end;
    }
    public static long dayStart(long now, ZoneId zone) {
        return Instant.ofEpochMilli(now).atZone(zone).toLocalDate().atStartOfDay(zone).toInstant().toEpochMilli();
    }
    public void accept(long at, int type, String pkg) {
        accept(at, type, pkg, null);
    }
    public void accept(long at, int type, String pkg, String className) {
        // Do not sort clock rollbacks into invented foreground sessions.
        if (at < previous) { ordered = false; active = null; totals.clear(); return; }
        previous = at;
        if (!ordered || at > end) return;
        if (type == 1 && pkg != null) {
            if (!pkg.equals(active)) { close(at); active = pkg; opened = at; }
            activity = className;
        } else if ((type == 2 || type == 23) && pkg != null && pkg.equals(active)
                && java.util.Objects.equals(activity, className)) {
            close(at);
        } else if (type == 16 || type == 17 || type == 18 || type == 26) {
            // Screen off, shutdown, startup, or keyguard shown ends observation.
            close(at);
        }
    }
    private void close(long at) {
        if (active != null) {
            long duration = Math.max(0, Math.min(at, end) - Math.max(opened, start));
            if (duration > 0) totals.merge(active, duration, Long::sum);
            active = null;
        }
    }
    public boolean isOrdered() { return ordered; }
    public Map<String, Long> finish() { close(end); return new HashMap<>(totals); }
    public static Map<String, Long> categories(Map<String, Long> packages, Map<String, AppUsageCategory> choices) {
        Map<String, Long> result = new HashMap<>();
        for (Map.Entry<String, Long> row : packages.entrySet()) {
            String category = choices.getOrDefault(row.getKey(), AppUsageCategory.NEUTRAL).name();
            result.merge(category, Math.max(0, row.getValue()), Long::sum);
        }
        return result;
    }
}
