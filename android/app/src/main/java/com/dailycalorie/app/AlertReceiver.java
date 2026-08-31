package com.dailycalorie.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class AlertReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String kind = intent.getStringExtra("kind");
        if (kind == null) kind = "meal";
        String title;
        String body;
        switch (kind) {
            case "breakfast":
                title = "Breakfast reminder";
                body = "Log a light Indian breakfast that fits today's calorie target.";
                break;
            case "lunch":
                title = "Lunch reminder";
                body = "Time for lunch. Check remaining calories before you plate.";
                break;
            case "snack":
                title = "Snack reminder";
                body = "If you need a snack, pick a suggested Indian option.";
                break;
            case "dinner":
                title = "Dinner reminder";
                body = "Keep dinner inside the calories still left today.";
                break;
            default:
                title = "Daily Calorie";
                body = "Time to check today's calorie plan.";
        }
        MainActivity.showNotification(context, title, body);
    }
}
