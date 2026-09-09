# Speaker icon QA — v0.6 source

Date: 2026-09-07

- SAYO maps to the supplied pink circular SAYO icon.
- NurseT maps to the supplied blue circular Nurse Robo Type T icon.
- USER renders as a right-aligned bubble with no avatar element and no reserved avatar column.
- Visual speaker labels are 小夜 and T. Full character names remain available in accessible labels.
- The supplied image bytes are preserved exactly; SHA-256 is 03034a4a769df7fe529d54ad4f561e4366d1cb785394596d886b8084b000287a.
- WebView serves the local image with image/png and performs no network request.
- Automated regression: 65/65 PASS.
- Android resource XML: PASS.
- Pixel crop inspection: PASS for both supplied character regions.
- Android build and device visual QA: BLOCKED because Gradle, Android SDK, NDK and CMake are unavailable in this environment.

StudySession, Reward, Study Bond, conversation depth, VOICEVOX queue, Memory and persistence were not changed.
