# v0.8 migration rehearsal (side-by-side)

Package: `org.shinyakushin.study.next.v08.migrationqa`
Build type: `migrationqa` (debuggable), `versionName 0.8.0-rc1-migrationqa`
Launcher name: `新躍進政策・移行QA`

The rehearsal exists so the saved state of the **currently installed** preview
app can be proven to migrate before that app is replaced. It is a different
applicationId, so it installs next to the existing app and never shares its data
directory. Nothing in this flow installs, uninstalls, force-stops, clears or
deletes anything on the device.

The preview/RC applicationId stays `org.shinyakushin.study.next.v07.preview`
(see `RC-SIGNING.md`); only the rehearsal build carries the QA id.

## Build the rehearsal APK

```
./gradlew assembleMigrationqa            # app/build/outputs/apk/migrationqa/app-migrationqa.apk
```

CI builds the same variant in the `build` job, verifies applicationId,
versionCode/versionName, ABI, secret scan and the pinned RC certificate, and
uploads it as `shin-yakushin-v08-migrationqa-debug` (evidence:
`APK-migrationqa-METADATA.json`). The `persistence` job then installs it on the
emulator **alongside** the preview APK and asserts both packages stay installed.

## 1. Take a read-only backup of the installed app

```
tools/backup_app_state.sh org.shinyakushin.study.next.v07.preview
```

Writes `app-data.tar`, `files_study.sqlite3` (+`-wal`/`-shm` when present),
`files_study.backup.json`, preserved `files_import-source-*.json`,
`shared_prefs/*` and `SHA256SUMS.txt`. The device is only read.

## 2. Turn the backup into an importable source

The rehearsal app accepts the raw `files_study.sqlite3`, the whole
`app-data.tar`, or a JSON snapshot. If you only have `app-data.tar`, convert it
first (the tool is read-only on the backup and prints an expected-values summary):

```
tools/prepare_migration_source.py <backup-dir-or-app-data.tar> -o migration-source.json
```

## 3. Import inside the rehearsal app

1. `adb push migration-source.json /sdcard/Download/` (or transfer any way you like).
2. Open `新躍進政策・移行QA` → menu → `（移行QA）バックアップを読み取り専用で検証`.
3. Pick the file. The app stages an immutable copy as `files/import-source-<ts>.json`
   inside **its own** data directory and shows the report.

The report is read-only by construction: it runs the production
`migrate()`/`validate()` path in memory and has no restore or commit action.

## 4. Read the report

| field | expected |
| --- | --- |
| 移行元 schemaVersion | `1` for the frozen v0.7 baseline, `2` for a v0.8-era install |
| このアプリの schemaVersion | `2` |
| StudySession | the same count as the source, per-session start/end/segments/seconds unchanged, `進行中 0` before a restore |
| 教材 / 目標 / タスク / 予定 | identical counts and titles/progress |
| 思い出 / 進捗履歴 | identical counts, text and timestamps |
| Reward / Bond | identical to the source (`metrics().reward`, `metrics().studyBond`) |
| DailyMode / 予算 | the saved `dailyMode` and `budgetMinutes` (defaults `NORMAL 90 / HOLIDAY 180 / FOCUS 60` when absent) |
| アプリ分類 | identical `ENTERTAINMENT`/`STUDY`/`NEUTRAL` classification counts |
| 週次集計 | day count from `lifeBalanceAnalytics` when present, otherwise `なし` |

Warnings are expected and safe: schema migration, LifeBalance defaults filled in,
completed optional fields, the v1 `notifications → false` downgrade, and an
active session. Any **失敗** line means the run is FAIL.

## 5. What a failure means

`MigrationSource.read()` only ever reads the picked file; a sqlite source is
copied into the app cache before it is opened, so no `-wal`/`-shm` sibling is
created next to the original. On any parse/migration failure the staged source
is left as-is, nothing is committed and the installed preview app is untouched.

## Certificate check before any in-place update

Run `tools/rc_signing_check.sh org.shinyakushin.study.next.v07.preview <apk>`
before installing the RC APK over the existing app. The rehearsal applicationId
is a separate package and is never part of that in-place decision.

## NOT VERIFIED

- The user's real saved state has not been imported or migrated on the physical device.
- The installed APK's signing certificate has not been read, so in-place update safety is NOT VERIFIED.
- Real UsageStats permission/data, actual WorkManager timing, real notification delivery, audible VOICEVOX and final visual QA remain NOT VERIFIED.

CI evidence (emulator install, launch, side-by-side package check, read-only
reader instrumentation) is not evidence for a physical device.

## Physical-device checklist

1. `tools/backup_app_state.sh org.shinyakushin.study.next.v07.preview` (keep `SHA256SUMS.txt`).
2. `tools/prepare_migration_source.py <backup>` and confirm the printed counts match the app.
3. Install the migration QA APK; confirm the launcher shows `新躍進政策・移行QA` next to the existing app.
4. Open the existing app and confirm it still starts with all records intact.
5. Import the source into the rehearsal app and read the report: PASS, no 失敗.
6. Re-open the rehearsal app: the report values and the staged `import-source-*.json` are still there.
7. Re-open the existing app once more and confirm nothing changed.
