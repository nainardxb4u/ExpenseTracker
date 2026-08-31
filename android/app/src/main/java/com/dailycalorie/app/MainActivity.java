package com.dailycalorie.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONObject;

import java.util.Calendar;

public class MainActivity extends AppCompatActivity {
    public static final String CHANNEL_ID = "daily_calorie_alerts";
    public static final String PREFS = "daily_calorie";
    private static final int REQ_NOTIFY = 42;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createChannel();

        WebView web = new WebView(this);
        web.setWebViewClient(new WebViewClient());
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        setContentView(web);
        web.loadUrl("file:///android_asset/www/index.html");
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Meal and calorie alerts",
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Breakfast, lunch, dinner reminders and calorie warnings");
            NotificationManager mgr = getSystemService(NotificationManager.class);
            if (mgr != null) mgr.createNotificationChannel(channel);
        }
    }

    public static void showNotification(Context context, String title, String body) {
        Intent intent = new Intent(context, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(
                context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setContentIntent(pi);
        NotificationManager mgr = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (mgr != null) mgr.notify((int) System.currentTimeMillis(), builder.build());
    }

    public static void scheduleFromJson(Context context, String json) {
        try {
            JSONObject obj = new JSONObject(json);
            SharedPreferences prefs = context.getSharedPreferences(PREFS, MODE_PRIVATE);
            prefs.edit().putString("alerts", json).apply();

            String[] keys = {"breakfast", "lunch", "snack", "dinner"};
            boolean meals = obj.optBoolean("meals", true);
            AlarmManager am = (AlarmManager) context.getSystemService(ALARM_SERVICE);
            if (am == null) return;

            for (int i = 0; i < keys.length; i++) {
                Intent intent = new Intent(context, AlertReceiver.class);
                intent.putExtra("kind", keys[i]);
                PendingIntent pi = PendingIntent.getBroadcast(
                        context, 100 + i, intent,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                );
                am.cancel(pi);
                if (!meals) continue;
                String time = obj.optString(keys[i], "");
                if (time.length() < 4) continue;
                String[] parts = time.split(":");
                int hour = Integer.parseInt(parts[0]);
                int minute = Integer.parseInt(parts[1]);
                Calendar cal = Calendar.getInstance();
                cal.set(Calendar.HOUR_OF_DAY, hour);
                cal.set(Calendar.MINUTE, minute);
                cal.set(Calendar.SECOND, 0);
                cal.set(Calendar.MILLISECOND, 0);
                if (cal.getTimeInMillis() <= System.currentTimeMillis()) {
                    cal.add(Calendar.DAY_OF_YEAR, 1);
                }
                am.setRepeating(
                        AlarmManager.RTC_WAKEUP,
                        cal.getTimeInMillis(),
                        AlarmManager.INTERVAL_DAY,
                        pi
                );
            }
        } catch (Exception ignored) {
        }
    }

    class Bridge {
        @JavascriptInterface
        public void notify(String title, String body) {
            runOnUiThread(() -> showNotification(MainActivity.this, title, body));
        }

        @JavascriptInterface
        public void scheduleMealAlerts(String json) {
            scheduleFromJson(MainActivity.this, json);
        }

        @JavascriptInterface
        public void requestNotificationPermission() {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= 33) {
                    if (ContextCompat.checkSelfPermission(
                            MainActivity.this, Manifest.permission.POST_NOTIFICATIONS)
                            != PackageManager.PERMISSION_GRANTED) {
                        ActivityCompat.requestPermissions(
                                MainActivity.this,
                                new String[]{Manifest.permission.POST_NOTIFICATIONS},
                                REQ_NOTIFY
                        );
                    }
                }
            });
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_NOTIFY && (grantResults.length == 0 || grantResults[0] != PackageManager.PERMISSION_GRANTED)) {
            Toast.makeText(this, "Enable notifications to receive meal alerts", Toast.LENGTH_LONG).show();
        }
    }
}
