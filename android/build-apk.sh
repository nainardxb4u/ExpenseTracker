#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/android-sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
./gradlew assembleRelease
mkdir -p ../releases
cp app/build/outputs/apk/release/app-release.apk ../releases/GroceryMate.apk
echo "Built $(pwd)/../releases/GroceryMate.apk"
