# Android recovery checkpoint

Working branch: `android-v07-recovery`, Android project directory: `android/`.
Existing root backend tree is preserved from f187ef349bf1ac88061d12806c00762bdb1e9e66.
The archived `android/backend/` is the v0.7 regression fixture; production backend remains at the root.

Verified endpoint: https://shin-yakushin.onrender.com/v1/reactions (Render).
Remote AI remains opt-in. No OpenAI key is stored in Android.
Native connect/read deadlines: 8/65 seconds; JS deadline: 75 seconds.
An 8-second notice explains connection startup; local response remains committed.
New user input cancels voice and remote requests. Remote output changes dialogue only.

Recovery commits contain original source, tests, avatar and notices.
Two full Wix webpage captures (SAYO guideline HTML and NurseT rules HTML) were
blocked by automatic approval review for unverified licensing/remote tracking content.
They are not required to execute the application; existing textual credits remain.
Do not claim the archived native bundle is present: VVM, dictionary and native libraries
were excluded from the original lightweight v0.7 archive and still require restoration.

QA: original 77 tests PASS; three new transport cancellation/timeout/malformed-output
tests added. Android compile, clean, assembleDebug, lintDebug, device install, visual QA
and audible Android VOICEVOX playback are NOT VERIFIED.
Build prerequisite check reports missing Gradle 8.9, SDK 35, Build Tools 35.0.0,
CMake 3.22.1, NDK 27.0.12077973 and VOICEVOX native libraries.
Official Google SDK network request was cancelled before an approval decision.
No APK exists and no APK SHA-256 is claimed.
Application ID remains org.shinyakushin.study.next.v07.preview.
Before device installation, check existing packages; never overwrite an installed package.
