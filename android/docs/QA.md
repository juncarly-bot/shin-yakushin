# QA report — 2026-09-05

**FINAL VERDICT: NOT READY**

Android SDK・Gradle・端末がないため、APK未生成。UIの実操作・Android保存層を確認できていない。以下はコード存在と動作確認を区別した結果である。

## 実行済み

|対象|結果|証拠・限界|
|---|---|---|
|元v0.1の既存テスト|21 PASS|前段の調査で実行。既存実装・データは変更なし|
|Android用Domain / Application regression|25/25 PASS|evidence/regression.txt。Node実行、Android実機ではない|
|Java構文解析|PASS|evidence/java-parse.txt。Android symbol/type検査ではない|
|UI JavaScript構文|PASS|node --check実行。画面表示の保証ではない|
|APK build preflight|BLOCKED|evidence/build.txt。Gradle8.9、SDK35、build-tools35.0.0なし|

25件のテストは、50分Study→10分Break→40分Study、pause、背景移行を模したserialize/reload、終了の冪等性、同ID分類、日跨ぎ、関連ID継承、v0.1移行の学習・報酬・Bond・Review一致、無効データ拒否、Memory上限、進捗・達成、訪問日の重複抑止、保存失敗時の状態保持、期間・教材・目標別集計、反応cooldown・quiet、1万Session集計、競合拒否、export/fresh/importを含む。

Platformテストは障害注入可能なfake hostを使う。Android SQLite、AtomicFile、SAFのテストに代わるものではない。

## 機能別判定

|項目|ロジック|Android利用|
|---|---|---|
|Study / Free Study / Daily Plan / Pause / Break / Finish|PASS|NOT VERIFIED|
|Background timing|timestamp復元PASS|background・process kill未検証|
|Goals / Materials / Tasks / Progress|PASS|入力UI未検証|
|Daily / Weekly / Long-term Review|PASS|Visual未検証|
|Reward / Relationship / Memory|PASS|実機未検証|
|分類・再分類・重複防止|PASS / duplicates NONE in tests|実機未検証|
|Backup / Restore / schema1 migration|Application契約PASS|端末ファイル入出力未検証|
|Corruption recovery|実装・コードレビューのみ|NOT VERIFIED|
|小夜のローカル反応|PASS|Visual未検証|
|Sayo 3D / Gaze / Gesture / Life Layer animation|未実装|今回の学習中心版では採用なし|
|通知|実装のみ|NOT VERIFIED|
|オフライン|Domainは外部通信なしでPASS|機内モード実機未検証|

Compile errors: Java構文エラー0、JS構文エラー0。Android compile未実行のため件数未確定。
Runtime errors: 25件のテストで0。Android runtimeは未実行。
Visual QA: **NOT VISUALLY VERIFIED**。overlap、clipping、IME、文字拡大、縦長画面は判定不可。

## 今回修正

- Java Activity破棄時のexecutor終了順序を修正。
- 既存DBのstate行消失時に空状態で初期化しないよう修正。
- task/planの「この履歴」リンクが全履歴を表示する誤誘導を除去。教材・目標の絞り込みは維持。
- Android Backはdialog閉鎖→Home→taskを背景へ移動する順に変更。
- 拡張Reviewのgoal集計を元v0.1との差分として個別検証し、既存項目の一致も維持。
- 上記修正後に25件のRegressionとUI構文・Java構文検査を実行。

## 端末QA手順（未実施）

1. 隔離された空のエミュレータを使う。既存アプリのuninstall・clear dataはしない。
2. assembleDebugとlintDebugを実行、APKの署名・SHA-256を記録。インストールと起動を確認。
3. 機内モード、通知拒否でHome→即Start→Pause→Resume→Break→Resume→Finish→分類→Progress→Reviewを通す。
4. Study中に背景移動、画面ロック、process kill、再起動。timestampと区間の合計を比較。
5. 教材・目標・task・planを関連付けたSessionを記録。再分類・再終了でID・Reward・Bondが増えないこと。
6. Exportして別の空エミュレータへImport。全entity・Session・progress・Memory・集計値を比較。元端末は削除しない。
7. 合成データ専用環境でDB破損、空DB、backup破損、ディスク不足、未知schemaを注入。復旧・拒否・原本保持を確認。
8. 360px縦長、文字200%、キーボード、横向き、dark system、Back、起動復帰を目視する。
9. 通知許可後の休憩終了・通知タップ・再起動後の再設定を確認。通知遅延時も時間が正しいこと。
10. 大容量合成履歴で保存時間・UI応答・起動・exportを測定。

## READYを妨げるもの

APK生成とAndroid全体コンパイル、実機の保存・復旧・移行検証、日常フローとVisual QAが未完了。通知は任意機能だが動作の報告は未確定。既存スマートフォン版の署名・データ形式は参照できていない。
