package org.shinyakushin.study.next;
import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.*;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

public final class MainActivity extends Activity {
    private static final String ORIGIN="https://appassets.androidplatform.net";
    private static final int EXPORT=20,IMPORT=21,NOTIFICATIONS=22,MIGRATION=23;
    private WebView web;
    private StateStore store;
    private VoiceController voice;
    private RemoteAIClient remoteAI;
    private AppUsageRepository appUsage;
    private final ExecutorService io=Executors.newSingleThreadExecutor();
    private static final String STARTUP_TAG="StudyStartup";
    private static final Set<String> STARTUP_MARKS=new HashSet<>(Arrays.asList("process_start","activity_create","webview_create","loadUrl_start","store_ready","ui_shell_ready","recent_conversation_rendered","composer_interactive","memory_ready","voice_ready","usage_ready","continuity_ready"));
    /** The saved state is opened off the main thread; JS waits on this latch before reading. */
    private final CountDownLatch storeReady=new CountDownLatch(1);
    private volatile Exception storeFailure=null;
    private long processStart=0;
    private final Map<String,Long> startupMeasurements=Collections.synchronizedMap(new LinkedHashMap<>());
    private boolean startupLog=false;
    private boolean webReady=false;
    private String pendingIntervention=null,pendingCommitment=null;
    @Override public void onCreate(Bundle saved){
        super.onCreate(saved);
        // MEASURED, not assumed: the WebView shell must be on screen before the saved
        // state is parsed. Opening the store on the IO thread means a slow or large
        // state delays only the first read(), never the first paint.
        processStart=android.os.Process.getStartUptimeMillis();
        startupLog=(getApplicationInfo().flags&android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)!=0;
        startupMark("process_start");startupMark("activity_create");
        io.execute(this::warmStore);
        voice=new VoiceController(this);remoteAI=new RemoteAIClient(this);appUsage=new AppUsageRepository(this);web=new WebView(this);web.setBackgroundColor(Color.rgb(245,244,238));setContentView(web);
        voice.listener((name,at)->runOnUiThread(()->{if(web!=null&&webReady)web.evaluateJavascript("window.platformVoiceEvent && window.platformVoiceEvent("+JSONObject.quote(name)+","+at+")",null);}));
        web.setOnApplyWindowInsetsListener((view,insets)->{if(Build.VERSION.SDK_INT>=30){android.graphics.Insets bar=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.ime());view.setPadding(bar.left,bar.top,bar.right,bar.bottom);}else view.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;});
        WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(false);settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);settings.setJavaScriptCanOpenWindowsAutomatically(false);settings.setSupportMultipleWindows(false);
        web.addJavascriptInterface(new Bridge(),"AndroidStore");
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView w,WebResourceRequest r){return true;}
            @Override public void onPageFinished(WebView w,String url){webReady=true;String queued=pendingIntervention;pendingIntervention=null;if(queued!=null)dispatchIntervention(queued);String due=pendingCommitment;pendingCommitment=null;if(due!=null)dispatchCommitment(due);}
            @Override public WebResourceResponse shouldInterceptRequest(WebView w,WebResourceRequest req){
                Uri u=req.getUrl();String path=u.getPath();Set<String> allowed=new HashSet<>(Arrays.asList("/index.html","/ui.js","/domain.js","/reactions.js","/templates.js","/platform.js","/style.css","/avatar-sheet.png","/timeline.js","/orchestrator.js","/conversation.js","/conversation-shape.js","/characters.js","/companion.js","/voice-settings.js","/remote-ai.js","/life-balance.js","/life-balance-analytics.js","/life-balance-compat.js","/migration-verify.js","/latency.js","/voice-chunks.js","/commitments.js","/initiative.js","/character-decision.js","/dialogue.js","/cast-director.js","/relationship.js","/repetition.js","/continuity.js","/return-queue.js","/character-memory.js","/character-engine.js","/startup.js"));
                if(!"https".equals(u.getScheme())||!"appassets.androidplatform.net".equals(u.getHost())||!allowed.contains(path))return response("text/plain",404,"Not found",new ByteArrayInputStream(new byte[0]));
                try{return response(path.endsWith(".js")?"text/javascript":path.endsWith(".css")?"text/css":path.endsWith(".png")?"image/png":"text/html",200,"OK",getAssets().open(path.substring(1)));}catch(IOException ex){return response("text/plain",404,"Not found",new ByteArrayInputStream(new byte[0]));}
            }
        });
        web.setWebChromeClient(new WebChromeClient(){
            /** Debug-only mirror of the JS startup marks, so the whole timeline is visible in one place. */
            @Override public boolean onConsoleMessage(ConsoleMessage message){
                if(startupLog&&message!=null)android.util.Log.i(STARTUP_TAG,"JS "+message.message());
                return true;
            }
        });startupMark("webview_create");web.loadUrl(ORIGIN+"/index.html");startupMark("loadUrl_start");BreakReceiver.channel(this);LifeBalanceNotifier.ensureChannel(this);CommitmentNotifier.ensureChannel(this);LifeBalanceScheduler.ensure(this);handleIntervention(getIntent());handleCommitment(getIntent());
    }
    /** DEBUG-visible timestamp relative to process start. Never shown in a release build. */
    private void startupMark(String name){
        if(!startupLog||!STARTUP_MARKS.contains(name))return;
        long elapsed=Math.max(0,SystemClock.uptimeMillis()-processStart);
        synchronized(startupMeasurements){if(!startupMeasurements.containsKey(name))startupMeasurements.put(name,elapsed);}
        android.util.Log.i(STARTUP_TAG,"STARTUP_MARK "+name+" "+elapsed+"ms");
        // The headline metric is time to usable chat, not the time until every
        // advisory subsystem (VOICE, Memory, Usage, Continuity) has finished.
        if("composer_interactive".equals(name))android.util.Log.i(STARTUP_TAG,"STARTUP_LATENCY timeToUsableChat "+elapsed+"ms");
    }
    /** Opens and validates the saved state off the main thread, then arms the reminders. */
    private void warmStore(){
        try{store=new StateStore(this);String initial=store.read();BreakReceiver.schedule(this,initial);CommitmentScheduler.ensure(this,initial);}
        catch(Exception ex){storeFailure=ex;android.util.Log.w(STARTUP_TAG,"state warm-up failed",ex);}
        finally{storeReady.countDown();startupMark("store_ready");}
    }
    /** Blocks the calling (non-UI) thread until the store is open; never returns null. */
    private StateStore readyStore() throws Exception {
        if(!storeReady.await(30,TimeUnit.SECONDS))throw new IOException("保存データの準備が間に合いませんでした");
        if(storeFailure!=null)throw new IOException(storeFailure.getMessage(),storeFailure);
        StateStore open=store;if(open==null)throw new IOException("保存データを開けません");
        return open;
    }
    private WebResourceResponse response(String mime,int status,String reason,InputStream in){Map<String,String> h=new HashMap<>();h.put("Content-Security-Policy","default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'");h.put("X-Content-Type-Options","nosniff");return new WebResourceResponse(mime,"UTF-8",status,reason,h,in);}
    private String result(boolean ok,String raw,String error){try{JSONObject r=new JSONObject();r.put("ok",ok);r.put("raw",raw==null?JSONObject.NULL:raw);r.put("error",error);r.put("warning",store==null?"":store.warning());return r.toString();}catch(JSONException impossible){return "{\"ok\":false,\"error\":\"保存結果を確認できません\"}";}}
    private final class Bridge {
        @JavascriptInterface public String licenses(){try(java.io.InputStream in=getAssets().open("licenses.txt")){return new String(VoicevoxProvider.readBytes(in),StandardCharsets.UTF_8);}catch(Exception ex){return "利用条件を読み込めませんでした。";}}
        @JavascriptInterface public void speak(String raw){voice.speak(raw);}
        @JavascriptInterface public void speakBatch(String raw){voice.speakBatch(raw);}
        @JavascriptInterface public void cancelVoice(){voice.cancel();}
        @JavascriptInterface public void prewarmVoice(){voice.prewarm();}
        @JavascriptInterface public void cancelRemoteAI(){if(remoteAI!=null)remoteAI.cancel();}
        @JavascriptInterface public String voiceStatus(){return voice.status();}
        @JavascriptInterface public boolean remoteAIAvailable(){return remoteAI!=null&&remoteAI.available();}
        @JavascriptInterface public String remoteAIEndpoint(){return remoteAI==null?"":remoteAI.endpoint();}
        @JavascriptInterface public boolean setRemoteAIEndpoint(String value){return remoteAI!=null&&remoteAI.configure(value);}
        @JavascriptInterface public void requestRemoteAI(String requestId,String raw){
            if(remoteAI==null){remoteFailure(requestId);return;}
            remoteAI.request(requestId,raw,new RemoteAIClient.Callback(){
                public void success(String id,String response){runOnUiThread(()->{if(web!=null)web.evaluateJavascript("window.platformRemoteAIResult && window.platformRemoteAIResult("+JSONObject.quote(id)+","+JSONObject.quote(response)+")",null);});}
                public void failure(String id){remoteFailure(id);}
            });
        }
        @JavascriptInterface public String read(){try{return result(true,readyStore().read(),"");}catch(Exception ex){return result(false,null,ex.getMessage());}}
        @JavascriptInterface public String commit(long revision,String raw,boolean restore){try{StateStore open=readyStore();open.commit(revision,raw,restore);BreakReceiver.schedule(MainActivity.this,raw);CommitmentScheduler.ensure(MainActivity.this,raw);return result(true,open.read(),"");}catch(Exception ex){return result(false,null,ex.getMessage());}}
        @JavascriptInterface public void exportData(){runOnUiThread(()->{Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("application/json").addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_TITLE,"新躍進政策-"+java.time.LocalDate.now()+".json");startActivityForResult(i,EXPORT);});}
        @JavascriptInterface public void importData(){runOnUiThread(()->{Intent i=new Intent(Intent.ACTION_GET_CONTENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE);startActivityForResult(i,IMPORT);});}
        @JavascriptInterface public void enableNotifications(){runOnUiThread(()->{if(Build.VERSION.SDK_INT>=33&&!BreakReceiver.permitted(MainActivity.this))requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},NOTIFICATIONS);else{BreakReceiver.schedule(MainActivity.this,store==null?null:store.read());message("通知の設定を確認しました。休憩は通知なしでも利用できます。");}});}
        @JavascriptInterface public boolean notificationAllowed(){return BreakReceiver.permitted(MainActivity.this)&&getSystemService(NotificationManager.class).areNotificationsEnabled();}
        @JavascriptInterface public boolean usageAccessAllowed(){return appUsage!=null&&appUsage.hasUsageAccess();}
        @JavascriptInterface public void requestDailyBalance(){io.execute(()->{
            String summary;
            try{summary=LifeBalanceSnapshot.read(MainActivity.this,store.read(),System.currentTimeMillis()).toString();}
            catch(Exception ex){summary="{\"permissionGranted\":false}";}
            final String value=summary;
            runOnUiThread(()->{if(web!=null)web.evaluateJavascript("window.platformDailyBalance && window.platformDailyBalance("+JSONObject.quote(value)+")",null);});
        });}
        @JavascriptInterface public void requestDailyHistory(){io.execute(()->{
            String history;
            try{history=new JSONObject().put("ok",true).put("days",LifeBalanceHistory.read(MainActivity.this,store.read(),System.currentTimeMillis())).toString();}
            catch(Exception ex){history="{\"ok\":false,\"days\":[]}";}
            final String value=history;
            runOnUiThread(()->{if(web!=null)web.evaluateJavascript("window.platformDailyHistory && window.platformDailyHistory("+JSONObject.quote(value)+")",null);});
        });}
        /** Debug builds only: the release APK reports false, so no QA trigger is exposed. */
        /** Debug builds only: mirrors the JS startup marks into logcat with a process-start epoch. */
        @JavascriptInterface public void debugMark(String name){startupMark(name);}
        @JavascriptInterface public String startupMeasurements(){
    if(!startupLog)return "{}";
    try{
        JSONObject result=new JSONObject(),marks=new JSONObject();Long usable;
        synchronized(startupMeasurements){
            for(Map.Entry<String,Long> entry:startupMeasurements.entrySet())marks.put(entry.getKey(),entry.getValue());
            usable=startupMeasurements.get("composer_interactive");
        }
        result.put("marks",marks);result.put("timeToUsableChatMs",usable==null?JSONObject.NULL:usable);
        return result.toString();
    }catch(JSONException impossible){return "{}";}
}
        @JavascriptInterface public boolean debugToolsEnabled(){
            return (getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)!=0;
        }
        /** Debug builds only: run the same read-only check the periodic worker runs. */
        @JavascriptInterface public String runLifeBalanceNow(){
            try{return LifeBalanceCheck.run(MainActivity.this,System.currentTimeMillis()).toString();}
            catch(Throwable failure){return "{\"checked\":false,\"reason\":\"error\"}";}
        }
        /** Debug builds only: run the same read-only check the one-time commitment worker runs. */
        @JavascriptInterface public String runCommitmentCheck(){
            try{return CommitmentCheck.run(MainActivity.this,System.currentTimeMillis()).toString();}
            catch(Throwable failure){return "{\"checked\":false,\"reason\":\"error\"}";}
        }
        @JavascriptInterface public void requestLaunchableApps(){io.execute(()->{
            String catalog=LaunchableApps.read(MainActivity.this);
            runOnUiThread(()->{if(web!=null)web.evaluateJavascript("window.platformLaunchableApps && window.platformLaunchableApps("+JSONObject.quote(catalog)+")",null);});
        });}
        /** Migration rehearsal build only: the rehearsal package is never the preview id. */
        @JavascriptInterface public boolean migrationQaEnabled(){return getPackageName().endsWith(".migrationqa");}
        /** Migration rehearsal build only: import a tools/backup_app_state.sh artifact read-only. */
        @JavascriptInterface public void importMigrationSource(){runOnUiThread(()->{try{Intent i=new Intent(Intent.ACTION_GET_CONTENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE);startActivityForResult(i,MIGRATION);}catch(RuntimeException ex){message("移行元を選ぶ画面を開けませんでした。");}});}
        @JavascriptInterface public void openUsageAccessSettings(){runOnUiThread(()->{try{startActivity(appUsage.usageAccessIntent());}catch(RuntimeException ex){message("使用状況へのアクセス設定を開けませんでした。");}});}
    }
    /** Minimal notification payload only; raw Usage events never enter the Intent. */
    private void handleIntervention(Intent intent){
        if(intent==null||!LifeBalanceNotifier.ACTION.equals(intent.getAction()))return;
        String id=intent.getStringExtra("interventionId");
        if(id==null||id.isEmpty())return;
        try{JSONObject payload=new JSONObject().put("interventionId",id).put("speaker",intent.getStringExtra("speaker"))
            .put("reason",intent.getStringExtra("reason")).put("day",intent.getStringExtra("day")).put("at",intent.getLongExtra("at",0));
            dispatchIntervention(payload.toString());}catch(JSONException ignored){}
    }
    private void dispatchIntervention(String json){
        if(!webReady){pendingIntervention=json;return;}
        if(web!=null)web.evaluateJavascript("window.platformIntervention && window.platformIntervention("+JSONObject.quote(json)+")",null);
    }
    /** Minimal promise payload only; taps reuse the existing conversation and never duplicate it. */
    private void handleCommitment(Intent intent){
        if(intent==null||!CommitmentNotifier.ACTION.equals(intent.getAction()))return;
        String id=intent.getStringExtra("commitmentId");
        if(id==null||id.isEmpty())return;
        try{JSONObject payload=new JSONObject().put("commitmentId",id).put("at",intent.getLongExtra("at",0));dispatchCommitment(payload.toString());}catch(JSONException ignored){}
    }
    private void dispatchCommitment(String json){
        if(!webReady){pendingCommitment=json;return;}
        if(web!=null)web.evaluateJavascript("window.platformCommitment && window.platformCommitment("+JSONObject.quote(json)+")",null);
    }
    @Override public void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);handleIntervention(intent);handleCommitment(intent);}
    private void message(String text){runOnUiThread(()->{if(web!=null)web.evaluateJavascript("window.platformMessage && window.platformMessage("+JSONObject.quote(text)+")",null);});}
    private void remoteFailure(String requestId){runOnUiThread(()->{if(web!=null)web.evaluateJavascript("window.platformRemoteAIError && window.platformRemoteAIError("+JSONObject.quote(requestId)+")",null);});}
    @Override public void onActivityResult(int request,int resultCode,Intent data){super.onActivityResult(request,resultCode,data);if(resultCode!=RESULT_OK||data==null||data.getData()==null)return;Uri uri=data.getData();io.execute(()->{try{
        if(request==EXPORT){String raw=readyStore().read();if(raw==null)throw new IOException("書き出す記録がありません");try(OutputStream out=getContentResolver().openOutputStream(uri,"wt")){if(out==null)throw new IOException("ファイルを開けません");out.write(raw.getBytes(StandardCharsets.UTF_8));out.flush();}message("バックアップを書き出しました。");}
        else if(request==IMPORT){String raw;try(InputStream in=getContentResolver().openInputStream(uri);ByteArrayOutputStream out=new ByteArrayOutputStream()){if(in==null)throw new IOException("ファイルを開けません");byte[] buffer=new byte[8192];int n;while((n=in.read(buffer))!=-1){if(out.size()+n>25_000_000)throw new IOException("25 MB以下のファイルを選んでください");out.write(buffer,0,n);}raw=out.toString("UTF-8");}store.preserveImport(raw);final String imported=raw;runOnUiThread(()->{if(web!=null)web.evaluateJavascript("window.platformImportCandidate && window.platformImportCandidate("+JSONObject.quote(imported)+")",null);});}
        // Rehearsal path: the picked artifact is copied into cache, read without ever being
        // opened for writing, and the extracted JSON is preserved as an immutable import
        // source. Nothing is committed, so a failed rehearsal leaves both the picked file
        // and the currently installed app's state untouched.
        else if(request==MIGRATION){File scratch=new File(getCacheDir(),"migration-qa-scratch");scratch.mkdirs();File staged=new File(getCacheDir(),"migration-qa-input-"+System.currentTimeMillis()+".bin");try{
            try(InputStream in=getContentResolver().openInputStream(uri);OutputStream out=new FileOutputStream(staged)){if(in==null)throw new IOException("ファイルを開けません");byte[] buffer=new byte[8192];int n;long total=0;while((n=in.read(buffer))!=-1){total+=n;if(total>MigrationSource.MAX_BYTES)throw new IOException("25 MB以下のファイルを選んでください");out.write(buffer,0,n);}}
            MigrationSource.Result source=MigrationSource.read(staged,scratch);store.preserveImport(source.json);
            final String payload=source.json;final String meta=new JSONObject().put("format",source.format).put("sha256",source.sha256).put("bytes",source.bytes).put("name",source.name).toString();
            runOnUiThread(()->{if(web!=null)web.evaluateJavascript("window.platformMigrationQaSource && window.platformMigrationQaSource("+JSONObject.quote(payload)+","+JSONObject.quote(meta)+")",null);});
        }finally{staged.delete();}}
    }catch(Exception ex){message("ファイル操作を完了できませんでした："+ex.getMessage());}});}
    @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] grants){super.onRequestPermissionsResult(request,permissions,grants);if(request==NOTIFICATIONS){BreakReceiver.schedule(this,store==null?null:store.read());message(BreakReceiver.permitted(this)?"休憩終了通知を許可しました。":"通知はオフです。学習・休憩はそのまま使えます。");}}
    @Override protected void onPause(){if(voice!=null)voice.foreground(false);if(web!=null){web.onPause();web.pauseTimers();}super.onPause();}
    @Override protected void onResume(){super.onResume();if(voice!=null)voice.foreground(true);if(web!=null){web.resumeTimers();web.onResume();web.evaluateJavascript("window.platformResume && window.platformResume()",null);}}
    @Override public void onBackPressed(){if(web!=null)web.evaluateJavascript("window.platformBack ? window.platformBack() : false",handled->{if("false".equals(handled))moveTaskToBack(true);});else super.onBackPressed();}
    @Override protected void onDestroy(){if(voice!=null)voice.close();if(remoteAI!=null)remoteAI.close();if(web!=null){web.removeJavascriptInterface("AndroidStore");web.destroy();web=null;}io.execute(()->{if(store!=null)store.close();});io.shutdown();super.onDestroy();}
}
