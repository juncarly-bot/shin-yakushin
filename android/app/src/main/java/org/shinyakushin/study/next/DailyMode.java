package org.shinyakushin.study.next;

public enum DailyMode {
    NORMAL("通常日"), HOLIDAY("休日"), FOCUS("集中日"), UNLIMITED("制限なし");
    public final String label;
    DailyMode(String label) { this.label = label; }
}
