# Build report — 2026-09-05

- App: **BLOCKED / APK未生成**
- Platform target: Android 8.0以上（min26 / target35 / compile35）
- Application ID: org.shinyakushin.study.next.v02
- Version: 0.2.0 / code2
- Build path: app/build/outputs/apk/debug/app-debug.apk（予定、現存しない）
- APK SHA-256: **N/A — APK未生成**
- JDK runtime/compiler module: 17.0.20を確認
- Gradle 8.9: 環境にない
- SDK platform35 / build-tools35.0.0: 環境にない
- adb / emulator / attached device: 利用不可

`python3 tools/build.py`を実行し、必要ツール不足で停止した（evidence/build.txt）。SDK取得のネットワーク承認が成立しなかったため、外部取得を進めていない。環境を揃えた後のコマンドと出力先はREADMEに記載。自動インストール・既存アプリ上書きは行わない。

UI・Domain・ProviderはAPK内assets、SQLite・通知・ファイル操作はAndroid標準API。OpenAI Key / external AI / VOICEVOX / server / PC / user-installed Python runtimeはアプリ実行依存に含めない。Android WebViewは使用する。完全オフライン利用の端末QAは未実施。

生成物はソースZIP、README、Architecture、QA、Build report、実行ログ。ZIPに実ユーザーデータ、署名鍵、資格情報、第三者キャラクターモデルは含めない。synthetic test fixtureと元v0.1テスト参照コードは含める。ファイル一覧はFILES.txt、ZIP自体のSHA-256は隣接SHA256SUMS.txtに記録。
