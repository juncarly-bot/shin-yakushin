# QA v0.3 — 2026-09-05

FINAL VERDICT: **NOT READY**

QA-3.mdを読了し、既存25件のPASS範囲とAndroid未検証を確認して継続。StudySession、Reward、Bondの正本構造を維持。3Dは対象外でFAILではない。

## Executed

- Automated regression: **32/32 PASS** (docs/evidence/regression-v03.txt).
- Existing 25 tests all retained and PASS. New 7: backwards-compatible voice settings validation, Quiet Hours, single speaker/Nurse template rotation, speech suppression, previous material, detached AI context, remote error/timeout fallback.
- Java syntax: PASS, Android type/link compile NOT VERIFIED.
- UI JavaScript syntax: PASS, visual rendering NOT VERIFIED.
- Build preflight: BLOCKED, missing SDK/Gradle/NDK/CMake and native voice payload.
- SDK connection attempt: network approval cancelled before decision. No toolchain download performed.

## Status

|Area|Result|
|---|---|
|Study / Free / Daily Plan / Pause / Resume / Break / Finish|Domain PASS; Android NOT VERIFIED|
|Previous Study / optional Progress|Logic implemented; previous lookup tested; UI NOT VERIFIED|
|Review / Reward / Relationship / Memory / Classification|Existing regression PASS|
|Persistence / Backup / Restore / Migration|Application fake-store contract PASS; real Android NOT VERIFIED|
|Corruption Recovery / Restart|Native implementation remains NOT VERIFIED|
|Duplicate Session / Reward / Bond|NONE in regression|
|CORE 0.17.0 / ONNX1.23.2 / Open JTalk|Integration source only; binaries absent|
|VVM15 / style46; VVM11 / styles47–50|Official mapping checked; actual metadata pending|
|SAYO synthesis / NurseT synthesis / playback / offline|NOT VERIFIED|
|Voice fallback / queue / cache / background|Java implementation, NOT RUNTIME VERIFIED|
|SpeakerSelector / Quiet Hours / templates|Node PASS|
|Android Install / Launch / Offline / Background / Notification|NOT VERIFIED|
|Visual QA|NOT VISUALLY VERIFIED|
|Android runtime errors|Unknown; no Android execution|
|C++ compile / Android compile|Not executed|
|API Key hardcoded|NO; Remote API not implemented|

## Fixes during regression

The first new previous-study test omitted the required sessionId; corrected the test input, without weakening Domain validation. Re-ran all 32 tests successfully. Voice model hashing uses streaming reads to avoid loading full VVMs only to hash them. Voice settings cancel pending audio. Old settings retain optional voice fields when other settings change.

## Concrete outstanding completion gates

1. Obtain SDK/Gradle/NDK/CMake and official voice files after network access is approved.
2. Inspect actual metadata, native ABI/SONAME/16KB alignment and all dependency license notices; package assets.
3. assembleDebug and lintDebug; fix first real compile/link errors and generate APK/hash.
4. Android install/run Study flow, background/lock/process kill/restart and durable save/restore/corruption recovery using synthetic isolated data.
5. Both speakers' fixed and dynamic synthesis/playback, offline and failure/queue/cache lifecycle QA.
6. Visual/touch/keyboard/large-font QA and fixes.

The existing smartphone application and user data have not been accessed or modified.
