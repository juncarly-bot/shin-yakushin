package org.shinyakushin.study.next;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.util.AtomicFile;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Transactional device-local source of truth. No server or browser storage. */
public final class StateStore {
    private final Context context;
    private final File file;
    private SQLiteDatabase db;
    private String warning="";
    private String loadStage="OPEN";
    public StateStore(Context context) throws Exception {
        this.context=context.getApplicationContext();file=new File(context.getFilesDir(),"study.sqlite3");
        try {
            open(); loadStage="READ"; String raw=read();
            if(raw!=null){loadStage="VALIDATE";validate(raw);}
            else {
                File backup=new File(context.getFilesDir(),"study.backup.json");
                // open() creates an empty database as a side effect, so an earlier
                // aborted open (for example a boot/alarm receiver that read nothing and
                // returned) can leave study.sqlite3 with no committed row and no backup.
                // A successful commit always writes a row, so an empty table without any
                // backup holds no user data: keep the file untouched and start fresh
                // instead of failing the whole app. A backup without a row still means
                // data was lost, so that case keeps the explicit MISSING_ROW failure.
                if(backup.exists()||new File(backup+".bak").exists()){loadStage="MISSING_ROW";throw new IOException("保存行が見つかりません");}
            }
        }
        catch(UnsupportedVersion ex){close();throw ex;}
        catch(Exception ex){
            close(); File backup=new File(context.getFilesDir(),"study.backup.json");
            // A validation, permission, disk or query failure is not evidence of corruption.
            // Never replace a readable newer state with an older automatic backup.
            if(!(ex instanceof android.database.sqlite.SQLiteDatabaseCorruptException)
                    ||(!backup.exists()&&!new File(backup+".bak").exists()))
                throw new IOException("保存データを開けません。元データを保持しています。\n診断: STORE-"+loadStage+"-"+ex.getClass().getSimpleName(),ex);
            String recovered=readAtomic(backup);validate(recovered);
            String suffix=".corrupt-"+System.currentTimeMillis();
            // Preserve the original files; never use SQLite's default deletion handler.
            for(String extension:new String[]{"","-journal","-wal","-shm"}){
                File from=new File(file+extension);if(from.exists()&&!from.renameTo(new File(file+extension+suffix)))throw new IOException("破損元の退避ができないため復旧を中止しました");
            }
            open();JSONObject state=new JSONObject(recovered);insert(recovered,state.getLong("revision"));warning="保存データを自動バックアップから復旧しました。破損元も保持しています。";
        }
    }
    private void open() throws Exception {
        loadStage="OPEN";
        db=SQLiteDatabase.openDatabase(file.getAbsolutePath(),null,SQLiteDatabase.CREATE_IF_NECESSARY,database->{throw new android.database.sqlite.SQLiteDatabaseCorruptException("データ破損を検出。元ファイルは保持します");});
        loadStage="SYNC";
        db.execSQL("PRAGMA synchronous=FULL");
        loadStage="INTEGRITY";
        try(Cursor c=db.rawQuery("PRAGMA quick_check",null)){if(!c.moveToFirst()||!"ok".equals(c.getString(0)))throw new android.database.sqlite.SQLiteDatabaseCorruptException("DB integrity failed");}
        loadStage="TABLE";
        db.execSQL("CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, payload TEXT NOT NULL)");
    }
    private void insert(String raw,long revision){db.beginTransaction();try{db.execSQL("INSERT INTO state(id,revision,payload) VALUES(1,?,?)",new Object[]{revision,raw});db.setTransactionSuccessful();}finally{db.endTransaction();}}
    public synchronized String read(){try(Cursor c=db.rawQuery("SELECT payload FROM state WHERE id=1",null)){return c.moveToFirst()?c.getString(0):null;}}
    public synchronized String warning(){return warning;}
    public synchronized void commit(long expected,String raw,boolean restore) throws Exception {
        JSONObject next=validate(raw);String previous=read();long current=previous==null?-1:new JSONObject(previous).getLong("revision");
        if(current!=expected||next.getLong("revision")!=current+1)throw new IOException("ほかの操作で記録が更新されています。読み込み直してください");
        if(previous!=null&&!new JSONObject(previous).getJSONObject("settings").has("lifeBalance")
                &&next.getJSONObject("settings").has("lifeBalance")){
            File original=new File(context.getFilesDir(),"before-life-balance-r"+current+".json");
            if(original.exists()){
                if(!readAtomic(original).equals(previous))throw new IOException("移行元のバックアップが一致しないため保存を中止しました");
            }else writeAtomic(original,previous);
        }
        if(restore&&previous!=null){if(active(new JSONObject(previous))!=null)throw new IOException("学習を終了してから復元してください");writeAtomic(new File(context.getFilesDir(),"before-import-"+System.currentTimeMillis()+".json"),previous);}
        db.beginTransaction();try{
            if(previous==null)db.execSQL("INSERT INTO state VALUES(1,?,?)",new Object[]{next.getLong("revision"),raw});
            else db.execSQL("UPDATE state SET revision=?,payload=? WHERE id=1 AND revision=?",new Object[]{next.getLong("revision"),raw,expected});
            try(Cursor c=db.rawQuery("SELECT changes()",null)){c.moveToFirst();if(c.getInt(0)!=1)throw new IOException("保存の競合を検出しました");}
            db.setTransactionSuccessful();
        }finally{db.endTransaction();}
        try{writeAtomic(new File(context.getFilesDir(),"study.backup.json"),raw);warning="";}
        catch(IOException ex){warning="学習記録は保存済みですが、自動バックアップを作成できません。空き容量を確認してください。";}
    }
    public synchronized void preserveImport(String raw) throws IOException {writeAtomic(new File(context.getFilesDir(),"import-source-"+System.currentTimeMillis()+".json"),raw);}
    public synchronized void close(){if(db!=null){db.close();db=null;}}
    static void writeAtomic(File file,String raw) throws IOException {
        AtomicFile atomic=new AtomicFile(file);FileOutputStream stream=null;
        try{stream=atomic.startWrite();stream.write(raw.getBytes(StandardCharsets.UTF_8));atomic.finishWrite(stream);}
        catch(IOException ex){if(stream!=null)atomic.failWrite(stream);throw ex;}
    }
    static String readAtomic(File file) throws IOException {
        // AtomicFile.openRead() can rename .bak and delete partial files before validation.
        // Select its committed candidate without modifying either copy.
        File backup=new File(file.getPath()+".bak");File candidate=backup.exists()?backup:file;
        try(InputStream in=new FileInputStream(candidate);ByteArrayOutputStream out=new ByteArrayOutputStream()){
            byte[] buffer=new byte[8192];int n;
            while((n=in.read(buffer))!=-1){if(out.size()+n>25_000_000)throw new IOException("25 MBを超えるデータは読み込めません");out.write(buffer,0,n);}
            return new String(out.toByteArray(),StandardCharsets.UTF_8);
        }
    }
    public static JSONObject active(JSONObject s) throws JSONException {JSONArray a=s.getJSONArray("sessions");for(int i=0;i<a.length();i++){JSONObject x=a.getJSONObject(i);if(x.isNull("endTimestamp"))return x;}return null;}
    static final class UnsupportedVersion extends IOException {UnsupportedVersion(){super("対応していない保存バージョンです。元データは変更していません。");}}
    private static void require(boolean v,String m) throws IOException{if(!v)throw new IOException(m);}
    private static double finite(JSONObject o,String key,double min,double max) throws Exception {Object raw=o.get(key);require(raw instanceof Number,"数値形式が不正です");double n=((Number)raw).doubleValue();require(Double.isFinite(n)&&n>=min&&n<=max,"数値が範囲外です");return n;}
    private static String text(JSONObject o,String key,int max) throws Exception {Object v=o.get(key);require(v instanceof String&&((String)v).length()<=max,"文字列形式が不正です");return (String)v;}
    public static JSONObject validate(String raw) throws Exception {
        require(raw.getBytes(StandardCharsets.UTF_8).length<=25_000_000,"25 MBを超えるデータは読み込めません");JSONObject s=new JSONObject(raw);if(s.getInt("schemaVersion")!=2)throw new UnsupportedVersion();finite(s,"revision",0,9_000_000_000_000_000d);
        Map<String,Set<String>> ids=new HashMap<>();String[] kinds={"materials","goals","tasks","plans"};
        for(String kind:kinds){Set<String> set=new HashSet<>();ids.put(kind,set);JSONArray a=s.getJSONArray(kind);for(int i=0;i<a.length();i++){JSONObject o=a.getJSONObject(i);String id=text(o,"id",100);require(!id.isEmpty()&&set.add(id),"IDが重複しています");text(o,"title",200);text(o,"memo",2000);o.getBoolean("archived");finite(o,"createdAt",0,253402214400000d);if(!o.isNull("completedAt"))finite(o,"completedAt",0,253402214400000d);if(kind.equals("materials")||kind.equals("goals")){double target=finite(o,"target",1,253402214400000d);finite(o,"progress",0,target);text(o,"unit",30);}else{o.getBoolean("done");if(kind.equals("plans"))java.time.LocalDate.parse(o.getString("date"));}}}
        Set<String> sessions=new HashSet<>();int activeCount=0;JSONArray a=s.getJSONArray("sessions");
        for(int i=0;i<a.length();i++){JSONObject x=a.getJSONObject(i);String id=text(x,"sessionId",100);require(!id.isEmpty()&&sessions.add(id),"StudySessionが重複しています");double last=finite(x,"startTimestamp",0,253402214400000d);boolean ongoing=x.isNull("endTimestamp");if(ongoing)activeCount++;else finite(x,"endTimestamp",last,253402214400000d);text(x,"title",200);text(x,"note",2000);require(Arrays.asList("free","linked","plan").contains(x.getString("sourceType")),"学習種別が不正です");if(!x.isNull("breakUntil"))finite(x,"breakUntil",0,253402214400000d);JSONArray segments=x.getJSONArray("segments");require(segments.length()>0,"学習区間がありません");boolean lastOpen=false;
            for(int j=0;j<segments.length();j++){JSONObject p=segments.getJSONObject(j);require(Arrays.asList("study","break","pause").contains(p.getString("kind")),"学習区間が不正です");require(finite(p,"start",0,253402214400000d)==last,"学習区間が連続していません");lastOpen=p.isNull("end");if(lastOpen)require(ongoing&&j==segments.length()-1,"未終了区間が不正です");else last=finite(p,"end",last,253402214400000d);}
            require(ongoing==lastOpen&&(ongoing||last==x.getDouble("endTimestamp")),"終了時刻が一致しません");checkRefs(x,ids);
        }require(activeCount<=1,"複数の学習が進行中です");for(String k:new String[]{"tasks","plans"}){JSONArray list=s.getJSONArray(k);for(int i=0;i<list.length();i++)checkRefs(list.getJSONObject(i),ids);}
        JSONArray memories=s.getJSONArray("memories");Set<String> memoryIds=new HashSet<>();int manual=0;
        for(int i=0;i<memories.length();i++){JSONObject m=memories.getJSONObject(i);require(memoryIds.add(text(m,"id",200)),"思い出IDが重複しています");text(m,"text",2000);if(text(m,"category",50).equals("manual"))manual++;finite(m,"importance",0,10);finite(m,"timestamp",0,253402214400000d);}require(manual<=100&&memories.length()-manual<=300,"思い出の上限を超えています");
        Set<String> visits=new HashSet<>();JSONArray v=s.getJSONArray("visits");for(int i=0;i<v.length();i++){String d=v.getString(i);java.time.LocalDate.parse(d);require(visits.add(d),"訪問日が重複しています");}
        JSONArray events=s.getJSONArray("progressEvents");Set<String> eventIds=new HashSet<>();for(int i=0;i<events.length();i++){JSONObject e=events.getJSONObject(i);String k=e.getString("kind");require((k.equals("goals")||k.equals("materials"))&&ids.get(k).contains(e.getString("relatedId")),"進捗の関連先がありません");require(eventIds.add(text(e,"id",100)),"進捗IDが重複しています");text(e,"title",200);finite(e,"before",0,253402214400000d);finite(e,"after",0,253402214400000d);finite(e,"timestamp",0,253402214400000d);}
        JSONObject h=s.getJSONObject("dialogueHistory");Iterator<String> keys=h.keys();while(keys.hasNext()){JSONObject use=h.getJSONObject(keys.next());finite(use,"count",0,9e15);finite(use,"last",0,253402214400000d);}if(!s.isNull("lastSeen"))finite(s,"lastSeen",0,253402214400000d);
        if(!s.isNull("reaction")){JSONObject r=s.getJSONObject("reaction");for(String k:new String[]{"text","emotion","gesture","event","templateId"})text(r,k,2000);finite(r,"timestamp",0,253402214400000d);}
        JSONObject cfg=s.getJSONObject("settings");text(cfg,"name",80);finite(cfg,"utcOffsetMinutes",-720,840);finite(cfg,"breakMinutes",1,180);cfg.getBoolean("quiet");cfg.getBoolean("notifications");if(cfg.has("voice")){JSONObject voiceCfg=cfg.getJSONObject("voice");for(String k:new String[]{"enabled","sayo","nurse","quietHours"})require(voiceCfg.get(k) instanceof Boolean,"音声設定が不正です");finite(voiceCfg,"volume",0,1);for(String k:new String[]{"quietStart","quietEnd"}){double voiceHour=finite(voiceCfg,k,0,23);require(voiceHour==Math.floor(voiceHour),"時刻が不正です");}require(Arrays.asList("low","normal","high").contains(voiceCfg.getString("frequency")),"頻度が不正です");}validateConversation(s,ids,memoryIds);return s;
    }
    private static void validateConversation(JSONObject s,Map<String,Set<String>> ids,Set<String> memoryIds) throws Exception {
        if(!s.has("conversation")||s.isNull("conversation"))return;JSONObject c=s.getJSONObject("conversation");
        text(c,"topic",200);text(c,"intent",40);finite(c,"updatedAt",0,253402214400000d);finite(c,"lastRecallAt",0,253402214400000d);
        if(c.has("lastInteractionAt"))finite(c,"lastInteractionAt",0,253402214400000d);
        // Recalled automatic memories may later be pruned; keep the cooldown ID without
        // requiring the referenced memory to remain in the bounded memory collection.
        for(String key:new String[]{"lastRecallId","recentRelevantMemoryId"})if(c.has(key)&&!c.isNull(key))text(c,key,200);
        if(c.has("recentReaction")&&!c.isNull("recentReaction"))text(c,"recentReaction",300);
        Set<String> moods=new HashSet<>(Arrays.asList("calm","pleased","focused","concerned","relaxed","proud","tired-context"));
        if(c.has("emotionalState"))require(moods.contains(c.getString("emotionalState")),"感情状態が不正です");
        if(c.has("emotionalStateSince"))finite(c,"emotionalStateSince",0,253402214400000d);
        if(c.has("reactionsSinceRecall")){double n=finite(c,"reactionsSinceRecall",0,99);require(n==Math.floor(n),"会話予算が不正です");}
        if(!c.isNull("lastSpeaker"))require(Arrays.asList("SAYO","NurseT").contains(c.getString("lastSpeaker")),"会話の話者が不正です");
        String[] fields={"materialId","goalId","taskId"},kinds={"materials","goals","tasks"};for(int i=0;i<fields.length;i++)if(!c.isNull(fields[i]))require(ids.get(kinds[i]).contains(c.getString(fields[i])),"会話の関連先がありません");
        JSONArray turns=c.getJSONArray("turns");require(turns.length()<=6,"会話の保存上限を超えています");for(int i=0;i<turns.length();i++){JSONObject t=turns.getJSONObject(i);text(t,"text",300);finite(t,"at",0,253402214400000d);require(Arrays.asList("user","SAYO","NurseT").contains(t.getString("speaker")),"会話の話者が不正です");}
        JSONObject characters=c.getJSONObject("characters");for(String who:new String[]{"SAYO","NurseT"}){JSONObject character=characters.getJSONObject(who);require(moods.contains(character.getString("mood")),"感情状態が不正です");finite(character,"until",0,253402214400000d);if(character.has("since"))finite(character,"since",0,253402214400000d);}
    }
    private static void checkRefs(JSONObject o,Map<String,Set<String>> ids) throws Exception {String[] fields={"relatedMaterialId","relatedGoalId","relatedTaskId","relatedPlanId"},kinds={"materials","goals","tasks","plans"};for(int i=0;i<fields.length;i++)if(o.has(fields[i])&&!o.isNull(fields[i]))require(ids.get(kinds[i]).contains(o.getString(fields[i])),"関連先が見つかりません");}
}
