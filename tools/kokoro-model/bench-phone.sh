#!/usr/bin/env bash
# Times Kokoro on a phone connected with USB debugging, using sherpa-onnx's
# command-line tool (the same engine as the app). Compares model files and
# thread counts, then deletes everything it put on the phone.
#
#   ./bench-phone.sh                          # the built package's model
#   ./bench-phone.sh out/model.conv16.onnx    # also try other model files
#
# Result: seconds of work per second of speech (RTF). Below 1 keeps up.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$HERE/work/bench"
PHONE=/data/local/tmp/listenup-kokoro-bench
SHERPA=v1.13.8
VERSION=$(python3 -c "import json,glob; print(sorted(glob.glob('$HERE/out/listenup-kokoro-v*.json'))[-1].split('-v')[-1][:-5])")
ZIP="$HERE/out/listenup-kokoro-v$VERSION.zip"
THREADS="${THREADS:-2 4}"
TEXT="The library was quiet that afternoon. She found a seat by the window, opened the book, and started reading the first chapter."

adb get-state >/dev/null || { echo "Connect a phone with USB debugging on."; exit 1; }
echo "Phone: $(adb shell getprop ro.product.model | tr -d '\r'), package v$VERSION"

mkdir -p "$WORK"
TOOL="$WORK/sherpa-onnx-$SHERPA-android-aarch64-termux-static/bin/sherpa-onnx-offline-tts"
if [ ! -f "$TOOL" ]; then
  curl -sL "https://github.com/k2-fsa/sherpa-onnx/releases/download/$SHERPA/sherpa-onnx-$SHERPA-android-aarch64-termux-static.tar.bz2" \
    | tar xj -C "$WORK" "sherpa-onnx-$SHERPA-android-aarch64-termux-static/bin/sherpa-onnx-offline-tts"
fi
LIBCXX=$(ls "$ANDROID_HOME"/ndk/*/toolchains/llvm/prebuilt/linux-x86_64/sysroot/usr/lib/aarch64-linux-android/libc++_shared.so | tail -1)
if [ ! -d "$WORK/pkg-v$VERSION" ]; then
  mkdir -p "$WORK/pkg-v$VERSION" && unzip -q "$ZIP" -d "$WORK/pkg-v$VERSION"
fi

cleanup() { adb shell rm -rf "$PHONE" >/dev/null 2>&1 || true; }
trap cleanup EXIT
adb shell mkdir -p "$PHONE"
adb push -q "$TOOL" "$PHONE/tts"
adb push -q "$LIBCXX" "$PHONE/"
adb push -q "$WORK/pkg-v$VERSION" "$PHONE/pkg"
adb shell chmod 755 "$PHONE/tts"
MODELS=(model.onnx)
for extra in "$@"; do
  adb push -q "$extra" "$PHONE/pkg/$(basename "$extra")"
  MODELS+=("$(basename "$extra")")
done

for model in "${MODELS[@]}"; do
  for t in $THREADS; do
    sleep 5 # let the phone cool between runs
    line=$(adb shell "cd $PHONE && LD_LIBRARY_PATH=$PHONE ./tts --kokoro-model=pkg/$model --kokoro-voices=pkg/voices.bin \
      --kokoro-tokens=pkg/tokens.txt --kokoro-data-dir=pkg/espeak-ng-data --kokoro-lexicon=pkg/lexicon-zh.txt --kokoro-lang=en-us \
      --sid=0 --num-threads=$t --output-filename=$PHONE/out-$t-$model.wav '$TEXT' 2>&1" | grep -E "RTF" || echo "failed")
    echo "$model, $t threads: $line"
  done
  adb pull -q "$PHONE/out-4-$model.wav" "$WORK/" 2>/dev/null || true
done
echo "Samples (4 threads) saved in $WORK to listen to."
