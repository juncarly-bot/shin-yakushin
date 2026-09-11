package org.shinyakushin.study.next;

/**
 * Privacy-safe local copy. It never contains usage minutes, package names or raw
 * events, so a lock-screen notification cannot leak the usage details, and it
 * mirrors the identical strings in app/src/main/assets/life-balance.js.
 */
public final class InterventionCopy {
    public static final String TITLE_NURSE_T="Tから呼ばれています";
    public static final String TITLE_SAYO="小夜から";
    public static final String BODY_RETURN="そろそろ戻ってきませんか？";
    public static final String BODY_GENTLE="少し休んだら、学習の続きに戻ろう。";
    public static final String BODY_GOAL_COMPLETE="今日の目標まで届いたね。よく頑張った。";
    private InterventionCopy(){}

    public static String title(String speaker){ return CoachingPolicy.NURSE_T.equals(speaker)?TITLE_NURSE_T:TITLE_SAYO; }
    public static String body(String reason,String speaker){
        if(CoachingPolicy.REASON_GOAL_COMPLETE.equals(reason))return BODY_GOAL_COMPLETE;
        return CoachingPolicy.NURSE_T.equals(speaker)?BODY_RETURN:BODY_GENTLE;
    }
}
