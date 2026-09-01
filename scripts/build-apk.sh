#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "📱 ==============================================="
echo "📱 SAMPLE TRACKER - ANDROID APK BUILDER"
echo "📱 ==============================================="

# Auto-detect or set JDK
if [ -d "/home/endri-pro/jdk21" ]; then
  export JAVA_HOME="/home/endri-pro/jdk21"
  export PATH="$JAVA_HOME/bin:$PATH"
fi

if ! command -v javac &>/dev/null && ! command -v java &>/dev/null; then
  echo "❌ Java Development Kit (JDK 17+) is required."
  exit 1
fi

echo "🔄 1. Syncing Web Assets to Android Project..."
npx cap sync android

echo "🔨 2. Building Android Debug APK via Gradle..."
cd "$ROOT_DIR/android"
./gradlew assembleDebug

APK_SRC="$ROOT_DIR/android/app/build/outputs/apk/debug/app-debug.apk"
APK_DEST_DIR="$ROOT_DIR/apk"
APK_DEST="$APK_DEST_DIR/SampleTracker-debug.apk"

if [ -f "$APK_SRC" ]; then
  mkdir -p "$APK_DEST_DIR"
  cp "$APK_SRC" "$APK_DEST"
  echo ""
  echo "🎉 ==============================================="
  echo "🎉 ANDROID APK BUILD SUCCESSFUL!"
  echo "📦 Location: $APK_DEST"
  echo "📱 ==============================================="
else
  echo "❌ APK build output not found at: $APK_SRC"
  exit 1
fi
