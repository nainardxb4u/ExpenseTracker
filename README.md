# Daily Calorie

Android app that plans **daily calories from your current weight and target weight**, suggests Indian meals, and sends meal/calorie alerts.

## How calories are set

1. Enter **current weight** and **target weight**, or tap **Reduce / Gain / Maintain**.
2. Daily calories are calculated from that gap:
   - Target **below** current → **Reduce** (calorie deficit)
   - Target **above** current → **Gain** (calorie surplus)
   - Weights close → **Maintain**
3. Resting burn is estimated from age, height, gender, and activity (Mifflin–St Jeor).
4. The daily target is maintenance plus a safe surplus or deficit (about 0.2–0.75 kg/week), floored so intake does not go below 1200–1500 kcal.
5. Update current or target weight on **Home** or **You**, then tap **Update calorie target**. Indian meal suggestions follow the new daily budget.

Indian plates (idli, roti + dal, biryani, chaat, and more) are suggested to fit the calories still left today.

## Alerts

- Breakfast, lunch, snack, and dinner reminders (custom times)
- Warning at 80% of the daily calorie target
- Alert when you exceed the target
- Optional hydration pings

On Android, allow notifications the first time you save reminder times.

## Install the APK

Download [`releases/DailyCalorie.apk`](releases/DailyCalorie.apk) onto a phone (Android 8+).

1. Open the file.
2. Allow install from this source if asked.
3. Open **Daily Calorie** and complete current vs target weight setup.

## Try in a browser

Open `web/index.html` (meal notifications in the browser only fire while the page is open).

## Build the APK yourself

```bash
export ANDROID_HOME="$HOME/android-sdk"
export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-21-openjdk-amd64}"
cd android
./gradlew assembleDebug
cp app/build/outputs/apk/debug/app-debug.apk ../releases/DailyCalorie.apk
```
