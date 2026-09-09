# 新躍進政策 Android 0.7 Remote AI boundary

The v0.7 source retains the shared SAYO/NurseT conversation, Study source-of-truth, local VOICEVOX and LocalRules behavior, and adds an optional server-mediated RemoteAIProvider. USER messages remain right-aligned bubbles with no avatar or reserved avatar column.

毎日の学習をすぐ始め、何をどこまで進めたかを残し、後から積み重ねを振り返るためのアプリです。小夜はローカルの履歴とテンプレートを使って短く反応します。

**現在は NOT READY。VOICEVOX資材はローカル作業木でchecksum検証済みですが、v0.7 APKは未生成です。現在の環境にAndroid SDK、Gradle、adb、EmulatorがないためAndroid実行、再生、画面は未検証です。** 本番データをこの版だけに移さないでください。既存アプリやデータは変更していません。

## 日常の流れ

1. Homeの「勉強開始」を押すと、入力なしで自由学習が始まります。
2. 学習中は経過時間、一時停止、休憩、終了を中心に表示します。
3. 休憩は5・10・30分または任意の分数。再開するまで休憩として記録し、学習時間に含めません。
4. 終了すると記録を保存し、今日の累計を表示します。後から教材・目標・タスク・予定を関連付け、教材の進捗を更新できます。
5. 「振り返り」で日・週・月・全期間・任意期間、教材や目標別の学習を確認できます。
6. 「その他」から思い出、関係の積み重ね、設定、JSONのバックアップと復元を利用します。

小夜とナースロボ＿タイプＴは、短い反応、学習履歴、Memory、継続するConversationState、任意のローカルVOICEVOX音声で学習に寄り添います。3Dは対象外です。音声が失敗してもText ReactionとStudyは継続します。

「続き」「昨日の続き」「前と同じ」などは、現在の会話文脈、直近のStudySession、Daily Planから解決します。候補が近い場合は勝手に決めず短く確認します。Memoryは関連性とcooldownを通ったときだけ使い、感情状態は短時間持続します。詳細は `docs/CONVERSATION.md` を参照してください。

## 開発・ビルド

開発用にJDK 17、Gradle 8.9、Android SDK Platform 35、Build-tools 35.0.0、Android NDK、CMake 3.22.1が必要です。`ANDROID_HOME`をSDKに設定してください。Gradle wrapperのバイナリは同梱していません。初回ビルドの依存解決には開発側のネット接続が必要です。

```sh
node --test tests/*.test.mjs
python3 tools/build.py
```

Pythonを使わない場合、同等のビルドコマンドは以下です。

```sh
gradle --no-daemon :app:assembleDebug :app:lintDebug
```

今回のAPKは未生成です。正式Gradleビルド方法は `tools/build.py` です。継続配布するrelease署名鍵は別途安全に管理してください。鍵やユーザーデータは同梱しません。

アプリIDは `org.shinyakushin.study.next.v07.preview`。既存版とは別アプリとして確認するためのIDです。既存スマートフォン版のID・署名はこの環境では確認できていません。インストール前に端末のパッケージ一覧を確認し、同IDが存在する場合は上書きしないでください。

Core StudyとLocalRules会話には外部AI・外部サーバー・PC・Pythonは不要です。Remote AIは明示的にONにした場合だけ運営Backendへ接続し、失敗時はローカル応答を維持します。端末からOpenAI APIを直接呼ばず、APIキーをAPKや保存データへ持ちません。設定方法は `docs/REMOTE-AI.md` を参照してください。

個人利用の推奨Backendは `backend/cloudflare-worker.mjs` です。DB、アカウント管理、Analytics、常駐サーバーは使用しません。CloudflareのSecretへAPIキーを設定し、発行された公開HTTPS URLをAndroid設定へ貼り付けます。Node Web Service向けの既存 `backend/server.mjs` とRender Blueprintも代替経路として保持しています。

## データ

学習区間のtimestampを唯一の時間情報として保存します。報酬とStudy Bondは完了Sessionから計算し、付与用の別DBを持ちません。分類してもsessionIdは変わりません。

SQLiteトランザクション、revisionによる競合検出、AtomicFileによる自動バックアップを実装。復元時は入力原本と復元直前の記録を別ファイルへ残します。v0.1 schema1のJSONを検証してschema2へ移行します。学習進行中の復元は拒否します。未知のschemaは推測変換しません。

自動バックアップは端末内です。紛失やアプリ削除に備え、設定のExportで端末外にも保存してください。複数のバックアップをImportして合算する機能はありません。確認後のImportは現在の記録を置き換えます。

## 続きの作業

`docs/QA.md` の端末QAを完了してから日常利用可否を判定してください。優先順はAPKコンパイル、実機で保存・復元・破損復旧、学習フローとbackground計時、縦画面・キーボード・文字サイズ、通知です。

## v0.3追加

Homeの前回の続き、終了後の短い進捗入力、音声設定と話者選択、JNI音声合成と再生・cache・queueを追加。音声初期値はOFF。詳細はdocs/VOICEVOX.md、配布前の条件はLICENSES.mdを参照。モデルを同梱するため、ビルド前に公式依存物の配置・検証が必要です。

