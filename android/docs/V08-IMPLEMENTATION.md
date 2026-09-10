# Resume / acceptance contract

Working branch: android-v07-recovery. Product entry is Conversation. No 3D.
JDK17 / AGP8.7.3 / Gradle8.9 / SDK35 / BuildTools35.0.0 / NDK27.0.12077973 / CMake3.22.1.

## Verified v0.7 baseline

GitHub commit c91d083627852f522bce582d0bfc06ec98a30421.
Run https://github.com/juncarly-bot/shin-yakushin/actions/runs/34352910375
clean, assembleDebug, lintDebug, regression 80/80, artifact upload succeeded.
APK SHA256 adf219aa8faafa7ed65b54e1c585b2714ba313abbbccfbfa040d2577706b226c.
Artifact ID 10104591692, size 176071112 (ZIP), APK size 176374184.
Baseline metadata echoed applicationId; new CI verifies it from aapt, verifies signatures,
native ELF machines and bundled VVM/dictionary hashes, and scans each uncompressed entry.
Android audible SAYO / NurseT synthesis and playback: NOT VERIFIED.

## v0.8 work plan

1. UsageStatsManager repository: explicit optional usage settings permission, launchable
   apps + icons + editable ENTERTAINMENT/STUDY/NEUTRAL, local event aggregation.
2. Shared entertainment budget; NORMAL/HOLIDAY/FOCUS/UNLIMITED, default + dated overrides,
   rest day, study goal, optional explicit planned start, configurable study-use exclusion.
3. DailyUsageContext allowlist; read-only, relevant-only conversation context, local intents
   to change today's mode, LocalRules fallback. No installed list/raw events go to backend.
4. Context-aware coaching, intensity, cooldown, quiet hours, WorkManager periodic checks,
   private notification text, tap-to-timeline idempotence, return-to-study praise without rewards.
5. Daily and selected-period summary, weekly/previous-week comparison, distraction count,
   morning/afternoon/evening tendency, cautious multiweek correlations, experiment model.
6. Add behavior and boundary tests; CI clean/assemble/lint/regression/APK inspection; document
   device QA separately. Commit/push every meaningful checkpoint before continuing.

StateStore/StudySession/Reward/Bond/Memory contracts remain authoritative and backward compatible.
Usage uses bounded local aggregates; no Accessibility/VPN/foreground service. Missing usage,
notifications, network or voice must never stop Study. Render endpoint stays configured;
no unverified Cloudflare switch, no client OpenAI key. Remote changes dialogue only.
The user authorizes implementation, test, commit, push. Stop for actual costs, destructive
data or installed-app operations, required secret values/account changes, unknown binaries,
security-sensitive decisions, or device permission operations that require the user.
Never mark device playback verified based on CI, code inspection, or emulator presence alone.
