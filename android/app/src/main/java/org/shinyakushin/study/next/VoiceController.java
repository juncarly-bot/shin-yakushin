package org.shinyakushin.study.next;
import android.content.Context;
import android.media.*;
import android.os.*;
import android.util.AtomicFile;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;
import org.json.*;

/** Bounded requests play in order. A new user turn cancels stale synthesis and playback. */
public final class VoiceController {
 private final Context context;private final Handler main=new Handler(Looper.getMainLooper());
 private final ExecutorService worker=Executors.newSingleThreadExecutor();private VoiceProvider provider;
 private MediaPlayer player;private AudioFocusRequest focus;private CountDownLatch playbackDone;
 private volatile long retryAfter;
 private long generation;private final ArrayDeque<Request> pending=new ArrayDeque<>();private boolean running,foreground=true,closed;
 private volatile String status="音声は必要なときに準備します。";
 private static final class Request {String text,speaker;float volume;int priority;long token;}
 public VoiceController(Context c){context=c.getApplicationContext();provider=new VoicevoxProvider(context);}
 public String status(){return status;}
 private Request request(JSONObject j,long token)throws JSONException{Request r=new Request();r.text=j.getString("text");r.speaker=j.getString("speaker");r.volume=(float)j.getDouble("volume");r.priority=j.getInt("priority");r.token=token;if(r.text.length()>500||r.text.indexOf(0)>=0||!Arrays.asList("SAYO","NurseT").contains(r.speaker)||!Float.isFinite(r.volume)||r.volume<0||r.volume>1)throw new JSONException("invalid voice request");return r;}
 public synchronized void speak(String raw){if(closed||!foreground)return;try{long token=++generation;pending.clear();pending.add(request(new JSONObject(raw),token));main.post(this::stopPlayback);startDrain();}catch(Exception ignored){status="音声の要求を読み込めません。文字で続けられます。";}}
 public synchronized void speakBatch(String raw){if(closed||!foreground)return;try{JSONArray list=new JSONArray(raw);if(list.length()<1||list.length()>4)throw new JSONException("invalid voice batch");long token=++generation;pending.clear();for(int i=0;i<list.length();i++)pending.add(request(list.getJSONObject(i),token));main.post(this::stopPlayback);startDrain();}catch(Exception ignored){status="音声の要求を読み込めません。文字で続けられます。";}}
 private void startDrain(){if(!running){running=true;worker.execute(this::drain);}}
 private synchronized boolean valid(long token){return !closed&&foreground&&generation==token;}
 private void drain(){while(true){Request r;synchronized(this){r=pending.pollFirst();if(r==null){running=false;return;}}try{if(provider instanceof NoVoiceProvider){if(System.currentTimeMillis()<retryAfter)continue;provider=new VoicevoxProvider(context);}status="音声を端末内で準備しています…";File wav=cached(r);if(wav!=null&&valid(r.token)){CountDownLatch done=new CountDownLatch(1);main.post(()->play(r,wav,done));done.await(120,TimeUnit.SECONDS);if(valid(r.token)){synchronized(this){if(!pending.isEmpty())Thread.sleep(280);}}}}catch(Exception|LinkageError ex){android.util.Log.e("StudyVoice","Initialization or synthesis failed",ex);retryAfter=System.currentTimeMillis()+30000;status="音声を準備できませんでした（"+ex.getClass().getSimpleName()+"）。文字で続けられます。30秒後に再試行できます。";try{provider.close();}catch(Exception|LinkageError ignored){}provider=new NoVoiceProvider();}}}
 private File cached(Request r)throws Exception{String key=VoicevoxProvider.hash(VoicevoxProvider.utf(provider.identity()+"\n"+r.speaker+"\n"+r.text));File dir=new File(context.getCacheDir(),"voice");if(!dir.isDirectory()&&!dir.mkdirs())throw new IOException("cache unavailable");File file=new File(dir,key+".wav"),checksum=new File(dir,key+".sha256");if(file.isFile()&&checksum.isFile()){byte[] bytes=java.nio.file.Files.readAllBytes(file.toPath());String digest=new String(java.nio.file.Files.readAllBytes(checksum.toPath()),java.nio.charset.StandardCharsets.UTF_8);if(bytes.length>44&&VoicevoxProvider.hash(bytes).equals(digest))return file;file.delete();checksum.delete();}
 byte[] bytes=provider.render(r.text,r.speaker);if(bytes==null)return null;if(bytes.length<44||bytes[0]!='R'||bytes[1]!='I'||bytes[2]!='F'||bytes[3]!='F')throw new IOException("invalid WAV");write(file,bytes);write(checksum,VoicevoxProvider.utf(VoicevoxProvider.hash(bytes)));File[] entries=dir.listFiles((d,n)->n.endsWith(".wav"));if(entries!=null){Arrays.sort(entries,Comparator.comparingLong(File::lastModified));long size=0;for(File x:entries)size+=x.length();for(int i=0;i<entries.length&&(size>64*1024*1024||entries.length-i>64);i++){File x=entries[i];if(x.equals(file))continue;size-=x.length();x.delete();new File(dir,x.getName().replace(".wav",".sha256")).delete();}}return file;}
 private static void write(File file,byte[] bytes)throws IOException{AtomicFile a=new AtomicFile(file);FileOutputStream out=null;try{out=a.startWrite();out.write(bytes);a.finishWrite(out);}catch(IOException x){if(out!=null)a.failWrite(out);throw x;}}
 private void play(Request r,File file,CountDownLatch done){if(!valid(r.token)){done.countDown();return;}stopPlayback();playbackDone=done;try{AudioManager manager=context.getSystemService(AudioManager.class);AudioAttributes attr=new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build();focus=new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK).setAudioAttributes(attr).setOnAudioFocusChangeListener(change->{if(change<0)cancel();},main).build();if(manager.requestAudioFocus(focus)!=AudioManager.AUDIOFOCUS_REQUEST_GRANTED){stopPlayback();return;}player=new MediaPlayer();MediaPlayer current=player;current.setAudioAttributes(attr);current.setDataSource(file.getPath());current.setVolume(r.volume,r.volume);current.setOnPreparedListener(p->{if(valid(r.token)&&player==p){p.start();status="端末内のVOICEVOXで再生しています。";}else stopPlayback();});current.setOnCompletionListener(p->{status="音声の再生が終わりました。";stopPlayback();});current.setOnErrorListener((p,w,e)->{status="音声を再生できませんでした。文字で続けられます。";stopPlayback();return true;});current.prepareAsync();}catch(Exception ex){status="音声を再生できませんでした。文字で続けられます。";stopPlayback();}}
 private void stopPlayback(){if(player!=null){player.release();player=null;}if(focus!=null){context.getSystemService(AudioManager.class).abandonAudioFocusRequest(focus);focus=null;}if(playbackDone!=null){playbackDone.countDown();playbackDone=null;}}
 public synchronized void cancel(){generation++;pending.clear();main.post(this::stopPlayback);}
 public synchronized void foreground(boolean value){foreground=value;if(!value)cancel();}
 public synchronized void close(){closed=true;cancel();worker.execute(()->provider.close());worker.shutdown();}
}
