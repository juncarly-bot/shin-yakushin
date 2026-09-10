package org.shinyakushin.study.next;

import android.app.Instrumentation;
import android.content.Context;
import android.content.ContextWrapper;
import android.database.sqlite.SQLiteDatabase;
import android.os.Bundle;
import org.json.JSONObject;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Arrays;

/** Real Android SQLite tests. Never opens the application's real study.sqlite3. */
public final class PersistenceQa extends Instrumentation {
    private int passed, failed;
    private final StringBuilder result=new StringBuilder();
    interface Check { void run() throws Exception; }
    private static void check(boolean ok,String message){if(!ok)throw new AssertionError(message);}
    private Context isolated(String name) throws Exception {
        File directory=Files.createTempDirectory(getTargetContext().getCacheDir().toPath(),"persistence-qa-"+name).toFile();
        return new ContextWrapper(getTargetContext()){
            public Context getApplicationContext(){return this;}
            public File getFilesDir(){return directory;}
        };
    }
    private void test(String name,Check action){
        try{action.run();passed++;result.append(name+": PASS\n");}
        catch(Throwable ex){failed++;result.append(name+": FAIL "+ex+"\n");for(Throwable c=ex.getCause();c!=null;c=c.getCause())result.append("cause: "+c+"\n");}
    }
    private String fixture() throws Exception {
        try(java.io.InputStream in=getContext().getAssets().open("state.json")){
            java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream();byte[] buffer=new byte[4096];int n;
            while((n=in.read(buffer))!=-1)out.write(buffer,0,n);
            return out.toString(StandardCharsets.UTF_8.name());
        }
    }
    public void onCreate(Bundle args){super.onCreate(args);start();}
    public void onStart(){
        test("fresh native open",()->{StateStore s=new StateStore(isolated("fresh"));try{check(s.read()==null,"not empty");}finally{s.close();}});
        test("old schema2 without optional fields survives restart",()->{
            Context c=isolated("old");String raw=fixture();StateStore s=new StateStore(c);
            try{s.commit(-1,raw,false);}finally{s.close();}
            s=new StateStore(c);try{check(raw.equals(s.read()),"old bytes changed");}finally{s.close();}
        });
        test("unknown fields and missing package preserve exact native payload",()->{
            Context c=isolated("unknown");JSONObject json=new JSONObject(fixture());json.put("futureField",new JSONObject().put("keep",true));
            json.getJSONObject("settings").put("lifeBalance",new JSONObject().put("appCategories",new JSONObject().put("uninstalled.package","STUDY")));
            String raw=json.toString();StateStore s=new StateStore(c);try{s.commit(-1,raw,false);}finally{s.close();}
            s=new StateStore(c);try{check(raw.equals(s.read()),"unknown fields changed");}finally{s.close();}
        });
        test("invalid payload never silently restores stale backup",()->{
            Context c=isolated("invalid");String original=fixture();StateStore s=new StateStore(c);try{s.commit(-1,original,false);}finally{s.close();}
            File file=new File(c.getFilesDir(),"study.sqlite3");String invalid="{broken";
            SQLiteDatabase db=SQLiteDatabase.openDatabase(file.getPath(),null,SQLiteDatabase.OPEN_READWRITE);
            try{db.execSQL("UPDATE state SET payload=? WHERE id=1",new Object[]{invalid});}finally{db.close();}
            boolean rejected=false;try{s=new StateStore(c);s.close();}catch(Exception ex){rejected=ex.getMessage().contains("STORE-VALIDATE");}
            check(rejected,"invalid JSON not rejected with stage");
            db=SQLiteDatabase.openDatabase(file.getPath(),null,SQLiteDatabase.OPEN_READONLY);
            try(android.database.Cursor cursor=db.rawQuery("SELECT payload FROM state WHERE id=1",null)){check(cursor.moveToFirst()&&invalid.equals(cursor.getString(0)),"invalid source replaced");}finally{db.close();}
            check(original.equals(StateStore.readAtomic(new File(c.getFilesDir(),"study.backup.json"))),"backup replaced");
        });
        test("corrupt database with no backup remains byte identical",()->{
            Context c=isolated("corrupt");File file=new File(c.getFilesDir(),"study.sqlite3");byte[] original={1,2,3,4,5};Files.write(file.toPath(),original);
            boolean rejected=false;try{StateStore s=new StateStore(c);s.close();}catch(Exception ex){rejected=true;}
            check(rejected,"corruption accepted");check(Arrays.equals(original,Files.readAllBytes(file.toPath())),"original changed");
        });
        test("LifeBalance first save preserves prior payload and restarts",()->{
            Context c=isolated("migration");String old=fixture();StateStore s=new StateStore(c);
            JSONObject next=new JSONObject(old);next.put("revision",1);next.getJSONObject("settings").put("lifeBalance",new JSONObject().put("dailyMode","NORMAL"));
            String migrated=next.toString();try{s.commit(-1,old,false);s.commit(0,migrated,false);}finally{s.close();}
            check(old.equals(StateStore.readAtomic(new File(c.getFilesDir(),"before-life-balance-r0.json"))),"migration original lost");
            s=new StateStore(c);try{check(migrated.equals(s.read()),"migration restart mismatch");}finally{s.close();}
        });
        test("failed validation commit leaves previous state and backup",()->{
            Context c=isolated("failed");String old=fixture();StateStore s=new StateStore(c);
            try{s.commit(-1,old,false);boolean rejected=false;try{s.commit(0,"{broken",false);}catch(Exception ex){rejected=true;}
                check(rejected&&old.equals(s.read()),"failed commit changed state");
                check(old.equals(StateStore.readAtomic(new File(c.getFilesDir(),"study.backup.json"))),"failed commit changed backup");
            }finally{s.close();}
        });
        result.append("PERSISTENCE_QA passed="+passed+" failed="+failed+"\n");
        Bundle bundle=new Bundle();bundle.putString("stream",result.toString());finish(failed==0?-1:0,bundle);
    }
}
