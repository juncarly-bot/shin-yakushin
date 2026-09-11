#!/usr/bin/env bash
# Non-destructive backup of a debuggable preview app's local state.
#
# READ-ONLY ON DEVICE: uses `run-as` to read the app data directory. It never
# installs, uninstalls, force-stops, clears data or deletes anything. Run this
# BEFORE any install attempt whose signing certificate may differ.
#
# Usage:
#   tools/backup_app_state.sh [package] [output-dir]
# Env:
#   ADB_SERIAL   target a specific device
set -euo pipefail

PACKAGE="${1:-org.shinyakushin.study.next.v07.preview}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${2:-./backup-$PACKAGE-$STAMP}"
SERIAL="${ADB_SERIAL:-}"

if ! command -v adb >/dev/null 2>&1; then
  echo "ERROR: adb was not found on PATH. Install the Android platform-tools first." >&2
  exit 5
fi

adb_cmd() { if [ -n "$SERIAL" ]; then adb -s "$SERIAL" "$@"; else adb "$@"; fi; }

if ! adb_cmd shell run-as "$PACKAGE" id >/dev/null 2>&1; then
  echo "ERROR: run-as is unavailable for $PACKAGE (not installed, or not debuggable)." >&2
  echo "Back up from a device backup, or reinstall the current APK over itself" >&2
  echo "with 'adb install -r' before upgrading." >&2
  exit 1
fi

mkdir -p "$OUT"
echo "package : $PACKAGE"
echo "output  : $OUT"

echo "-- device listing (read-only) --"
adb_cmd shell run-as "$PACKAGE" sh -c 'ls -la files shared_prefs databases 2>/dev/null' | tee "$OUT/device-listing.txt"

echo "-- copying the whole data dir when tar is available --"
if adb_cmd shell run-as "$PACKAGE" sh -c 'command -v tar >/dev/null 2>&1'; then
  adb_cmd exec-out run-as "$PACKAGE" sh -c 'cd /data/data/'"$PACKAGE"' && tar -cf - .' > "$OUT/app-data.tar" || true
  if [ -s "$OUT/app-data.tar" ]; then
    echo "wrote $OUT/app-data.tar"
  else
    echo "tar copy produced nothing; falling back to explicit files"
    rm -f "$OUT/app-data.tar"
  fi
else
  echo "tar not available on device; copying explicit files"
fi

copy() { # $1 = path relative to the app data dir
  local rel="$1" dest="$OUT/$(echo "$1" | tr '/' '_')"
  if adb_cmd exec-out run-as "$PACKAGE" cat "$rel" > "$dest" 2>/dev/null && [ -s "$dest" ]; then
    echo "copied $rel -> $dest"
  else
    rm -f "$dest"
  fi
}

echo "-- explicit copies (the authoritative store comes first) --"
for rel in \
  files/study.sqlite3 files/study.sqlite3-wal files/study.sqlite3-shm \
  files/study.backup.json files/study.backup.json.bak \
  shared_prefs/life-balance-notify.xml \
  shared_prefs/study-break.xml ; do
  copy "$rel"
done

# Any import-source-*.json snapshots the app preserved during a restore.
while IFS= read -r rel; do
  [ -z "$rel" ] && continue
  copy "files/$rel"
done < <(adb_cmd shell run-as "$PACKAGE" sh -c 'ls files 2>/dev/null' | tr -d '\r' | sed -n 's/^\(import-source-.*\.json\)$/\1/p')

echo "-- hashes (keep this with the backup) --"
( cd "$OUT" && find . -type f ! -name SHA256SUMS.txt -print0 | sort -z | xargs -0 -r sha256sum ) | tee "$OUT/SHA256SUMS.txt"

echo
echo "Backup complete. Nothing on the device was modified."
echo "To restore later (only if the new APK has the SAME certificate):"
echo "  adb push <file> /data/local/tmp/ && adb shell run-as $PACKAGE cp /data/local/tmp/<file> <dest>"
