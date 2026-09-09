# Remote AI integration

## Boundary

Remote AI is optional. The default Android resource contains no backend URL and the setting is OFF, so the existing `LocalRulesProvider` remains the complete offline path.

When enabled, the flow is:

1. `ContextAssembler` creates a detached, read-only snapshot of `ConversationState`, `CharacterState`, selected Memory, Study Context, Conversation Depth, Relationship and the locally selected speaker.
2. `RemoteAIProvider` sends that snapshot to the Android JavaScript bridge.
3. `RemoteAIClient` posts it to the operator-owned HTTPS endpoint.
4. The backend alone reads `OPENAI_API_KEY` from its process environment and calls the OpenAI Responses API with `store: false`.
5. The backend returns only `{text, emotion, event}`. Android keeps the locally selected SAYO/NurseT speaker and may replace only the pending dialogue message.
6. VOICEVOX receives the final text after replacement. Study domain logic never enters the voice or remote provider.

The Android WebView retains `connect-src 'none'`. `RemoteAIClient` rejects non-HTTPS endpoints and rejects `openai.com` hosts, so the app cannot call OpenAI directly.

## Recommended personal deployment: Cloudflare Workers

This is the smallest personal-use setup: one stateless Worker, no database, no account system, no analytics, and no always-running server. Cloudflare provides the HTTPS `workers.dev` endpoint. `backend/cloudflare-worker.mjs` is a standalone Worker and `backend/wrangler.jsonc` is included for repository/CLI deployment.

Phone-only Dashboard flow:

1. Sign in to Cloudflare and open **Workers & Pages → Create application → Worker**.
2. Replace the starter code with `backend/cloudflare-worker.mjs` and deploy it.
3. Open **Settings → Variables and Secrets → Add**. Choose **Secret**, name it `OPENAI_API_KEY`, enter the value there, and deploy the new version. Never put the value in Worker source or `wrangler.jsonc`.
4. Copy the public URL and append `/v1/reactions`.
5. In 新躍進政策, open **設定・バックアップ**, paste that public URL into **Remote AI Backend URL**, turn on **会話の拡張を使う**, and save.

Optional non-secret variable: `OPENAI_MODEL`. The included low-cost default is `gpt-5-mini`. The Worker health endpoint is `/healthz` and reveals only whether the secret binding exists.

The Android app stores only the public Backend URL in a dedicated preferences file. It rejects HTTP, embedded credentials, query strings, fragments, and direct OpenAI hosts. It never accepts an API key.

## Alternative Node deployment

Requires Node.js 20 or newer and an HTTPS reverse proxy or HTTPS application platform.

```sh
cd backend
export OPENAI_API_KEY='set-in-your-secret-manager'
export OPENAI_MODEL='gpt-5-mini'
export PORT=8787
npm start
```

Do not commit a `.env` file. `backend/.env.example` contains names only. In production, configure the key in the hosting platform's secret manager. Put authentication/attestation and global rate limiting at the gateway if the endpoint is internet-facing; the included server also applies a small per-process rate limit and never logs request bodies.

The public Backend URL can be pasted directly into Android Settings. A deployment resource overlay remains available for a preconfigured private build, but is no longer necessary.

Open Settings and explicitly turn on **会話の拡張を使う**. Until then, no conversation context is sent.

## Personal cost and abuse boundary

No database or paid add-on is required. Keep the endpoint URL private, retain the server-side request bounds, and set a small OpenAI project budget/usage limit. This is intentionally a personal test configuration, not a public multi-user service. If the URL is ever published, add gateway authentication or rate limiting before continuing to use a paid API key.

## Failure behavior

DNS failure, TLS failure, HTTP failure, timeout, malformed output, missing server secret, disabled setting, or missing endpoint all keep the already generated local response. Old responses cannot replace a later user turn. The local text is then passed to the existing VOICEVOX path as usual.

## Data authority

The remote result can update one pending conversation message and its transient emotional state only. It cannot create or mutate StudySession, Reward, Study Bond, Relationship ledger, or Memory. The backend is never a database and the OpenAI response is not a source of truth.
