#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

MODE="${1:-debug}"
BUILD_DIR="$PROJECT_DIR/build"

cd "$PROJECT_DIR"

pnpm run build
cap sync android

cd android

case "$MODE" in
  release)
    ./gradlew :app:assembleRelease
    APK_DIR="app/build/outputs/apk/release"
    ;;
  debug|*)
    ./gradlew :app:assembleDebug
    APK_DIR="app/build/outputs/apk/debug"
    ;;
esac

APK=$(find "$APK_DIR" -name "*.apk" -maxdepth 1 | head -1)

if [ -z "$APK" ]; then
  echo "ERROR: No APK found in $APK_DIR" >&2
  exit 1
fi

cd "$PROJECT_DIR"
mkdir -p "$BUILD_DIR"
cp "android/$APK" "$BUILD_DIR/"

echo ""
echo "APK: build/$(basename "$APK")"
