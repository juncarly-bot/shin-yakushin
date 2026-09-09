package org.shinyakushin.study.next;
import android.app.*;
import android.content.*;
import android.media.*;
import android.os.*;
import org.json.*;
import java.io.*;
import java.nio.file.*;
import java.util.concurrent.*;
/** Runs only through the separate test APK. All storage faults use isolated synthetic data. */
public class DeviceQa extends Instrumentation {
 private final StringBuilder log=new StringBuilder();
 interface Check{void run() throws Exception;}
 private void test(String name,Check check){try{check.run();log.append(name+": PASS\n");}catch(Throwable e){log.append(name+": FAIL "+e+"\n");}Bundle b=new Bundle();b.putString("stream",log.toString());sendStatus(0,b);}
 private static void require(boolean b,String message){if(!b)throw new AssertionError(message);}
 public void onCreate(Bundle args){super.onCreate(args);start();}
 public void onStart(){new Thread(()->{Context app=getTargetContext();File output=new File(app.getFilesDir(),"device-qa-"+System.currentTimeMillis());output.mkdirs();
 Context isolated=new ContextWrapper(app){public Context getApplicationContext(){return this;}public File getFilesDir(){return output;}public File getCacheDir(){File f=new File(output,"cache");f.mkdirs();return f;}};
 test("Native persistence / restart / backup / fresh restore / corruption recovery",()->{
 String raw=new String(VoicevoxProvider.readBytes(getContext().getAssets().open("state.json")),java.nio.charset.StandardCharsets.UTF_8);JSONObject data=new JSONObject(raw);data.put("revision",0);raw=data.toString();StateStore s=new StateStore(isolated);s.commit(-1,raw,false);s.close();s=new StateStore(isolated);require(s.read().equals(raw),"restart mismatch");require(StateStore.readAtomic(new File(output,"study.backup.json")).equals(raw),"backup mismatch");s.close();
 File restoreDir=new File(output,"restore");restoreDir.mkdirs();Context restoreCtx=new ContextWrapper(isolated){public Context getApplicationContext(){return this;}public File getFilesDir(){return restoreDir;}};StateStore fresh=new StateStore(restoreCtx);fresh.commit(-1,raw,true);require(fresh.read().equals(raw),"restore mismatch");fresh.close();
 Files.write(new File(output,"study.sqlite3").toPath(),new byte[]{1,2,3});s=new StateStore(isolated);require(s.read().equals(raw),"recovery mismatch");require(!s.warning().isEmpty(),"missing recovery warning");require(output.listFiles((d,n)->n.contains(".corrupt-")).length>0,"corrupt original not preserved");s.close();
 });
 test("Missing bundle initialization falls back without damaging study",()->{
 Context emptyAssets=new ContextWrapper(isolated){public Context getApplicationContext(){return this;}public android.content.res.AssetManager getAssets(){return DeviceQa.this.getContext().getAssets();}};
 VoiceController controller=new VoiceController(emptyAssets);try{controller.speak("{\"speaker\":\"SAYO\",\"text\":\"確認\",\"volume\":0.5,\"priority\":1}");long until=System.currentTimeMillis()+5000;while(!controller.status().contains("文字で")&&System.currentTimeMillis()<until)Thread.sleep(20);require(controller.status().contains("文字で"),"fallback status absent");StateStore store=new StateStore(isolated);require(store.read()!=null,"study lost after voice failure");store.close();}finally{controller.close();}
 });
 VoicevoxProvider voice=new VoicevoxProvider(app);
 for(String speaker:new String[]{"SAYO","NurseT"})test(speaker+" native synthesis and MediaPlayer completion",()->{
 byte[] bytes=voice.render("今日も、一緒に勉強しましょう。",speaker);require(bytes.length>44,"empty WAV");File wav=new File(output,speaker+".wav");Files.write(wav.toPath(),bytes);play(wav);log.append(speaker+" WAV bytes="+bytes.length+" sha256="+VoicevoxProvider.hash(bytes)+"\n");});
 test("LocalRulesProvider dynamic text synthesis",()->{String text=new String(VoicevoxProvider.readBytes(getContext().getAssets().open("reaction.txt")),java.nio.charset.StandardCharsets.UTF_8);byte[] bytes=voice.render(text,"SAYO");require(bytes.length>44,"empty dynamic WAV");File wav=new File(output,"dynamic.wav");Files.write(wav.toPath(),bytes);play(wav);});
 test("NoVoice provider is a normal empty result",()->{require(new NoVoiceProvider().render("test","SAYO")==null,"no voice should be optional");});
 voice.close();try{Files.write(new File(output,"results.txt").toPath(),log.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));}catch(Exception ignored){}Bundle result=new Bundle();result.putString("stream",log+"Evidence directory: "+output);finish(log.indexOf(": FAIL")<0?Activity.RESULT_OK:Activity.RESULT_CANCELED,result);
 },"device-qa").start();}
 private void play(File wav) throws Exception {CountDownLatch done=new CountDownLatch(1);Throwable[] error={null};MediaPlayer[] holder={null};runOnMainSync(()->{try{MediaPlayer p=new MediaPlayer();holder[0]=p;p.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());p.setDataSource(wav.getPath());p.setOnPreparedListener(MediaPlayer::start);p.setOnCompletionListener(x->done.countDown());p.setOnErrorListener((x,w,e)->{error[0]=new IOException("MediaPlayer "+w+"/"+e);done.countDown();return true;});p.prepareAsync();}catch(Exception e){error[0]=e;done.countDown();}});boolean completed=done.await(60,TimeUnit.SECONDS);runOnMainSync(()->{if(holder[0]!=null)holder[0].release();});require(completed,"playback timeout");if(error[0]!=null)throw new IOException(error[0]);}
}
