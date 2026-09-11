import java.util.*;
import org.shinyakushin.study.next.*;

public class InterventionGateTest {
    static int checked=0;
    static void eq(boolean actual,boolean expected,String label){if(actual!=expected)throw new AssertionError(label+" expected "+expected+" got "+actual);checked++;}
    static void eq(String actual,String expected,String label){if(!Objects.equals(actual,expected))throw new AssertionError(label+" expected "+expected+" got "+actual);checked++;}
    public static void main(String[] args){
        long now=1700000000000L, minute=60000L;
        eq(InterventionGate.allow(true,true,true,"d|FOCUS|budget-exceeded|1","",0,120,now),true,"first actionable intervention posts");
        eq(InterventionGate.allow(true,true,true,"d|FOCUS|budget-exceeded|1","d|FOCUS|budget-exceeded|1",now-180*minute,120,now),false,"same intervention id is never repeated");
        eq(InterventionGate.allow(true,true,true,"d|FOCUS|budget-exceeded|2","d|FOCUS|budget-exceeded|1",now-30*minute,120,now),false,"cooldown suppresses a new id");
        eq(InterventionGate.allow(true,true,true,"d|FOCUS|budget-exceeded|2","d|FOCUS|budget-exceeded|1",now-120*minute,120,now),true,"cooldown expires after the configured window");
        eq(InterventionGate.allow(true,true,false,"d|FOCUS|budget-exceeded|1","",0,120,now),false,"notifications disabled is a no-op");
        eq(InterventionGate.allow(true,false,true,"d|FOCUS|budget-exceeded|1","",0,120,now),false,"missing usage access is a no-op");
        eq(InterventionGate.allow(false,true,true,"d|NORMAL|within-budget|0","",0,120,now),false,"non-actionable decision is silent");
        eq(InterventionGate.allow(true,true,true,"","",0,120,now),false,"missing intervention id is silent");
        eq(InterventionCopy.title("NurseT"),"Tから呼ばれています","nurse title");
        eq(InterventionCopy.title("SAYO"),"小夜から","sayo title");
        eq(InterventionCopy.body("budget-exceeded","NurseT").equals("そろそろ戻ってきませんか？"),true,"nurse body");
        eq(InterventionCopy.body("goal-complete","SAYO").contains("分"),false,"copy never leaks minutes");
        eq(InterventionCopy.body("budget-exceeded","SAYO").equals("少し休んだら、学習の続きに戻ろう。"),true,"sayo body");
        System.out.println("InterventionGate: "+checked+" assertions PASS");
    }
}
