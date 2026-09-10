# Device saved-state loading incident

The user reported the native startup screen "記録を開けませんでした" with
"保存データを開けません。元データを保持しています。". No device data has been
obtained, erased, reset, or replaced in this investigation. The device root cause
is **NOT YET VERIFIED**. Do not call the compatibility changes a confirmed device fix.

## Evidence and limits

- The message originates in `StateStore` before WebView, Remote AI and voice startup.
- Storage is the `state` row of internal `study.sqlite3`, not browser localStorage.
- Native schema version is 2. Missing `settings.lifeBalance` is already accepted
  by the native validator and therefore does not alone explain this native error.
- The former generic catch hid open/read/validation failures and could replace a
  readable but validation-rejected record with an older backup. Recovery now only
  considers explicit SQLite corruption; other failures leave the payload in place.
- Failure screens include `STORE-<stage>-<exception class>`, without saved text.
  Stages are OPEN, SYNC, INTEGRITY, TABLE, READ, VALIDATE and MISSING_ROW.
- JS loading validates a detached migrated candidate and timeline before publishing
  state. Missing LifeBalance defaults are in memory; loading does not commit them.
- The first later successful save that adds LifeBalance preserves the prior raw
  payload in `before-life-balance-r<revision>.json` before the SQL transaction.
- Backup candidate reading does not call `AtomicFile.openRead/readFully`, because
  those methods can rename/delete files while reading. `.bak`, base and `.new`
  remain untouched during candidate inspection. A `.new` is never treated as a
  committed backup.

## Verification

- Node regression: 101/101, including six compatibility/failure-injection tests.
  These test the JS/native boundary, **not Android SQLite**.
- `PersistenceQa` is a separate Android instrumentation runner. Its generated
  data lives only in uniquely named cache directories; it never opens the user's
  real database. Eight checks cover fresh open, old schema-2 restart, unknown
  fields, invalid payload with a stale backup, corrupt database preservation,
  pre-migration snapshot, invalid commit and read-only backup selection.
- `.github/workflows/android-v08.yml` compiles and runs that runner on a newly
  created official Android 35 emulator. Check the actual CI log for its result.
  A successful APK build alone is not a native persistence test pass.
- Checkpoint `e7e664dae46fa9a9e38a6e93513c4b0a1eb2ac0b` build run 34496787688
  succeeded: clean, assembleDebug, lintDebug, 101 regressions, APK scan and upload.
  APK SHA-256: `4dbd4b36fb90b348fe922e528b10c40841dcad21b6e0e3abe9737b055bdcf2df`.
  Artifact 10160254119. This is the earlier diagnostic checkpoint, before the
  read-only AtomicFile candidate correction and native emulator gate.

## Resume safely

Run 34497135550 (0bf080e) reached instrumentation APK compilation, then timed out
waiting 600 seconds for the emulator to boot. No persistence checks executed.
Its evidence artifact is 10160938960. The next CI revision prints emulator
startup logs and checks process liveness rather than hiding an early crash until
the boot timeout. This is a CI environment failure, not evidence of a device
storage root cause.

Run 34499240196 exposed the first emulator error: `Unknown AVD name
[persistence-ci]`, with no `persistence-ci.ini` in the emulator's search directory.
The workflow now sets both ANDROID_USER_HOME and ANDROID_AVD_HOME to the same
runner-temporary location for avdmanager and emulator and verifies discovery
before boot. No SDK/AGP upgrade or device-data changes are involved.

Run 34535836991 found the AVD successfully, then reported insufficient disk for
its default userdata partition (needed 7372.80 MB, available 5366.18 MB).
The newly created CI-only AVD now uses a 2G data partition. No existing data or
runner directories are deleted to make space.

1. Check latest `android-v08-life-balance` head and its CI, including native QA.
2. If native QA fails, inspect the first failure and nested cause in its log.
3. If it passes, obtain the installed APK identity and device diagnostic stage.
   Do not infer device data corruption or create an empty replacement state.
4. Before proposing an in-place device APK update, verify signing compatibility.
   CI currently uses default debug signing, and per-APK signature validity does
   not establish that two APKs have the same signer. Do not resolve a signing
   mismatch by uninstalling, clearing data or silently changing signing keys.
5. Keep baseline branch at ac22f898ae85166e94b11bc05698729ecbc7d661 and artifact
   10148421829 untouched. Do not change VOICEVOX JNI/native/audio/style mapping.

Device reopening of the user's actual saved state remains NOT VERIFIED.
