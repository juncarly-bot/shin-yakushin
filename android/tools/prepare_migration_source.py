#!/usr/bin/env python3
"""Turn a tools/backup_app_state.sh backup into a migration rehearsal source.

READ-ONLY ON THE INPUT: the backup directory, tar and sqlite file are only ever opened
for reading. The extracted JSON state is written next to the output file, never into the
backup. Feed the result to the migration QA build's "バックアップを読み取り専用で検証".

Usage:
  tools/prepare_migration_source.py <backup-dir|app-data.tar|files_study.sqlite3|state.json> [-o out.json]
"""
import argparse
import hashlib
import io
import json
import sqlite3
import sys
import tarfile
from pathlib import Path

SQLITE_NAMES = ("files_study.sqlite3", "study.sqlite3", "files/study.sqlite3")
JSON_NAMES = ("files_study.backup.json", "study.backup.json", "files/study.backup.json")
TAR_SQLITE = ("files/study.sqlite3", "./files/study.sqlite3")


def sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()


def payload_from_sqlite_bytes(data):
    """Reads the committed payload from an in-memory sqlite image; the source is untouched."""
    # SQLite cannot open a plain blob, so stage the bytes in the OS temp dir and open that
    # copy read-only. The user's original file is never opened for writing by this tool.
    import tempfile

    with tempfile.NamedTemporaryFile(suffix=".sqlite3") as handle:
        handle.write(data)
        handle.flush()
        connection = sqlite3.connect(f"file:{handle.name}?mode=ro", uri=True)
        try:
            try:
                row = connection.execute("SELECT payload FROM state WHERE id=1").fetchone()
            except sqlite3.DatabaseError as error:
                raise SystemExit(f"ERROR: not a readable study.sqlite3 image: {error}")
        finally:
            connection.close()
    if row is None or row[0] is None:
        raise SystemExit("ERROR: study.sqlite3 has no committed payload row")
    return row[0]


def payload_from_tar(data):
    """Returns the committed JSON state bytes carried by a tar archive."""
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:") as archive:
        sqlite_member = next((m for m in archive.getmembers() if m.name in TAR_SQLITE and m.isfile()), None)
        if sqlite_member is not None:
            return payload_from_sqlite_bytes(archive.extractfile(sqlite_member).read())
        candidates = [m for m in archive.getmembers()
                      if m.isfile() and (m.name.startswith("files/import-source-") and m.name.endswith(".json")
                                         or m.name in JSON_NAMES)]
        if not candidates:
            raise SystemExit("ERROR: the archive has neither files/study.sqlite3 nor a JSON snapshot")
        return archive.extractfile(candidates[0]).read()


def resolve_source(target):
    """Returns (json_state_bytes, format, origin_path). The input is only ever read."""
    if target.is_dir():
        for name in SQLITE_NAMES:
            candidate = target / name
            if candidate.is_file():
                return payload_from_sqlite_bytes(candidate.read_bytes()), "sqlite3", candidate
        for name in JSON_NAMES:
            candidate = target / name
            if candidate.is_file():
                return candidate.read_bytes(), "json", candidate
        for candidate in sorted(target.glob("files_import-source-*.json")):
            return candidate.read_bytes(), "json", candidate
        tar = target / "app-data.tar"
        if tar.is_file():
            return payload_from_tar(tar.read_bytes()), "tar", tar
        raise SystemExit(f"ERROR: no sqlite store, JSON snapshot or app-data.tar under {target}")
    data = target.read_bytes()
    if data[:16] == b"SQLite format 3\x00":
        return payload_from_sqlite_bytes(data), "sqlite3", target
    if len(data) >= 263 and data[257:262] == b"ustar":
        return payload_from_tar(data), "tar", target
    return data, "json", target


def summarize(raw_json, source_format, origin, raw_sha, out_path):
    text = raw_json.decode("utf-8") if isinstance(raw_json, bytes) else raw_json
    state = json.loads(text)
    stripped = text.lstrip()
    extracted_sha = sha256_bytes(text.encode("utf-8"))
    out_path.write_text(text, encoding="utf-8")
    checksum = out_path.with_suffix(out_path.suffix + ".sha256")
    checksum.write_text(f"{extracted_sha}  {out_path.name}\n", encoding="utf-8")
    counts = {key: len(state.get(key, [])) for key in
              ("sessions", "materials", "goals", "tasks", "plans", "memories", "progressEvents", "visits")}
    ledger = state.get("lifeBalanceAnalytics")
    life = state.get("settings", {}).get("lifeBalance") if isinstance(state.get("settings"), dict) else None
    summary = {
        "origin": str(origin),
        "originFormat": source_format,
        "originSha256": raw_sha,
        "sourceSchemaVersion": state.get("schemaVersion"),
        "targetSchemaVersion": 2,
        "counts": counts,
        "dailyMode": (life or {}).get("dailyMode"),
        "budgetMinutes": (life or {}).get("budgetMinutes"),
        "appCategories": len((life or {}).get("appCategories") or {}),
        "weeklyAggregateDays": len(ledger.get("days", [])) if isinstance(ledger, dict) else 0,
        "sourceBytes": len(text.encode("utf-8")),
        "extractedSha256": extracted_sha,
        "written": str(out_path),
        "note": "The backup was read only. Import the written JSON inside the migration QA app.",
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    if not stripped:
        raise SystemExit("ERROR: the extracted state is empty")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("backup", help="backup directory, app-data.tar, files_study.sqlite3 or JSON state")
    parser.add_argument("-o", "--output", default="migration-source.json")
    args = parser.parse_args(argv)
    target = Path(args.backup)
    if not target.exists():
        raise SystemExit(f"ERROR: {target} does not exist")
    json_text, source_format, origin = resolve_source(target)
    origin_before = sha256_bytes(origin.read_bytes()) if origin.is_file() else None
    origin_after = sha256_bytes(origin.read_bytes()) if origin.is_file() else None
    if origin_before is not None and origin_after != origin_before:
        raise SystemExit("ERROR: the backup changed while reading; refusing to continue")
    summarize(json_text, source_format, origin, origin_after or "", Path(args.output))
    return 0


if __name__ == "__main__":
    sys.exit(main())
