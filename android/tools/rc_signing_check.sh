#!/usr/bin/env bash
# Compare the signing certificate of an RC APK against the APK currently
# installed on a physical device.
#
# READ-ONLY: this script never installs, uninstalls, force-stops, clears data or
# writes to the device. It only reads `pm path`, pulls a copy of the installed
# APK and prints certificate digests.
#
# Usage:
#   tools/rc_signing_check.sh [package] [rc-apk]
# Env:
#   ADB_SERIAL   target a specific device
#   ANDROID_HOME / ANDROID_SDK_ROOT   to locate apksigner
set -uo pipefail

PACKAGE="${1:-org.shinyakushin.study.next.v07.preview}"
RC_APK="${2:-}"
SERIAL="${ADB_SERIAL:-}"

if ! command -v adb >/dev/null 2>&1; then
  echo "ERROR: adb was not found on PATH. Install the Android platform-tools first." >&2
  exit 5
fi

adb_cmd() { if [ -n "$SERIAL" ]; then adb -s "$SERIAL" "$@"; else adb "$@"; fi; }

find_apksigner() {
  if command -v apksigner >/dev/null 2>&1; then command -v apksigner; return; fi
  local sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-/usr/local/lib/android/sdk}}"
  ls "$sdk"/build-tools/*/apksigner 2>/dev/null | sort -V | tail -1
}

APKSIGNER="$(find_apksigner)"

cert_of() { # $1 = apk file
  local f="$1"
  if [ -n "$APKSIGNER" ] && [ -x "$APKSIGNER" ]; then
    "$APKSIGNER" verify --print-certs "$f" 2>/dev/null | sed -n 's/.*Signer #1 certificate SHA-256 digest: *//p' | head -1 | tr 'A-F' 'a-f'
    return
  fi
  # Fallback for v1-signed APKs when the SDK is unavailable.
  keytool -printcert -jarfile "$f" 2>/dev/null | sed -n 's/.*SHA256: *//p' | head -1 | tr -d ':' | tr 'A-F' 'a-f'
}

echo "package : $PACKAGE"
device_paths="$(adb_cmd shell pm path "$PACKAGE" 2>/dev/null | tr -d '\r' | sed -n 's/^package://p')"
if [ -z "$device_paths" ]; then
  echo "INSTALLED: no (package is not installed on this device)"
  exit 3
fi

work="$(mktemp -d)"
trap 'echo "(temporary copies left in $work)"' EXIT
device_cert=""
while IFS= read -r path; do
  [ -z "$path" ] && continue
  name="$(basename "$path")"
  if adb_cmd pull "$path" "$work/$name" >/dev/null 2>&1; then
    c="$(cert_of "$work/$name")"
    echo "device apk: $path"
    echo "device cert: ${c:-<could not read certificate>}"
    case "$name" in base.apk) device_cert="$c";; esac
    [ -z "$device_cert" ] && device_cert="$c"
  else
    echo "device apk: $path (pull blocked on this device)"
  fi
done <<< "$device_paths"

if [ -z "$device_cert" ]; then
  echo
  echo "RESULT: NOT VERIFIED - could not read the installed APK. Do not install."
  echo "Fallback: submit install with 'adb install -r', which refuses with"
  echo "INSTALL_FAILED_UPDATE_INCOMPATIBLE and leaves data untouched on mismatch."
  exit 2
fi

if [ -z "$RC_APK" ]; then
  echo
  echo "RC apk not supplied; run again as: $0 '$PACKAGE' /path/to/app-debug.apk"
  exit 0
fi

rc_cert="$(cert_of "$RC_APK")"
echo "rc apk     : $RC_APK"
echo "rc cert    : ${rc_cert:-<could not read certificate>}"

if [ -z "$rc_cert" ]; then
  echo "RESULT: NOT VERIFIED - could not read the RC certificate."
  exit 2
fi
if [ "$device_cert" = "$rc_cert" ]; then
  echo "RESULT: MATCH - in-place update can preserve app data."
  exit 0
fi
echo "RESULT: MISMATCH - do NOT install. Back up app state first:"
echo "  tools/backup_app_state.sh '$PACKAGE'"
exit 4
