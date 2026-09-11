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
  real database. Ten checks cover fresh open, an abandoned empty database
  reopening as fresh, old schema-2 restart, unknown fields, invalid payload with
  a stale backup, corrupt database preservation, pre-migration snapshot, invalid
  commit, read-only backup selection and denied Usage access.
- `.github/workflows/android-v08.yml` compiles and runs that runner on a newly
  created official Android 35 emulator. Check the actual CI log for its result.
  A successful APK build alone is not a native persistence test pass.

## Verified CI reproduction and fix (2026-09-11)

Run `34573328478` on commit `c7c58e8568b3dd82b34d039fde93e50bab0a884c` is the
first fully green v0.8 device-QA run:

- `build` succeeded: clean, assembleDebug, lintDebug, 101/101 regressions,
  APK metadata + secret scan (`secretScan: NONE`) and artifact upload. APK
  SHA-256 `a1e047ab8247a4b5932d1cd4c42ada0a30a16ff0823c3be281d900a95593eb27`,
  176389416 bytes, ABIs arm64-v8a + x86_64, v2 signature verified.
- `persistence` booted the official Android 35 image with KVM in ~66s,
  installed the freshly built APKs and ran `PersistenceQa` 10/10, then
  `check_emulator_startup.py`: `APP_STARTUP: PASS` and
  `APP_RESTART_WITHOUT_CLEARING_DATA: PASS`, both with the app process alive
  and no app-scoped `FATAL EXCEPTION`.

Three CI defects were fixed to reach that state, none of which touched the
v0.7 baseline or any device data:

1. The emulator silently fell back to TCG software emulation because the
   hosted runner user was not in the `kvm` group, so an Android 35 image never
   reached `sys.boot_completed`. The workflow now grants `/dev/kvm` access to
   the runner, requires `-accel on`, bounds the boot wait and prints
   adb/ps/free/df plus the emulator log on failure instead of exiting silently.
2. `testInstrumentationRunner` (`DeviceQa`) overrode the androidTest manifest's
   `PersistenceQa` during manifest merge, so the installed test APK never
   registered the runner and `am instrument` failed. The DSL now names
   `PersistenceQa` and the workflow asserts the runner is registered.
3. The startup smoke check reproduced the reported saved-state screen on a
   clean install with `STORE-MISSING_ROW-IOException`. `open()` creates
   `study.sqlite3` as a side effect, so an earlier aborted open (a receiver that
   read nothing and returned) left an empty database; the next open treated the
   existing file with no row as lost user data and refused to start. An empty
   `state` table with no backup holds no user data, so it now starts fresh while
   leaving the file untouched. A backup without a row still fails with
   MISSING_ROW.

`check_emulator_startup.py` treats `am start -W`'s `Status: timeout` as
advisory: a cold WebView start on the software GPU exceeds the `-W` draw
window. UI visibility, process liveness and app-scoped crash-clean logcat are
the acceptance gate.

Reopening the user's actual device state remains NOT VERIFIED. The row-less
database class of failure is fixed and regression-tested, but it is not proof
that the device record is schema-incompatible for a different reason.
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

Correction after run 34536417003: the emulator raises first-boot data partitions
to at least 6 GiB for API >=24, so the 2G setting did not take effect. It was
removed. Persistence now runs in a separate fresh hosted job that downloads the
already-built application and instrumentation APKs; this avoids sharing scarce
disk with the full NDK/Gradle/VOICEVOX build environment. No cache or existing
data deletion is used. Source: Android QEMU `android-qemu2-glue/main.cpp`,
`kMinPlaystoreImageSize` and `myApiLevel >= 24` branch.

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
