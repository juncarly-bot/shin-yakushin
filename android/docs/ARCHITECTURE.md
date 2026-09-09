# Architecture / 継承判断

## v0.5 conversation participation

ConversationOrchestrator sits after the existing ReactionDirector and selects a bounded participation plan. It never writes Study time, Reward, Bond, or Memory. timeline.js materializes character messages and references Study completion by session ID. The UI sends those same committed character messages as a bounded voice batch. VoiceController owns synthesis/cache/playback order only; it has no conversation rules.

The launcher and timeline avatars use original abstract companion marks. Character identity and VOICEVOX model/style remain defined in Character Profiles.

## Product Visionの実装

Homeの最優先操作は一回のタップで始める学習。分類を開始条件にせず、終了後に内容を補足できる。学習画面から通常Navigationを外し、振り返りと報酬は終了後に置く。継続が途切れても履歴は保持する。

|責務|実装|正本・境界|
|---|---|---|
|Domain|assets/domain.js|StudySession区間、教材・目標・タスク・予定、進捗履歴、検証、移行|
|Application|assets/platform.js|command、revision、保存成功後の状態確定、復元プレビュー|
|Character|assets/reactions.js、templates.js|LocalRulesProvider。履歴・時間帯・Memory・使用頻度から発言を選択|
|UI|assets/ui.js、style.css、index.html|日本語の4項目Navigationと静かなStudy画面|
|Persistence|StateStore.java|SQLite内の単一state行。transaction・自動バックアップ・破損元保持|
|Platform|MainActivity.java、BreakReceiver.java|組込WebView、SAFファイル入出力、任意通知、ライフサイクル|

StudySessionのsegments（study / break / pause）をwall-clockで集計する。actualStudySecondsや別Timer DBを重複保存しない。Rewardは完了Sessionの分数切り捨て、Study Bondは合計時間から導出する。Familiarityは訪問日、Shared Memoriesは重要な出来事として分離する。同じIDの再分類や再終了で報酬は増えない。

Memoryは自動300件、手動100件に制限。重要度と日時で自動Memoryを保持し、元の学習履歴は消さない。providerはイベントを受け取り、Contextと履歴からreactionを返す。UIが直接テンプレートを選ばない。無反応・quietも正常な出力。

## v0.1からの判断

|分類|対象|実施内容|
|---|---|---|
|KEEP|Session区間、Free Study、分類、報酬・Bond算式|挙動を維持。元Pythonをsynthetic fixture生成用に保存|
|KEEP|小夜のテンプレート|元の17カテゴリを継承|
|IMPROVE|Review / 長期履歴|月・全期間・任意期間、教材・目標別時間、進捗履歴|
|IMPROVE|データ検証|参照整合性、重複ID、区間連続性、未来schema拒否|
|IMPROVE|UI|Android縦画面を想定、開始フォーム不要、4項目Navigation|
|REWRITE|実行ホスト|Python localhostからAndroid Activity + bundled assetsへ|
|REWRITE|永続化|Pythonファイル保存からAndroid SQLite + AtomicFileへ|
|REMOVE from runtime|Pythonサーバー、開発用HTTP起動|APK利用時の依存から除外|
|DO NOT REQUIRE|外部AI・VOICEVOX・外部サーバー|依存を追加していない|

旧Unity/小夜モデルとスマートフォン実装はアクセスできていない。旧アセットを流用したという主張はしない。3D、Room、TTS、汎用AI会話は学習とデータ安全性に対する費用対効果から今回実装していない。

## 保存と復旧

commandはcloneしたstateを変更・検証し、expected revisionとともに同期commitする。UIは保存成功を確認してから確定する。SQLiteはsynchronous FULLでtransactionを完了し、自動バックアップをAtomicFileで更新する。バックアップ失敗時は正本保存成功と分けて警告する。

起動時はquick_checkとpayload検証。破損時は有効なbackupを検証し、元DB・journal等を退避して復旧する。DB行がなく過去のDBまたはbackupがある場合も空データで続行しない。未知schemaは降格復旧しない。これらのAndroid実行検証は未了。

state全体を毎commandでシリアライズする単純な方式。1万Sessionの集計テストは実施したが、Androidの大容量保存性能は未測定。入力は25MBまで。数年間の利用をREADYとする前に実機で保存遅延を測定する必要がある。

## Android境界

ManifestにINTERNET権限を持たず、WebViewはホワイトリストの組込ファイルのみを返す。CSPで外部接続を禁止。JS bridgeはこのローカルUIにだけ公開する。バックグラウンド時はWebView timersを停止し、復帰時にtimestampから表示を更新する。

休憩通知は許可制のinexact alarm。OS都合で遅延し得る。通知が来なくても学習・休憩は継続し、勝手に学習へ再開しない。常駐サービスはない。

## v0.3変更

VOICEVOXを今回から任意の音声Providerとして実装。前段の「今回実装していないTTS」はv0.2時点の判断。3Dのみ引き続き対象外。companion.jsのReactionDirectorとSpeakerSelectorが小夜・NurseTを選ぶ。VoiceController/VoicevoxProvider/C++はStudyと別の実行境界。settings.voiceはschema2への後方互換の任意追加。既存settingsは読み込み可能で初期値は音声OFF。設定保存・Import時に検証する。

ContextAssemblerは複製した文脈を返す。将来のDialogueProviderにDomainの書き換え権限を与えない。Remote failure/timeoutはローカル出力へ戻す契約をテスト済み。実際のRemote APIは未実装。

## v0.4 Conversation Continuity

`conversation.js` is an Application/Character coordination layer. It ranks safe continuation candidates from short-lived conversation context, StudySession history, and Daily Plan; only the existing Domain `start` command creates a StudySession. Ambiguous candidates never start automatically.

Conversation details are bounded separately from long-term Memory. Memory recall uses relevance, importance, context, recency, novelty, relationship fit, a global cooldown, and a reaction budget. Character mood persists and follows small allowed transitions. Character Profiles are shared by LocalRulesProvider, SpeakerSelector, ContextAssembler, voice selection, and a future Remote provider. VOICEVOX receives only the already selected speaker, text, and voice style.

See `docs/CONVERSATION.md` for state lifetimes and acceptance behavior.
# Remote AI (optional)

`UI → ContextAssembler → RemoteAIProvider → Android RemoteAIClient → HTTPS Backend → OpenAI Responses API`

The backend returns dialogue intent only. On any failure the committed LocalRules response remains visible. See `REMOTE-AI.md` for the trust boundary and deployment configuration.
