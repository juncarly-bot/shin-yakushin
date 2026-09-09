# Build v0.3 — 2026-09-05

APK: **NOT GENERATED**

- Application ID: org.shinyakushin.study.next.v02 (existing workspace ID retained; no install performed)
- Version: 0.3.0 / 3
- ABI target: arm64-v8a. x86_64 emulator build not configured yet.
- minSdk: 26 / targetSdk: 35 / compileSdk: 35
- APK path, size, SHA-256: N/A (artifact absent)
- Expected output after build: app/build/outputs/apk/debug/app-debug.apk
- assembleDebug / lintDebug: blocked before execution by missing prerequisites
- Evidence: docs/evidence/build-v03.txt

The official Google SDK endpoint connection attempt returned “network approval was cancelled before a decision was returned”. No bypass or equivalent download was attempted afterward. User permission/network access remains required to acquire official Android and VOICEVOX build dependencies.

tools/build.py performs preflight and then assembleDebug + lintDebug, reports APK size/hash if successful. tools/verify_voice_bundle.py validates staged metadata before generating asset checksums. C++ uses the official header, which is not yet downloaded; syntax/link compatibility remains unverified. No fabricated SDK stubs or fake APK used.

Source package excludes user data, private signing keys, build caches and unverified third-party assets. Source ZIP SHA-256 is recorded separately; it is not an APK hash.
