# Remote AI on Cloudflare Workers

The Worker and Render server share `backend/openai-client.mjs`: character instructions,
request validation, strict JSON Schema, output parsing, timeout and error normalization.
The default model is defined once as `DEFAULT_MODEL`; set `OPENAI_MODEL` to override it.
The verified request uses 1200 output tokens, minimal reasoning and `store: false`.

## Deploy and secrets

Run Wrangler from `backend/backend`: `npx wrangler deploy`.
For a dashboard deployment, use `npx wrangler deploy --dry-run --outdir <temporary-directory>`
and deploy the resulting bundled JavaScript in the Worker editor. Use the compatibility
date in `wrangler.jsonc`. Do not upload the source map or any credentials.

In Cloudflare Dashboard, select `shin-yakushin-remote-ai` > Settings > Variables and Secrets
> Add > type **Secret**, name **OPENAI_API_KEY**. Enter the value directly in that UI
and deploy. Never put the value in source, vars, a terminal command, Git or test evidence.
Missing Secret is safe: health reports `remoteAvailable: false` and valid reaction
requests receive HTTP 503 with `remote_not_configured`.

Keep the Workers Free plan and the Render service running. No database, KV, Durable
Object, paid rate-limit service or billing change is required. Observability emits
allowlisted Responses API metadata only. Keep invocation/request logging disabled;
never add request bodies, headers, API error messages or generated text to logs.

## HTTP contract

- `GET /healthz`: `{ok: true, remoteAvailable: boolean}` (Secret presence, not an API probe).
- `POST /v1/reactions`: `{speaker: "SAYO" | "NurseT", userMessage: string, context: object}`.
- Success: HTTP 200, `{ok: true, reaction: {text, emotion, event}}`.
- Failure: `{ok: false, error: code}`, preserving the Render/LocalRules fallback contract.
- OpenAI HTTP 429, including insufficient quota: HTTP 503 / `upstream_rate_limited`.
- Timeout: HTTP 504 / `upstream_timeout`. Incomplete or invalid output: HTTP 503 /
  `invalid_upstream_output`. Other upstream failures: HTTP 503 / `upstream_unavailable`.

The Worker checks actual streamed request bytes against 64 KiB, not just Content-Length.
Basic rate limiting allows 30 reaction requests/minute/IP per isolate, with bounded
in-memory buckets. It resets on isolate eviction and is not a global spend cap or
authentication mechanism. It stores no persistent user data and logs no IP addresses.

Run `npm test` from `backend/backend`. Tests use fake credentials and mocked upstreams;
they verify Worker/Render parity, secret-safe diagnostics, timeouts, quota failures,
incomplete output, size limits and rate limiting without paid API calls.

After deployment, verify health and one real request each for SAYO and NurseT, then
give Android the Worker `/v1/reactions` URL. No OpenAI credential belongs in Android.
