# QA report — v0.7 Remote AI

Date: 2026-09-09

## Automated regression

- 80/80 tests: PASS
- Existing Study / Break / Previous Study / Progress / Review / Conversation continuity / Memory / Reward / Bond / backup contracts: PASS
- Remote provider native-bridge request and validated response: PASS (mock backend)
- Missing backend / missing server secret: LocalRules fallback path preserved
- Stale remote response after a newer user message: rejected
- Remote response changes dialogue only: StudySession / Reward / Bond / Memory unchanged
- Backend `store: false`: asserted
- Cloudflare Worker contract and missing-secret fallback: PASS (mock OpenAI response)
- Runtime public Backend URL validation and native persistence boundary: source regression PASS
- Android source secret scan: no `OPENAI_API_KEY`, OpenAI API host, bearer header, or key-like literal
- WebView CSP remains `connect-src 'none'`
- Java syntax parse: PASS
- VOICEVOX VVM metadata, Open JTalk dictionary and native-library SHA-256 checks: PASS locally

## Not verified

- Android compile / lint: BLOCKED by missing Android toolchain (Gradle 8.9, SDK 35, Build-tools 35.0.0, CMake 3.22.1, compatible NDK)
- APK install / launch / device runtime: NOT VERIFIED
- Real Backend → OpenAI call: NOT VERIFIED because no secret was requested or configured
- Real Android HTTPS call: NOT VERIFIED
- Remote text → Android VOICEVOX playback: NOT VERIFIED
- Visual QA after remote settings row: NOT VISUALLY VERIFIED on Android

The default backend URL is the verified public Render endpoint `https://shin-yakushin.onrender.com/v1/reactions`. Remote AI remains opt-in; failure or timeout falls back to LocalRules. No API key is present in Android source or artifacts. Android install, playback and visual QA remain NOT VERIFIED.

