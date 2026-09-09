#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
voice="$root/app/src/main/assets/voicevox"
mkdir -p "$voice"
echo 'Use the official VOICEVOX Core 0.17.0 Android archive and the official VVM release.'
echo 'The archive is intentionally not downloaded implicitly: verify its license and SHA-256 first.'
test -s "$voice/11.vvm" && test -s "$voice/15.vvm" || { echo 'VVM files are missing'; exit 2; }
test -s "$voice/dict/sys.dic" || { echo 'Open JTalk dictionary is missing'; exit 2; }
test -s "$root/app/src/main/jniLibs/arm64-v8a/libvoicevox_core.so" || { echo 'arm64 Core library is missing'; exit 2; }
test -s "$root/app/src/main/jniLibs/x86_64/libvoicevox_core.so" || { echo 'x86_64 Core library is missing'; exit 2; }
sha256sum "$voice/11.vvm" "$voice/15.vvm" "$root"/app/src/main/jniLibs/*/*.so
