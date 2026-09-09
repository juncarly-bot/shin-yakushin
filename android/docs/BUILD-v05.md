# Build report — v0.5 Conversation UI source

Date: 2026-09-06

## Intended Android artifact

- Application ID: org.shinyakushin.study.next.v05.preview
- Version: 5 / 0.5.0-preview
- minSdk / targetSdk / compileSdk: 26 / 35 / 35
- ABI: arm64-v8a, x86_64
- Expected APK: app/build/outputs/apk/debug/app-debug.apk
- APK status: **NOT GENERATED**
- APK SHA-256: **N/A**

The separate v0.5 application ID protects any installed prior app and user data from overwrite.

## Toolchain result

python3 tools/build.py stopped before compilation because Gradle 8.9, Android Platform/Build Tools 35, NDK 27.0.12077973, and CMake 3.22.1 are absent. adb and emulator are also absent. Java syntax parsing could not run because javac is absent. Android XML resources were parsed successfully with Python.

No fake SDK, stub, old-APK relabel, or unofficial binary was used. assembleDebug, lintDebug, install, launch, and runtime QA remain blocked.

## Bundled official voice payload identity

- 11.vvm: 3fb0c0f12ec37fda568020509d6e63a0a6b5d6edf3c2330508c6bf4e3eeb8b82
- 15.vvm: c29b0c0f8e332fcedc2a5de4b4426feb75fc9f587c314da99af8dbc964287221
- arm64 CORE: 8ccdc5608550fdc5b01ed3414462e1cb74b68eff907267626b5eb856e6ffb649
- arm64 ONNX Runtime: b5380b9d310bbd1f46b20b1406d6a5a030ff5f36a45964481af8af5a54c4e4a5
- x86_64 CORE: 9ca4f7a4a391a9af603a621b767fdc8bc9b9d96c5a5da920a43ceab894d2a929
- x86_64 ONNX Runtime: 398db8c38855e27b93cb9735597a83946ca38345c68ecc71db58b2b11f41bf1e

See docs/VOICEVOX.md, LICENSES.md, and app/src/main/assets/voicevox/manifest.json for versions, model metadata, provenance, and notices.

