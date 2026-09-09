# Build v0.4 Conversation Continuity — 2026-09-06

## APK

- File: `dist/shin-yakushin-v0.4-conversation-debug.apk`
- Size: **169,860,603 bytes**
- SHA-256: `bc3c95ff6550587673338d89a555e955650905a2cc7711a7dee4bfaf002eb380`
- Debug certificate SHA-256: `2f79703b5bdb69022add6b3bc017f73bc268f9a608df6524a0669f92fc6e837a`
- Application ID: `org.shinyakushin.study.next.v04.preview`
- Manifest version: `4` / `0.4.0-preview`
- minSdk / targetSdk / compileSdk: 26 / 35 / 35
- ABI: arm64-v8a, x86_64
- AGP metadata: 8.7.3

## Method and status

The prior official Gradle-generated v0.4 preview APK was used as the binary baseline. The fallback tool `tools/repackage_v2.py` performs three bounded operations: replaces the accidental build-machine path in the JNI ELF string table with `libvoicevox_core.so`, replaces six local web assets, and writes aligned ZIP entries plus a new RSA APK v2 debug signature. It does not substitute, regenerate, or alter VOICEVOX CORE, ONNX Runtime, dictionary, VVM, or licenses.

The tool verifies ZIP CRCs, both repaired JNI dependencies, the RSA signature, certificate/public-key match, and APK chunked content digest. All packaged native LOAD segments use 16 KiB alignment. The private debug signing key is outside the source and deliverables.

Current-source `assembleDebug` and `lintDebug`: **BLOCKED**. Gradle 8.9, SDK Platform/Build Tools 35, NDK 27, CMake 3.22.1, adb, and emulator disappeared with the earlier execution environment. The already authorized download was rejected by the current environment's non-interactive approval policy before network access. No unofficial mirror, stub SDK, or fake APK was used.

The strengthened Java native ConversationState validator is therefore Source-only in this artifact cycle. The APK includes the updated JS validation, conversation implementation, Character Profiles, Study bridge, and UI.

## Payload identity

- `15.vvm`: `c29b0c0f8e332fcedc2a5de4b4426feb75fc9f587c314da99af8dbc964287221`
- `11.vvm`: `3fb0c0f12ec37fda568020509d6e63a0a6b5d6edf3c2330508c6bf4e3eeb8b82`
- Open JTalk dictionary archive receipt: `33e9cd251bc41aa2bd7ca36f57abbf61eae3543ca25ca892ae345e394cb10549`

See `LICENSES.md`, `docs/VOICEVOX.md`, and `app/src/main/assets/voicevox/manifest.json` for provenance and notices.
