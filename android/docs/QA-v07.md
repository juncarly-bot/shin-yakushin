# QA report — v0.7 Remote AI

Date: 2026-09-07

## Automated regression

- 77/77 tests: PASS
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

## Not verified

- Android compile / lint: BLOCKED by missing Android toolchain
- APK install / launch / device runtime: NOT VERIFIED
- Real Backend → OpenAI call: NOT VERIFIED because no secret was requested or configured
- Real Android HTTPS call: NOT VERIFIED
- Remote text → Android VOICEVOX playback: NOT VERIFIED
- Visual QA after remote settings row: NOT VISUALLY VERIFIED on Android

The default backend URL is empty and Remote AI is OFF. Therefore an unconfigured build behaves exactly as the offline LocalRules application. Enabling the feature requires both a deployment resource overlay containing the public HTTPS backend URL and explicit user opt-in in Settings.
