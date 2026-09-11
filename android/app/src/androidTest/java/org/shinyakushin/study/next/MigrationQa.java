package org.shinyakushin.study.next;

import android.app.Instrumentation;
import android.database.sqlite.SQLiteDatabase;
import android.os.Bundle;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Arrays;

/**
 * Real Android tests for the migration rehearsal import path.
 *
 * <p>They prove the reader is non-destructive: every source file is hashed before and after
 * a read, and a sqlite source must not grow a {@code -wal}/{@code -shm} sibling next to it.
 * The rehearsal never commits, so nothing here touches the application's real study.sqlite3.
 */
public final class MigrationQa extends Instrumentation {
    private int passed, failed;
    private final StringBuilder result = new StringBuilder();

    interface Check { void run() throws Exception; }

    private static void check(boolean ok, String message) { if (!ok) throw new AssertionError(message); }

    private void test(String name, Check action) {
        try { action.run(); passed++; result.append(name).append(": PASS\n"); }
        catch (Throwable ex) {
            failed++;
            result.append(name).append(": FAIL ").append(ex).append('\n');
            for (Throwable cause = ex.getCause(); cause != null; cause = cause.getCause())
                result.append("cause: ").append(cause).append('\n');
        }
    }

    private File work() throws Exception {
        return Files.createTempDirectory(getTargetContext().getCacheDir().toPath(), "migration-qa").toFile();
    }

    private static final String STATE = "{\"schemaVersion\":2,\"revision\":3,\"sessions\":[],\"materials\":[],\"goals\":[],"
            + "\"tasks\":[],\"plans\":[],\"memories\":[],\"visits\":[],\"progressEvents\":[],\"dialogueHistory\":{},\"reaction\":null,"
            + "\"settings\":{\"name\":\"\",\"utcOffsetMinutes\":540,\"breakMinutes\":5,\"quiet\":false,\"notifications\":false},"
            + "\"lastSeen\":null}";

    private static void write(File file, byte[] data) throws IOException {
        try (OutputStream out = new FileOutputStream(file)) { out.write(data); }
    }

    private File sqliteStore(File dir, String payload) throws IOException {
        dir.mkdirs();
        File file = new File(dir, "study.sqlite3");
        SQLiteDatabase db = SQLiteDatabase.openDatabase(file.getPath(), null, SQLiteDatabase.CREATE_IF_NECESSARY);
        try {
            db.execSQL("CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, payload TEXT NOT NULL)");
            db.execSQL("DELETE FROM state");
            db.execSQL("INSERT INTO state(id,revision,payload) VALUES(1,?,?)", new Object[]{3, payload});
        } finally { db.close(); }
        return file;
    }

    /** Minimal ustar writer so the rehearsal can consume a tools/backup_app_state.sh archive. */
    private static byte[] tar(String name, byte[] data) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] header = new byte[512];
        byte[] nameBytes = name.getBytes(StandardCharsets.UTF_8);
        System.arraycopy(nameBytes, 0, header, 0, nameBytes.length);
        octal(header, 100, 8, 0644);
        octal(header, 108, 8, 0);
        octal(header, 116, 8, 0);
        octal(header, 124, 12, data.length);
        octal(header, 136, 12, 0);
        header[156] = '0';
        byte[] magic = "ustar".getBytes(StandardCharsets.US_ASCII);
        System.arraycopy(magic, 0, header, 257, magic.length);
        header[263] = '0'; header[264] = '0';
        for (int i = 148; i < 156; i++) header[i] = ' ';
        int sum = 0;
        for (byte b : header) sum += b & 0xff;
        octal(header, 148, 6, sum);
        header[154] = 0; header[155] = ' ';
        out.write(header);
        out.write(data);
        int padding = (int) ((512 - (data.length % 512)) % 512);
        out.write(new byte[padding]);
        out.write(new byte[1024]);
        return out.toByteArray();
    }

    private static void octal(byte[] header, int offset, int length, long value) {
        String text = Long.toOctalString(value);
        while (text.length() < length - 1) text = "0" + text;
        byte[] bytes = text.getBytes(StandardCharsets.US_ASCII);
        System.arraycopy(bytes, 0, header, offset, Math.min(bytes.length, length - 1));
        header[offset + length - 1] = 0;
    }

    public void onCreate(Bundle args) { super.onCreate(args); start(); }

    public void onStart() {
        test("JSON snapshot is read without modification", () -> {
            File dir = work();
            File source = new File(dir, "state.json");
            byte[] raw = STATE.getBytes(StandardCharsets.UTF_8);
            write(source, raw);
            MigrationSource.Result read = MigrationSource.read(source, dir);
            check("json".equals(read.format), "unexpected format " + read.format);
            check(STATE.equals(read.json), "payload changed");
            check(Arrays.equals(raw, Files.readAllBytes(source.toPath())), "source bytes changed");
            check(read.sha256.equals(MigrationSource.sha256(source)), "sha mismatch");
        });
        test("sqlite store payload is extracted from a private copy only", () -> {
            File dir = work();
            File source = sqliteStore(dir, STATE);
            byte[] raw = Files.readAllBytes(source.toPath());
            MigrationSource.Result read = MigrationSource.read(source, dir);
            check("sqlite3".equals(read.format), "unexpected format " + read.format);
            check(STATE.equals(read.json), "payload changed: " + read.json);
            check(Arrays.equals(raw, Files.readAllBytes(source.toPath())), "source bytes changed");
            check(!new File(source.getPath() + "-wal").exists(), "wal sibling created next to the source");
            check(!new File(source.getPath() + "-shm").exists(), "shm sibling created next to the source");
            check(!new File(source.getPath() + "-journal").exists(), "journal sibling created next to the source");
        });
        test("app-data.tar is parsed and the archive is untouched", () -> {
            File dir = work();
            File inner = sqliteStore(new File(dir, "inner"), STATE);
            File archive = new File(dir, "app-data.tar");
            write(archive, tar("files/study.sqlite3", Files.readAllBytes(inner.toPath())));
            byte[] raw = Files.readAllBytes(archive.toPath());
            MigrationSource.Result read = MigrationSource.read(archive, dir);
            check("tar".equals(read.format), "unexpected format " + read.format);
            check(STATE.equals(read.json), "payload changed: " + read.json);
            check(Arrays.equals(raw, Files.readAllBytes(archive.toPath())), "archive bytes changed");
        });
        test("corrupt sqlite image is rejected and preserved", () -> {
            File dir = work();
            File source = new File(dir, "broken.sqlite3");
            byte[] raw = new byte[4096];
            System.arraycopy("SQLite format 3\u0000".getBytes(StandardCharsets.US_ASCII), 0, raw, 0, 16);
            for (int i = 16; i < raw.length; i++) raw[i] = (byte) (i % 251);
            write(source, raw);
            boolean rejected = false;
            try { MigrationSource.read(source, dir); } catch (IOException expected) { rejected = true; }
            check(rejected, "corrupt image accepted");
            check(Arrays.equals(raw, Files.readAllBytes(source.toPath())), "corrupt original changed");
        });
        test("sqlite image without a committed row is rejected", () -> {
            File dir = work();
            File source = new File(dir, "empty.sqlite3");
            SQLiteDatabase db = SQLiteDatabase.openDatabase(source.getPath(), null, SQLiteDatabase.CREATE_IF_NECESSARY);
            db.execSQL("CREATE TABLE state (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, payload TEXT NOT NULL)");
            db.close();
            boolean rejected = false;
            try { MigrationSource.read(source, dir); } catch (IOException expected) { rejected = true; }
            check(rejected, "row-less store accepted");
        });
        test("overseas size guard rejects without reading the payload", () -> {
            File dir = work();
            File source = new File(dir, "huge.json");
            try (RandomAccessFile sparse = new RandomAccessFile(source, "rw")) { sparse.setLength(MigrationSource.MAX_BYTES + 1); }
            boolean rejected = false;
            try { MigrationSource.read(source, dir); } catch (IOException expected) { rejected = true; }
            check(rejected, "oversized file accepted");
        });
        test("empty file is rejected", () -> {
            File dir = work();
            File source = new File(dir, "empty.json");
            write(source, new byte[0]);
            boolean rejected = false;
            try { MigrationSource.read(source, dir); } catch (IOException expected) { rejected = true; }
            check(rejected, "empty file accepted");
        });
        result.append("MIGRATION_QA passed=").append(passed).append(" failed=").append(failed).append('\n');
        Bundle bundle = new Bundle();
        bundle.putString("stream", result.toString());
        finish(failed == 0 ? -1 : 0, bundle);
    }
}
