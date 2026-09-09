# Conversation-first implementation — 2026-09-06

Verdict: NOT READY. This is source development, not a verified Android release.

## Product difference and before / after

Before: Home dashboard, six temporary turns, command-oriented fallback, no persistent Study events in conversation.
After: initial Conversation screen, left/right chronological messages with speaker and dates, persistent bounded history (1000 messages, 100 rendered per page), inline linked Study start, referenced Study completion cards, optional voice replay, one-tap Home/Conversation navigation. No LINE logos, colors, icons or proprietary assets were copied.

The v0.4 source archive was recovered into a separate workspace. Existing source and user data were not overwritten. Existing 48 regressions were kept. Five new tests cover daily conversation/restart, safe study suggestion, idempotent Study event references, corrupt message import rejection, and chat budget isolation.

## Architecture

`timeline.js` is an Application presentation-history layer. Study events store sessionId only; duration/title remain derived from StudySession. Ordinary chat never creates Reward or Bond. ConversationState and bounded important Memory remain separate from the display timeline. Existing legacy conversation command behavior remains testable; the new chat route proposes Study rather than immediately starting a timer.

Basic daily Japanese (ただいま, 疲れた, greetings, thanks, a material + 進めたい) uses local rules with rotating responses. This is not general Japanese semantic understanding or a remote AI. Unsupported phrases receive a conversational clarification; free-form understanding remains limited.

Existing Memory relevance/cooldown/budget remains intact. SAYO is primary for ordinary chat. Existing NurseT break/review routes remain. Concern persists after a fatigue message. Voice replay observes voice enablement, per-speaker settings and Quiet Hours.

## Voice blocking bug

Android silence is NOT FIXED/VERIFIED. No connected device, adb or emulator was available. Official SDK access returned `network approval was cancelled before a decision was returned`. Source changes add initialization failure logging (StudyVoice), a 30-second retry boundary instead of permanent NoVoice until restart, preparation/completion status, and USAGE_MEDIA playback. These are plausible reliability improvements, not proof of the reported cause.

Linux WAV evidence inherited from v0.4 does not establish Android synthesis or playback. SAYO and NurseT Android fixed/dynamic/offline synthesis and playback remain NOT VERIFIED.

## Build / QA

New APK: NOT GENERATED. Expected path after official build: app/build/outputs/apk/debug/app-debug.apk.
Missing: Gradle 8.9, Android platform/build-tools35, NDK27, CMake3.22.1, adb/emulator. Do not repackage the previous APK as a substitute: MainActivity must allow timeline.js and native VoiceController changes require Java compilation.

UI syntax and Node tests executed; see evidence/regression-conversation-first.txt.
Visual: NOT VISUALLY VERIFIED. 360–412dp, 200% fonts, IME/composer, Back, dark mode, rotation, long history, process restart, screen lock, Android offline, touch targets and voice playback require actual device QA. CSS alone is not PASS.

Known limitations: the composer uses sticky positioning pending IME QA; the last 1000 chat messages are retained (Study and important Memory never pruned by this limit); no arbitrary natural-language understanding; no Android runtime evidence; no new APK; native message-specific validation is not yet added (JS import/load/command validation is present).

## Next steps

Build complete Source with official SDK, run lintDebug, install only on an isolated package/device, collect StudyVoice logcat while replaying SAYO/NurseT, fix actual first failure, run lifecycle/storage tests, then screenshot and operate every required UI condition. The previous debug APK is not this source revision.
