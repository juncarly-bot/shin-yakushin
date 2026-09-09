package org.shinyakushin.study.next;
import android.content.Context;
import android.util.AtomicFile;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import org.json.*;
/** Called only from VoiceController's single worker. Assets are validated before use. */
public final class VoicevoxProvider implements VoiceProvider {
 private final Context context;private long handle;private final Set<String> loaded=new HashSet<>();
 private File root;
 public VoicevoxProvider(Context c){context=c.getApplicationContext();}
 static native long create(byte[] dict,byte[] runtime);
 static native String load(long handle,byte[] path);
 static native byte[] synthesize(long handle,byte[] text,int style);
 static native void destroy(long handle);
 static byte[] readBytes(InputStream in)throws IOException{ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1)out.write(b,0,n);return out.toByteArray();}
 static byte[] utf(String s){return s.getBytes(StandardCharsets.UTF_8);}
 static String hash(byte[] bytes)throws Exception{byte[] hash=MessageDigest.getInstance("SHA-256").digest(bytes);StringBuilder s=new StringBuilder();for(byte b:hash)s.append(String.format(Locale.ROOT,"%02x",b&255));return s.toString();}
 static String fileHash(File file)throws Exception{MessageDigest d=MessageDigest.getInstance("SHA-256");try(InputStream in=new FileInputStream(file)){byte[] b=new byte[65536];int n;while((n=in.read(b))!=-1)d.update(b,0,n);}StringBuilder result=new StringBuilder();for(byte b:d.digest())result.append(String.format(Locale.ROOT,"%02x",b&255));return result.toString();}
 private void install() throws Exception {
  root=new File(context.getFilesDir(),"voicevox-0.17.0");if(!root.isDirectory()&&!root.mkdirs())throw new IOException("音声用の容量を確保できません");
  JSONObject manifest;try(InputStream in=context.getAssets().open("voicevox/manifest.json")){manifest=new JSONObject(new String(readBytes(in),StandardCharsets.UTF_8));}
  if(!"0.17.0".equals(manifest.getString("core"))||!"1.23.2".equals(manifest.getString("onnxruntime")))throw new IOException("音声パッケージの版が違います");
  JSONObject files=manifest.getJSONObject("files");Iterator<String> keys=files.keys();while(keys.hasNext()){String name=keys.next();if(name.contains("..")||name.startsWith("/"))throw new IOException("音声パスが不正です");File dest=new File(root,name);String expected=files.getString(name);if(dest.isFile()&&fileHash(dest).equals(expected))continue;if(!dest.getParentFile().isDirectory()&&!dest.getParentFile().mkdirs())throw new IOException("音声ディレクトリを作れません");AtomicFile atomic=new AtomicFile(dest);FileOutputStream out=null;try(InputStream in=context.getAssets().open("voicevox/"+name)){out=atomic.startWrite();MessageDigest digest=MessageDigest.getInstance("SHA-256");byte[] b=new byte[65536];int n;while((n=in.read(b))!=-1){digest.update(b,0,n);out.write(b,0,n);}StringBuilder got=new StringBuilder();for(byte v:digest.digest())got.append(String.format(Locale.ROOT,"%02x",v&255));if(!got.toString().equals(expected))throw new IOException("音声ファイルのハッシュが一致しません");atomic.finishWrite(out);}catch(Exception ex){if(out!=null)atomic.failWrite(out);throw ex;}}
 }
 private void initialize()throws Exception{if(handle!=0)return;install();System.loadLibrary("study_voice");File lib=new File(context.getApplicationInfo().nativeLibraryDir,"libvoicevox_onnxruntime.so");handle=create(utf(new File(root,"dict").getPath()),utf(lib.getPath()));if(handle==0)throw new IOException("音声を初期化できません");}
 public byte[] render(String text,String speaker)throws Exception{
  initialize();String name=speaker.equals("SAYO")?"小夜/SAYO":"ナースロボ＿タイプＴ";int style=speaker.equals("SAYO")?46:47;
  if(!loaded.contains(speaker)){String file=speaker.equals("SAYO")?"15.vvm":"11.vvm";JSONArray meta=new JSONArray(load(handle,utf(new File(root,file).getPath())));Set<Integer> found=new HashSet<>();for(int i=0;i<meta.length();i++){JSONObject m=meta.getJSONObject(i);if(name.equals(m.getString("name"))){JSONArray styles=m.getJSONArray("styles");for(int j=0;j<styles.length();j++)found.add(styles.getJSONObject(j).getInt("id"));}}if(!found.contains(style)||speaker.equals("NurseT")&&!found.containsAll(Arrays.asList(47,48,49,50)))throw new IOException("VVMの話者とstyleが一致しません");loaded.add(speaker);}
  return synthesize(handle,utf(text),style);
 }
 public String identity(){return "voicevox-0.17.0-ort1.23.2-default-46-47";}
 public void close(){if(handle!=0){destroy(handle);handle=0;}loaded.clear();}
}
