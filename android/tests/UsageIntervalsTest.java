import java.time.*;
import java.util.*;
import org.shinyakushin.study.next.*;

public class UsageIntervalsTest {
    static void eq(Object a,Object b) { if(!Objects.equals(a,b)) throw new AssertionError(a+" != "+b); }
    public static void main(String[] args) {
        UsageIntervals split=new UsageIntervals(100,200);
        split.accept(90,1,"youtube");split.accept(110,1,"youtube");split.accept(150,2,"youtube");
        eq(split.finish().get("youtube"),50L);
        UsageIntervals duplicate=new UsageIntervals(0,200);
        duplicate.accept(10,1,"x");duplicate.accept(10,1,"x");duplicate.accept(30,2,"x");duplicate.accept(30,2,"x");
        eq(duplicate.finish().get("x"),20L);
        UsageIntervals reboot=new UsageIntervals(0,200);
        reboot.accept(10,1,"x");reboot.accept(20,17,null);reboot.accept(80,18,null);reboot.accept(100,1,"x");reboot.accept(110,16,null);
        eq(reboot.finish().get("x"),20L);
        UsageIntervals missing=new UsageIntervals(0,200);missing.accept(50,2,"x");eq(missing.finish().size(),0);
        UsageIntervals switchApp=new UsageIntervals(0,200);switchApp.accept(10,1,"x");switchApp.accept(20,1,"youtube");switchApp.accept(30,2,"x");switchApp.accept(40,2,"youtube");
        eq(switchApp.finish(),Map.of("x",10L,"youtube",20L));
        UsageIntervals rollback=new UsageIntervals(0,200);rollback.accept(50,1,"x");rollback.accept(40,2,"x");eq(rollback.isOrdered(),false);eq(rollback.finish().size(),0);
        ZoneId ny=ZoneId.of("America/New_York");
        for(String day:List.of("2026-03-08","2026-11-01")){
            ZonedDateTime midnight=LocalDate.parse(day).atStartOfDay(ny);
            long midday=midnight.plusHours(12).toInstant().toEpochMilli();
            eq(UsageIntervals.dayStart(midday,ny),midnight.toInstant().toEpochMilli());
        }
        long t=Instant.parse("2026-09-10T15:00:00Z").toEpochMilli();
        eq(UsageIntervals.dayStart(t,ZoneId.of("Asia/Tokyo")),t);
        Map<String,Long> totals=UsageIntervals.categories(Map.of("youtube",52*60000L,"x",38*60000L,"chrome",45*60000L,"chatgpt",35*60000L,"removed",60000L),Map.of("youtube",AppUsageCategory.ENTERTAINMENT,"x",AppUsageCategory.ENTERTAINMENT,"chrome",AppUsageCategory.STUDY,"chatgpt",AppUsageCategory.STUDY));
        eq(totals.get("ENTERTAINMENT"),90*60000L);eq(totals.get("STUDY"),80*60000L);eq(totals.get("NEUTRAL"),60000L);
        System.out.println("UsageIntervals: midnight, DST, duplicates, missing transitions, reboot, clock rollback, category totals PASS");
    }
}
