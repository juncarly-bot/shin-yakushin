# QA v0.4 Conversation Continuity — 2026-09-06

## Verdict

**NOT READY**

Product logic, real VOICEVOX payloads, an APK artifact, and offline Linux synthesis evidence are present. This execution environment no longer contains the Android SDK, adb, or an emulator. Its approval policy rejected the authorized official download request before networking began. Install, Android playback, lifecycle, and visual QA therefore remain **NOT VERIFIED**.

## Regression

- Node regression: **48/48 PASS** (`docs/evidence/regression-v04-conversation.txt`).
- Previous 39 cases retained. Nine acceptance/UX cases cover continuation phrases, safe ambiguity, recall relevance/budget/novelty, emotional transitions, speaker continuity/profile sharing, the Study bridge, one-tap Home actions, finish progress actions, and minimum touch/layout rules.
- Source of truth: one StudySession stayed present through conversation start → break → resume → finish → progress → review. Reward and Study Bond did not change during progress or review.
- UI JavaScript syntax: PASS.
- Voice bundle metadata and presence: PASS.

## Conversation / UX acceptance

| Scenario | Result | Evidence |
|---|---|---|
| A: previous Material and Task context | PASS (logic) | persisted conversation and recent sessions resolve to the same entity |
| A: Home one-tap continuation | PASS (static interaction contract) | one `data-study` action; label `続きを勉強` |
| B: 「続き」「昨日の続き」「さっきのやつ」「前と同じ」 | PASS | direct tests |
| B: 「また電磁気やる」 | PASS | direct test |
| B: ambiguous recent candidates | PASS | asks a short choice and does not start |
| C: relevant Memory only | PASS | related ID/topic scoring; unrelated Memory excluded |
| C: recall cooldown/budget/novelty | PASS | 24-hour cooldown, three-reaction budget, repeated-use penalty |
| D: focused → pleased → proud | PASS | state transition test; persists across normal turn |
| E: conversation → Study → Break → Resume → Finish → Progress → Review | PASS (application) | same session ID; no duplicate reward/bond |
| Android screen transitions | NOT VERIFIED | no booted Android runtime |

Conversation turns are bounded to six and expire after one day. Topic/entity context expires after seven inactive days. Important Study history, Relationship, and Memory remain long-term domain data. Automatic Memory remains bounded separately.

## APK and native inspection

- APK ZIP integrity: PASS.
- APK v2 signature: content digest, RSA signature, embedded certificate, and public key: PASS by `tools/repackage_v2.py`.
- ARM64/x86_64 JNI `DT_NEEDED`: `libvoicevox_core.so`; no build-machine absolute path: PASS.
- Every packaged native library LOAD alignment: `0x4000` (16 KiB): PASS.
- Official voice payload checksums/metadata: PASS.
- Android package manager signature acceptance: **NOT VERIFIED** without adb/device.
- The APK was reproducibly repaired from the earlier Gradle-generated preview APK because the current environment blocked reacquiring the official SDK. The current strengthened Java `ConversationState` validator is in Source but could not be recompiled into this fallback APK. JS validation and state behavior are included.

## Voice

| Check | Result |
|---|---|
| CORE 0.17.0 / ONNX Runtime 1.23.2 / Open JTalk dictionary | bundled and checksum recorded |
| SAYO VVM 15 / style 46 metadata | PASS |
| NurseT VVM 11 / styles 47–50 metadata | PASS |
| SAYO real synthesis on official Linux CORE | PASS, 142,380-byte WAV |
| NurseT real synthesis on official Linux CORE | PASS, 128,044-byte WAV |
| Android native synthesis | NOT VERIFIED |
| Android MediaPlayer completion | NOT VERIFIED |
| Offline Android synthesis | NOT VERIFIED |
| model/init failure text fallback | application/JNI path implemented; Android runtime NOT VERIFIED |
| queue, priority, cancel/supersede, cache, Quiet Hours | code/regression coverage where platform-independent; Android lifecycle NOT VERIFIED |

## Android / visual / lifecycle

Install, launch, Home, Study screen, break notification, process kill/relaunch, persistence, Android backup/restore/corruption recovery, audio playback, 360–412 dp screenshots, IME, 200% font, dark mode, status/navigation bars, and touch behavior are **NOT VISUALLY OR RUNTIME VERIFIED**. Source-level responsive rules include 48 px controls, 360 px quick-action fallback, dynamic-height dialogs, word wrapping, dark mode, safe-area navigation padding, and no INTERNET permission.

## Data safety

Existing smartphone applications and user data were not accessed, overwritten, uninstalled, or cleared. Tests used in-memory or isolated synthetic data. No destructive migration was performed. The preview application ID remains separate.

## Remaining completion gates

1. Install the signed APK on an isolated emulator/device and confirm Android accepts the signature.
2. Run both speakers through JNI synthesis and MediaPlayer while offline.
3. Exercise background, screen lock, process kill, relaunch, notification, persistence, backup/restore, and corruption recovery on Android.
4. Perform and capture the required visual/IME/large-font QA; fix any device-specific defects.
5. Rebuild the complete current Source with official Gradle/SDK so the strengthened native conversation validator is included, then rerun lint and device tests.
