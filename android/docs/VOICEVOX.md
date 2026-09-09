# VOICEVOX integration — v0.3 implementation checkpoint

**Native implementation is UNCOMPILED / synthesis and playback NOT VERIFIED. No native libraries, VVMs or dictionary have been downloaded in this workspace.**

## Architecture

StudyApplication commits Study/Memory first. ReactionDirector selects one Speaker (SAYO / NurseT / None), invokes existing LocalRulesProvider or NurseT templates, and persists text. UI submits eligible speech only after successful persistence. VoiceController runs synthesis on one worker, then MediaPlayer.prepareAsync on the main handler. Voice failure cannot roll back the Study commit.

VoiceProvider has VoicevoxProvider and NoVoiceProvider. JNI calls the CORE C API: ONNX load_once → OpenJtalkRc → Synthesizer (CPU, 2 threads) → load model → tts → WAV. The C API owns/releases native memory. CORE version is checked at initialization. Models are loaded lazily by speaker. VVM metadata is checked against character and style IDs before synthesis. Runtime uses normal styles only; NurseT's other styles are validated for future use.

One running synthesis + at most one pending request. A newer request supersedes stale audio; a lower priority pending request cannot replace a higher priority one. Cancel/background invalidates tokens and stops playback. An already-running native synthesis is allowed to finish and its output is discarded. No unbounded queue or background speech. On init/model failure, this Activity uses NoVoiceProvider until relaunch; text continues.

Audio cache: provider/version/style/text hash; volume applied at playback. SHA-256 sidecar validates cache bytes; invalid entries regenerate. Maximum 64 entries / approximately 64MiB. All deletions are exclusively generated voice cache, never Study data. Native queue/cache lifecycle still needs runtime QA.

## Official dependencies verified via documentation

- CORE 0.17.0 Android arm64: https://github.com/VOICEVOX/voicevox_core/releases/tag/0.17.0
- ONNX Runtime 1.23.2 Android arm64: https://github.com/VOICEVOX/onnxruntime-builder/releases/tag/voicevox_onnxruntime-1.23.2
- VVM 0.17.0: https://github.com/VOICEVOX/voicevox_vvm/releases/tag/0.17.0
- Mapping: https://github.com/VOICEVOX/voicevox_vvm
- C API reference: https://voicevox.github.io/voicevox_core/apis/c_api/voicevox__core_8h.html
- Open JTalk UTF-8 dictionary 1.11: https://open-jtalk.sourceforge.net/

|VVM|Character|style|
|---|---|---|
|15.vvm|小夜/SAYO|46 ノーマル|
|11.vvm|ナースロボ＿タイプＴ|47 ノーマル / 48 楽々 / 49 恐怖 / 50 内緒話|

These mappings are confirmed in official documentation, **not yet in downloaded VVM bytes**. Both VVMs include additional characters; no other character is selected by this app.

## Staging after download permission

Place official files in these locations without modifying existing Study data:

- app/src/main/voicevox/include/voicevox_core.h (official Android 0.17.0 header)
- app/src/main/jniLibs/arm64-v8a/libvoicevox_core.so
- app/src/main/jniLibs/arm64-v8a/libvoicevox_onnxruntime.so (retain any required SONAME companion/dependencies from the release; inspect with readelf)
- app/src/main/assets/voicevox/{11.vvm,15.vvm}
- app/src/main/assets/voicevox/dict/ (contents of open_jtalk_dic_utf_8-1.11)
- app/src/main/assets/voicevox/licenses/{core,onnxruntime,open-jtalk,vvm,sayo,nurse-t}/ (full official notices/terms, including bundled transitive dependency notices)

Run `python3 tools/verify_voice_bundle.py`. It checks VVM metadata, required files and generates manifest hashes for runtime verification/copy. Hashes generated locally check subsequent corruption; they are not independent proof of download authenticity. Record official download source and any release-provided digest separately.

APK assets are copied to a versioned app-private directory on the voice worker using temporary AtomicFile writes and digest validation; interrupted copy resumes file-by-file. No network download occurs inside the app. Native libs use extracted packaging for dlopen. CMake JNI requests 16KB alignment; prebuilt libs must also be checked. Download binaries are intentionally absent until access and full notice collection succeed.

## Required QA

Build arm64 APK with SDK35, Gradle8.9, JDK17, CMake3.22.1 and Android NDK. Run assembleDebug/lintDebug. Fixed Japanese phrases for both speakers, dynamic text, airplane-mode synthesis, cache corruption, missing model, rapid supersede/cancel, Quiet Hours, volume zero, background/lock/process kill and audio focus loss must all be tested. No audio or visual PASS is claimed here.

Future DialogueProvider/FallbackDialogueProvider/ContextAssembler are source interfaces only. No remote communication or API key is implemented. Provider output is limited to text/intent; StudySession remains authoritative. A future adapter must validate remote output before playback.
