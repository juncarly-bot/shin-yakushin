package org.shinyakushin.study.next;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.util.Base64;
import java.io.ByteArrayOutputStream;
import java.util.TreeMap;
import org.json.JSONArray;
import org.json.JSONObject;

/** Local UI catalog only. Call off the main thread; never add this to AI context. */
final class LaunchableApps {
    static String read(Context context) {
        JSONArray result = new JSONArray();
        PackageManager pm = context.getPackageManager();
        TreeMap<String, ResolveInfo> unique = new TreeMap<>();
        try {
            Intent launcher = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
            for (ResolveInfo app : pm.queryIntentActivities(launcher, 0)) {
                if (app.activityInfo != null && app.activityInfo.exported && app.activityInfo.enabled)
                    unique.put(app.activityInfo.packageName, app);
            }
            for (java.util.Map.Entry<String, ResolveInfo> entry : unique.entrySet()) {
                String pkg = entry.getKey();
                ResolveInfo app = entry.getValue();
                JSONObject row = new JSONObject();
                row.put("packageName", pkg);
                String label = pkg;
                try { label = String.valueOf(app.loadLabel(pm)); } catch (RuntimeException ignored) { }
                row.put("label", label);
                String icon = "";
                try {
                    Drawable drawable = app.loadIcon(pm);
                    Bitmap bitmap = Bitmap.createBitmap(48, 48, Bitmap.Config.ARGB_8888);
                    try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                        drawable.setBounds(0, 0, 48, 48);
                        drawable.draw(new Canvas(bitmap));
                        bitmap.compress(Bitmap.CompressFormat.PNG, 100, out);
                        icon = "data:image/png;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
                    } finally { bitmap.recycle(); }
                } catch (Exception ignored) { }
                row.put("icon", icon);
                result.put(row);
            }
            return new JSONObject().put("ok", true).put("apps", result).toString();
        } catch (Exception ignored) {
            return "{\"ok\":false,\"apps\":[]}";
        }
    }
}
