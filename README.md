# shin-yakushin

小夜（SAYO）とナースロボ＿タイプＴ（NurseT）がユーザーと同じ部屋で会話するためのリモートAIバックエンドです。Androidクライアントからメッセージと会話の状況を受け取り、OpenAI Responses APIでキャラクターの返答を生成します。

このリポジトリには**バックエンドとテスト**が含まれます。Androidアプリ本体やキャラクターの画像・音声素材は含まれていません。

## 主な機能

- SAYO / NurseT の会話と、クライアントが指定した発言順序に対応
- 前のキャラクターの発言を踏まえた、同じ部屋での会話
- テキスト、感情、イベントを含む構造化応答
- キャラクター設定、関係性、話題などの文脈の検証
- Node.js HTTPサーバーとCloudflare Workersへの対応
- 入力サイズ制限、簡易レート制限、タイムアウト、エラー処理

OpenAIへのリクエストには `store: false` と構造化出力を指定しています。発言順序はクライアントの会話プランに従います。

## フォルダー構成

```text
backend/
├── WORKERS.md                 # Workersの設定とAPIの詳細
├── backend/
│   ├── server.mjs             # Node.js HTTPサーバー
│   ├── cloudflare-worker.mjs  # Cloudflare Worker
│   ├── openai-client.mjs      # 入力検証・会話指示・OpenAI連携
│   ├── wrangler.jsonc         # Workers設定
│   └── package.json
└── tests/                     # 自動テスト
```

## 必要なもの

- Node.js 20以上
- 返答生成に使用するOpenAI APIキーとインターネット接続
- Cloudflare Workersを利用する場合はCloudflareアカウントとWrangler

OpenAI APIの利用には費用が発生する場合があります。APIキーはサーバー側で安全に管理し、Androidアプリ、ソースコード、Git、ログに含めないでください。

## ローカルで起動する

```bash
git clone https://github.com/juncarly-bot/shin-yakushin.git
cd shin-yakushin/backend/backend
npm start
```

既定のポートは `8787` です。環境変数 `PORT` で変更できます。起動自体にAPIキーは不要ですが、返答を生成するには実行環境に `OPENAI_API_KEY` を安全に設定してください。

`GET http://localhost:8787/healthz` で状態を確認できます。`remoteAvailable` はキーの設定有無を示し、OpenAIへの接続成功や利用枠を保証するものではありません。

## API

### GET /healthz

```json
{"ok": true, "remoteAvailable": true}
```

### GET /version

Node.jsサーバーでは、サービス名と利用可能なRenderデプロイ情報を返します。未設定の値は `null` です。

### POST /v1/reactions

`Content-Type: application/json` を指定します。

```json
{
  "speaker": "SAYO",
  "userMessage": "今日はちょっと疲れたよ",
  "context": {},
  "turn": { "order": ["SAYO"] }
}
```

- `speaker`：`SAYO` または `NurseT`
- `userMessage`：ユーザーのメッセージ。最大600文字
- `context`：会話やキャラクターの文脈。以前の発言は `previousLines` に含められます
- `turn.order`：発言者の順番。先頭は `speaker` と一致させ、最大3件

成功時は `{ "ok": true, "reaction": ... }` を返します。`reaction` には `text`、`emotion`、`event`、発言一覧 `messages` が含まれます。失敗時は `{ "ok": false, "error": "エラーコード" }` の形式です。

APIキー未設定、上流の利用制限、タイムアウトなどはエラーコードで通知します。詳細は [backend/WORKERS.md](backend/WORKERS.md) を参照してください。

## テスト

```bash
cd backend/backend
npm test
```

テストにはモックを使い、実際の有料API呼び出しは行いません。2026年11月21日の確認では **72件中69件成功、3件失敗**しました。失敗したテストは構造化出力とreasoning設定に関するものです。

## Cloudflare Workers

`backend/backend/wrangler.jsonc` にWorkerの設定があります。APIキーはCloudflareのSecretとして `OPENAI_API_KEY` を設定してください。モデルは `OPENAI_MODEL` で変更できます。既定モデルは `openai-client.mjs` の `DEFAULT_MODEL` を参照してください。

詳しい手順・運用方法は [backend/WORKERS.md](backend/WORKERS.md) にあります。デプロイやAPI利用にはサービス提供者の利用条件・料金が適用されます。

## プライバシーと運用

会話生成ではユーザーのメッセージと送信された会話コンテキストがOpenAI APIへ送られます。送信内容は必要最小限にし、リクエスト本文や認証情報をログに残さないでください。`store: false` はAPIへの設定であり、サービス全体のデータ取り扱い条件に代わるものではありません。

Workersの簡易レート制限は認証や利用料金の上限を保証しません。公開運用では別途アクセス制御や利用量管理が必要です。

## ライセンス・キャラクター素材

このリポジトリにライセンスファイルはありません。コードの再利用・再配布は権利者に確認してください。キャラクターや音声を別途使う場合も、各権利者の利用規約を確認してください。
