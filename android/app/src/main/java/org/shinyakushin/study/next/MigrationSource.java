package org.shinyakushin.study.next;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;

/**
 * Read-only reader for a migration-rehearsal source file.
 *
 * <p>The migration QA build imports what {@code tools/backup_app_state.sh} wrote on the QA
 * host. The script can produce any of:
 *
 * <ul>
 *   <li>{@code app-data.tar} — the whole data directory as a POSIX tar.
 *   <li>{@code files_study.sqlite3} — the authoritative store; the committed JSON state is
 *       the {@code payload} column of {@code state WHERE id=1}.
 *   <li>{@code files_study.backup.json} / {@code files_import-source-*.json} — plain JSON.
 * </ul>
 *
 * <p>The input file is never opened for writing, renamed, truncated or deleted. A sqlite
 * source is copied into a private work directory first, so no {@code -wal}/{@code -shm}
 * sibling is ever created next to the user's original and a hot journal can still be
 * replayed against the copy.
 */
public final class MigrationSource {
    public static final int MAX_BYTES = 25_000_000;
    private static final byte[] SQLITE_MAGIC = "SQLite format 3\u0000".getBytes(StandardCharsets.US_ASCII);
    private static final String[] TAR_SQLITE = {"files/study.sqlite3"};
    private static final String[] TAR_JSON = {"files/study.backup.json", "files/study.backup.json.bak"};

    private MigrationSource() {}

    /** Parsed source. {@link #json} is the exact committed state, never a re-serialisation. */
    public static final class Result {
        public final String json, format, sha256, name;
        public final long bytes;

        Result(String json, String format, String sha256, String name, long bytes) {
            this.json = json;
            this.format = format;
            this.sha256 = sha256;
            this.name = name;
            this.bytes = bytes;
        }
    }

    /**
     * Reads a staged source file without modifying it.
     *
     * @param source  the file to read (for example a copied backup artifact)
     * @param workDir a private directory (the app cache dir) for throwaway sqlite copies
     */
    public static Result read(File source, File workDir) throws IOException {
        if (source == null || !source.isFile()) throw new IOException("移行元ファイルが見つかりません");
        long size = source.length();
        if (size <= 0) throw new IOException("移行元ファイルが空です");
        if (size > MAX_BYTES) throw new IOException("25 MB以下のファイルを選んでください");
        if (workDir == null || !workDir.isDirectory()) throw new IOException("作業ディレクトリを用意できません");
        byte[] head = new byte[512];
        int read;
        try (InputStream in = new FileInputStream(source)) {
            read = in.read(head);
        }
        if (read < 0) read = 0;
        String sha256 = sha256(source);
        String format, json;
        if (startsWith(head, read, SQLITE_MAGIC)) {
            format = "sqlite3";
            json = sqlitePayload(source, workDir);
        } else if (looksLikeTar(head, read)) {
            format = "tar";
            json = tarPayload(source, workDir);
        } else {
            format = "json";
            json = new String(readAll(source, MAX_BYTES), StandardCharsets.UTF_8);
        }
        if (json == null || json.trim().isEmpty()) throw new IOException("移行元に保存データがありません");
        return new Result(json, format, sha256, source.getName(), size);
    }

    /** Extracts the committed payload from a sqlite store, working on a private copy only. */
    static String sqlitePayload(File sqlite, File workDir) throws IOException {
        File copy = File.createTempFile("migration-source-", ".sqlite3", workDir);
        try {
            copyBytes(sqlite, copy);
            // Best effort: a hot journal lives next to the original; the first extraction
            // path already knows about it and passes it in, this covers direct reads.
            File wal = new File(sqlite.getPath() + "-wal");
            if (wal.isFile()) copyBytes(wal, new File(copy.getPath() + "-wal"));
            SQLiteDatabase db = null;
            try {
                // The copy is disposable, so a read-write open is safe and lets sqlite
                // replay a WAL that was copied along with the store.
                db = SQLiteDatabase.openDatabase(copy.getPath(), null, SQLiteDatabase.OPEN_READWRITE);
                try (Cursor cursor = db.rawQuery("SELECT payload FROM state WHERE id=1", null)) {
                    if (!cursor.moveToFirst() || cursor.isNull(0)) throw new IOException("保存行が見つかりません");
                    String payload = cursor.getString(0);
                    if (payload == null || payload.trim().isEmpty()) throw new IOException("保存データが空です");
                    return payload;
                }
            } catch (IOException ex) {
                throw ex;
            } catch (RuntimeException ex) {
                throw new IOException("保存データを読み出せません：" + ex.getClass().getSimpleName(), ex);
            } finally {
                if (db != null) db.close();
            }
        } finally {
            copy.delete();
            new File(copy.getPath() + "-wal").delete();
            new File(copy.getPath() + "-shm").delete();
            new File(copy.getPath() + "-journal").delete();
        }
    }

    /** Reads the sqlite store, then a JSON snapshot, out of a {@code tar -cf - .} archive. */
    static String tarPayload(File tar, File workDir) throws IOException {
        byte[] data = readAll(tar, MAX_BYTES);
        byte[] sqlite = null, wal = null, shm = null;
        String json = null;
        int pos = 0;
        while (pos + 512 <= data.length) {
            if (isZeroBlock(data, pos)) break;
            String name = new String(data, pos, 100, StandardCharsets.UTF_8).trim();
            long size = parseOctal(data, pos + 124, 12);
            long dataStart = pos + 512L;
            if (size < 0 || dataStart + size > data.length) break;
            char type = (char) (data[pos + 156] & 0xff);
            boolean regular = type == '0' || type == '\u0000' || type == ' ';
            String normalized = name.startsWith("./") ? name.substring(2) : name;
            if (regular && normalized.equals(TAR_SQLITE[0])) sqlite = slice(data, dataStart, size);
            else if (regular && normalized.equals(TAR_SQLITE[0] + "-wal")) wal = slice(data, dataStart, size);
            else if (regular && normalized.equals(TAR_SQLITE[0] + "-shm")) shm = slice(data, dataStart, size);
            else if (regular && json == null && isJsonSnapshot(normalized))
                json = new String(slice(data, dataStart, size), StandardCharsets.UTF_8);
            pos = (int) (dataStart + ((size + 511) / 512) * 512);
        }
        if (sqlite != null) {
            File copy = File.createTempFile("migration-source-", ".sqlite3", workDir);
            try {
                write(copy, sqlite);
                if (wal != null) write(new File(copy.getPath() + "-wal"), wal);
                if (shm != null) write(new File(copy.getPath() + "-shm"), shm);
                return sqlitePayload(copy, workDir);
            } finally {
                copy.delete();
                new File(copy.getPath() + "-wal").delete();
                new File(copy.getPath() + "-shm").delete();
                new File(copy.getPath() + "-journal").delete();
            }
        }
        return json;
    }

    private static boolean isJsonSnapshot(String name) {
        if (name.startsWith("files/import-source-") && name.endsWith(".json")) return true;
        for (String candidate : TAR_JSON) if (candidate.equals(name)) return true;
        return false;
    }

    static boolean looksLikeTar(byte[] head, int length) {
        if (length < 263) return false;
        return head[257] == 'u' && head[258] == 's' && head[259] == 't' && head[260] == 'a' && head[261] == 'r';
    }

    static boolean startsWith(byte[] head, int length, byte[] prefix) {
        if (length < prefix.length) return false;
        for (int i = 0; i < prefix.length; i++) if (head[i] != prefix[i]) return false;
        return true;
    }

    static boolean isZeroBlock(byte[] data, int offset) {
        for (int i = offset; i < offset + 512; i++) if (data[i] != 0) return false;
        return true;
    }

    static long parseOctal(byte[] data, int offset, int length) {
        long value = 0;
        boolean seen = false;
        for (int i = offset; i < offset + length; i++) {
            int c = data[i] & 0xff;
            if (c == ' ' || c == 0) {
                if (seen) break;
                continue;
            }
            if (c < '0' || c > '7') return seen ? value : -1;
            value = value * 8 + (c - '0');
            seen = true;
        }
        return seen ? value : -1;
    }

    private static byte[] slice(byte[] data, long start, long size) {
        int from = (int) start;
        return Arrays.copyOfRange(data, from, (int) (from + size));
    }

    private static void write(File file, byte[] data) throws IOException {
        try (OutputStream out = new FileOutputStream(file)) {
            out.write(data);
        }
    }

    private static void copyBytes(File from, File to) throws IOException {
        try (InputStream in = new FileInputStream(from); OutputStream out = new FileOutputStream(to)) {
            byte[] buffer = new byte[8192];
            int n;
            while ((n = in.read(buffer)) != -1) out.write(buffer, 0, n);
        }
    }

    static byte[] readAll(File file, int cap) throws IOException {
        try (InputStream in = new FileInputStream(file); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int n;
            while ((n = in.read(buffer)) != -1) {
                if (out.size() + n > cap) throw new IOException("25 MB以下のファイルを選んでください");
                out.write(buffer, 0, n);
            }
            return out.toByteArray();
        }
    }

    static String sha256(File file) throws IOException {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (InputStream in = new FileInputStream(file)) {
                byte[] buffer = new byte[8192];
                int n;
                while ((n = in.read(buffer)) != -1) digest.update(buffer, 0, n);
            }
            StringBuilder text = new StringBuilder(64);
            for (byte b : digest.digest()) text.append(String.format("%02x", b & 0xff));
            return text.toString();
        } catch (java.security.NoSuchAlgorithmException impossible) {
            throw new IOException("SHA-256 unavailable", impossible);
        }
    }
}
