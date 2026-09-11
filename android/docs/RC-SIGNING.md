# v0.8 RC packaging and signing

Package: `org.shinyakushin.study.next.v07.preview` (unchanged for the migration QA).
This build: `versionCode 8`, `versionName 0.8.0-rc1`.

## Why a persistent RC key exists

The GitHub runner generates a throwaway debug keystore for every job. Two real
runs produced two different certificates:

| run | commit | certificate SHA-256 | keystore generated |
| --- | --- | --- | --- |
| 34578326947 | `2d9355b` | `d4f292b1d73f1863b6179898fd531b06f8e80350e1cf0ae169368d9821e89800` | 08:18:39Z |
| 34582835422 | `bdf9735` | `499352fe77cdca433342986b5dbbc8cb6b4db134a721952fd4dc6415bdc400cb` | 09:13:03Z |

Android refuses an in-place update when the certificate changes
(`INSTALL_FAILED_UPDATE_INCOMPATIBLE`). A debug APK built by a *different* CI run
therefore cannot be installed over the user's existing preview app without
uninstalling it, which would destroy the saved state.

## Persistent preview/RC key

A single PKCS#12 keystore is now used for every build.

- alias: `shinyakushin-rc`
- certificate SHA-256: `082513b4015567c3db6d721f19d31de11a44edb5a19ee47de8b5e71e2b92ef6e`
- subject: `CN=Shin Yakushin Preview, OU=RC, O=Shin Yakushin, L=Tokyo, C=JP`
- validity: 10000 days from 2026-09-11

Key material and passwords are **not** in the repository. They live in GitHub
Actions secrets and are decoded into `$RUNNER_TEMP` for the duration of the job:

| secret | content |
| --- | --- |
| `RC_KEYSTORE_BASE64` | base64 of the PKCS#12 keystore |
| `RC_STORE_PASSWORD` | keystore password |
| `RC_KEY_ALIAS` | `shinyakushin-rc` |
| `RC_KEY_PASSWORD` | key password |

`app/build.gradle` reads `RC_KEYSTORE_FILE`, `RC_STORE_PASSWORD`, `RC_KEY_ALIAS`
and `RC_KEY_PASSWORD`. When all four are present the `rc` signing config is used
for both `debug` and `release`; otherwise the build falls back to the throwaway
debug key so forks and plain local builds still assemble. The certificate
fingerprint is pinned in the workflow (`EXPECTED_SIGNING_CERT_SHA256`) and
`tools/verify_apk.py` fails the build if the produced APK is not signed by it.

Keep an offline copy of the keystore: losing it means no future in-place update
for anyone who installed this key's APK.

## Compare the certificate before installing

Do this on every physical-device QA run, before any `adb install`.

```
tools/rc_signing_check.sh org.shinyakushin.study.next.v07.preview /path/to/app-debug.apk
```

The script is read-only: it runs `pm path`, pulls a copy of the installed APK and
prints both SHA-256 digests, then exits `0` (MATCH), `4` (MISMATCH) or
`2` (NOT VERIFIED). Manual equivalent:

```
adb shell pm path org.shinyakushin.study.next.v07.preview     # package:/data/app/.../base.apk
adb pull /data/app/.../base.apk installed.apk
apksigner verify --print-certs installed.apk
apksigner verify --print-certs app-debug.apk
keytool -printcert -jarfile app-debug.apk                     # v1 fallback
```

## If the certificates differ: STOP

Do **not** run `adb install`. Take a non-destructive backup first:

```
tools/backup_app_state.sh org.shinyakushin.study.next.v07.preview
```

It uses `run-as` (the preview APK is debuggable), reads the app directory and
writes `app-data.tar` plus explicit copies of `study.sqlite3`, its `-wal`/`-shm`,
`study.backup.json`, preserved `import-source-*.json` and the app's
`shared_prefs`. It never installs, uninstalls, force-stops, clears or deletes
anything on the device. Keep the printed `SHA256SUMS.txt` with the backup.

Only after the backup exists may you choose one of:

1. Install the RC APK on a clean device/second profile and restore the state via
   the app's own import screen (uses the app's staged validate/commit path).
2. If you accept losing the installed app slot, uninstall the old package and
   install the RC APK, then restore from the backup — the previous in-place
   option is gone once uninstalled.

## Restore (only with a matching certificate)

```
adb push study.sqlite3 /data/local/tmp/
adb shell run-as org.shinyakushin.study.next.v07.preview cp /data/local/tmp/study.sqlite3 files/study.sqlite3
```

Restore while the app is stopped. Prefer the in-app restore screen for a full
staged import; it keeps the pre-import original.

## NOT VERIFIED

The certificate of the app currently installed on the user's device has not been
read. In-place update safety is therefore **NOT VERIFIED** until
`tools/rc_signing_check.sh` reports MATCH on that device. Emulator CI installs
into a clean AVD, which is not evidence for the physical device.
