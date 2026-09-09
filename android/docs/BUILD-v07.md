# Build report — v0.7 Remote AI

Date: 2026-09-09

- Application ID: `org.shinyakushin.study.next.v07.preview`
- Version: 7 / `0.7.0-preview`
- minSdk / targetSdk / compileSdk: 26 / 35 / 35
- ABI: arm64-v8a, x86_64
- Expected APK path: `app/build/outputs/apk/debug/app-debug.apk`
- APK: **NOT GENERATED in this workspace**

`tools/build.py` reported these missing prerequisites:

- Gradle 8.9
- Android SDK Platform 35
- Android Build-tools 35.0.0
- Android CMake 3.22.1
- Android NDK compatible with AGP 8.7.3

The recovered VOICEVOX bundle is present locally and passes metadata and SHA-256 verification (`tools/verify_voice_bundle.py` and `SHA256SUMS-VOICEVOX-v07.txt`). Large third-party binaries are deliberately excluded from GitHub source blobs; `docs/VOICE-BUNDLE-v07.md` and `tools/restore_voice_bundle.sh` describe the durable restore path.

Java source parsing passed, but this is not Android symbol/type compilation. No old APK was renamed or reported as a v0.7 build.

Backend uses Node.js 20+ and has no runtime package dependency. `node --test tests/*.test.mjs` covers the mocked OpenAI Responses request and HTTP boundary without requiring an API key.

The lightweight source archive excludes the already verified third-party VVM, Open JTalk dictionary, native VOICEVOX libraries, and WAV evidence to avoid redistributing a 275 MB binary bundle as source. Their official licenses, manifests and verification records remain documented in the workspace. The full working tree retains those files.

