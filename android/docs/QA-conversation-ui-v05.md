# Conversation UI + Character Identity QA — v0.5 source

Date: 2026-09-06  
Verdict: **NOT READY**

## Product result

The daily doorway is now a shared chronological conversation among the user, SAYO, and Nurse Robo Type T. User messages sit on the right; character messages sit on the left with an original, distinct avatar, speaker name, time, bubble, and per-message voice replay. Study completion is a referenced event in the same timeline. The event stores only the session ID; title, duration, material, task, and progress are derived from authoritative domain data.

Before, the screen visually read as a two-party SAYO chat and a single reaction was the only voice request. After, the header and timeline identify both companions. ConversationOrchestrator chooses SAYO_ONLY, T_ONLY, SAYO_THEN_T, or a bounded short group exchange. Ordinary chat remains SAYO-first. NurseT joins only for relevant care, break/review, or a long Study. The two do not repeat the same line.

The attached messaging reference influenced chronology, avatar/speaker identification, and the simple composer only. Its navigation, brand, colors, dimensions, icons, and proprietary artwork were not copied. The supplied character illustration was not embedded because reusable rights were not established. The UI and launcher icon use original abstract SAYO/T marks.

## Regression evidence

- Automated Node regression: **60/60 PASS**
- Preserved baseline: **53/53 PASS**
- New: orchestrator participation, severe-fatigue two-speaker exchange, 2-hour three-message exchange, NurseT break ownership, voice queue bound, adaptive icon, and two-avatar UI
- StudySession duplication: **NONE in tests**
- Reward duplication: **NONE in preserved tests**
- Study Bond duplication: **NONE in preserved tests**
- Evidence: docs/evidence/regression-conversation-ui.txt

## Voice

Text reaction is committed before voice. The UI builds a maximum four-message character batch. Native VoiceController cancels stale work on a new user message, synthesizes and plays one item at a time, waits for completion, and inserts a short 280 ms gap. Per-message replay cancels the old queue. Existing cache checksum validation, Quiet Hours, per-speaker enablement, retry, and text fallback remain.

Android VOICEVOX synthesis/playback: **NOT VERIFIED in this environment**. No adb, emulator, Android SDK, Gradle, NDK, or CMake is installed. Linux WAV evidence from v0.4 is not treated as Android evidence.

## UI and lifecycle QA

Source checks confirm 48 px controls, a 380 px narrow fallback, flexible bubble widths, long-text wrapping, dark mode, adjustResize, safe system insets, bounded 1000-message persistence, and 100-message paging.

Actual Android visual/touch/IME QA at 360–412 dp, 200% font, dark mode, long Japanese, system bars, Android Back, rotation, screen lock, process kill, offline use, and audio playback: **NOT VISUALLY VERIFIED**. No screenshot-based PASS is claimed.

## Usability paths

- Conversation: default launch target, 0 extra taps after app open
- Home → previous Study: 1 tap
- Home → Free Study: 1 tap
- Conversation suggestion → linked Study: 1 tap
- Finish → conversation: 1 tap

## Remaining blockers

1. Official Android toolchain is unavailable, so current-source assembleDebug and lintDebug were not run.
2. No current-source v0.5 APK exists.
3. Android install/launch, lifecycle, visual, notification, and VOICEVOX synthesis/playback require an emulator or isolated device.

