package org.shinyakushin.study.next;

/** One aggregate budget across all selected entertainment apps. */
public final class EntertainmentBudget {
    public final int dailyLimitMinutes;
    public final int usedMinutes;
    public final boolean unlimited;

    public EntertainmentBudget(int dailyLimitMinutes, int usedMinutes, boolean unlimited) {
        this.dailyLimitMinutes = Math.max(0, dailyLimitMinutes);
        this.usedMinutes = Math.max(0, usedMinutes);
        this.unlimited = unlimited;
    }
    public int remainingMinutes() { return unlimited ? Integer.MAX_VALUE : Math.max(0, dailyLimitMinutes - usedMinutes); }
    public int exceededMinutes() { return unlimited ? 0 : Math.max(0, usedMinutes - dailyLimitMinutes); }
    public double ratio() { return unlimited || dailyLimitMinutes == 0 ? 0.0 : (double) usedMinutes / dailyLimitMinutes; }
}
