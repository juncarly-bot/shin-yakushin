package org.shinyakushin.study.next;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.*;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.concurrent.*;
import javax.net.ssl.HttpsURLConnection;
import org.json.JSONObject;

/** HTTPS-only client for the operator-owned backend. It never accepts or stores an OpenAI key. */
final class RemoteAIClient implements AutoCloseable {
    interface Callback { void success(String requestId, String response); void failure(String requestId); }
    private static final int MAX_REQUEST=64*1024, MAX_RESPONSE=32*1024;
    private static final String PREFS="remote_ai_public_config", ENDPOINT="backend_url";
    private final SharedPreferences preferences;
    private volatile String endpoint;
    private volatile HttpsURLConnection activeConnection;
    private final java.util.concurrent.atomic.AtomicLong generation=new java.util.concurrent.atomic.AtomicLong();
    private final ExecutorService worker=Executors.newSingleThreadExecutor();

    RemoteAIClient(Context context){preferences=context.getSharedPreferences(PREFS,Context.MODE_PRIVATE);endpoint=preferences.getString(ENDPOINT,context.getString(R.string.remote_ai_backend_url)).trim();}
    boolean available(){try{return validEndpoint(endpoint)!=null;}catch(Exception ignored){return false;}}
    String endpoint(){return endpoint;}
    boolean configure(String raw){try{String value=raw==null?"":raw.trim();if(value.length()>2048)throw new IOException("URL too long");if(!value.isEmpty())validEndpoint(value);endpoint=value;preferences.edit().putString(ENDPOINT,value).apply();return true;}catch(Exception invalid){return false;}}

    void request(String requestId,String raw,Callback callback){
        if(requestId==null||requestId.length()>80||raw==null||raw.getBytes(StandardCharsets.UTF_8).length>MAX_REQUEST){callback.failure(requestId);return;}
        final URL url;
        try{url=validEndpoint(endpoint);if(url==null)throw new IOException("not configured");new JSONObject(raw);}
        catch(Exception invalid){callback.failure(requestId);return;}
        final long ticket=generation.get();
        worker.execute(()->{
            if(ticket!=generation.get())return;
            HttpsURLConnection connection=null;
            try{
                connection=(HttpsURLConnection)url.openConnection();
                activeConnection=connection;
                if(ticket!=generation.get())return;
                connection.setInstanceFollowRedirects(false);
                connection.setRequestMethod("POST");
                connection.setConnectTimeout(8000);
                connection.setReadTimeout(65000);
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type","application/json; charset=utf-8");
                connection.setRequestProperty("Accept","application/json");
                byte[] bytes=raw.getBytes(StandardCharsets.UTF_8);
                connection.setFixedLengthStreamingMode(bytes.length);
                try(OutputStream out=connection.getOutputStream()){out.write(bytes);out.flush();}
                if(connection.getResponseCode()!=200)throw new IOException("backend unavailable");
                String response=readBounded(connection.getInputStream(),MAX_RESPONSE);
                JSONObject parsed=new JSONObject(response);
                if(!parsed.optBoolean("ok")||!parsed.has("reaction"))throw new IOException("invalid backend response");
                if(ticket==generation.get())callback.success(requestId,parsed.getJSONObject("reaction").toString());
            }catch(Exception unavailable){if(ticket==generation.get())callback.failure(requestId);}
            finally{activeConnection=null;if(connection!=null)connection.disconnect();}
        });
    }

    private static URL validEndpoint(String raw)throws Exception{
        if(raw==null||raw.trim().isEmpty())return null;
        URL url=new URL(raw);String host=url.getHost().toLowerCase(Locale.ROOT);
        if(!"https".equalsIgnoreCase(url.getProtocol())||host.trim().isEmpty()||url.getUserInfo()!=null||url.getQuery()!=null||url.getRef()!=null)throw new IOException("HTTPS backend required");
        if(host.equals("openai.com")||host.endsWith(".openai.com"))throw new IOException("Direct OpenAI access is forbidden");
        return url;
    }
    private static String readBounded(InputStream in,int max)throws IOException{
        try(InputStream source=in;ByteArrayOutputStream out=new ByteArrayOutputStream()){
            byte[] buffer=new byte[4096];int n;
            while((n=source.read(buffer))!=-1){if(out.size()+n>max)throw new IOException("response too large");out.write(buffer,0,n);}
            return out.toString(StandardCharsets.UTF_8.name());
        }
    }
    void cancel(){generation.incrementAndGet();HttpsURLConnection connection=activeConnection;if(connection!=null)connection.disconnect();}
    @Override public void close(){cancel();worker.shutdownNow();}
}
