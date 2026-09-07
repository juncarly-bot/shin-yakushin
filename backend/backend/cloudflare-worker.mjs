import {createOpenAIReaction, DEFAULT_MODEL, RemoteAIError} from './openai-client.mjs';

const MAX_BODY = 64 * 1024;
const MAX_BUCKETS = 1024;

function reply(status, value) {
  return new Response(JSON.stringify(value), {status, headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer'
  }});
}

async function readJson(request) {
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    throw new RemoteAIError('content_type_required', 415);
  }
  if (Number(request.headers.get('content-length')) > MAX_BODY) throw new RemoteAIError('request_too_large', 413);
  const reader = request.body?.getReader();
  const chunks = [];
  let size = 0;
  if (reader) {
    try {
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BODY) {
          await reader.cancel();
          throw new RemoteAIError('request_too_large', 413);
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new RemoteAIError('invalid_json', 400); }
}

export function createWorker(dependencies = {}) {
  // Best-effort per-isolate throttling; no paid storage or global quota service.
  const buckets = new Map();
  function allowed(ip, now = Date.now()) {
    for (const [key, bucket] of buckets) if (now - bucket.since >= 60_000) buckets.delete(key);
    if (!buckets.has(ip)) {
      if (buckets.size >= MAX_BUCKETS) return false;
      buckets.set(ip, {since: now, count: 0});
    }
    const bucket = buckets.get(ip);
    bucket.count += 1;
    return bucket.count <= 30;
  }
  return {async fetch(request, env = {}) {
    const path = new URL(request.url).pathname;
    if (request.method === 'GET' && path === '/healthz') return reply(200, {ok: true, remoteAvailable: Boolean(env.OPENAI_API_KEY)});
    if (request.method !== 'POST' || path !== '/v1/reactions') return reply(404, {ok: false, error: 'not_found'});
    if (!allowed(request.headers.get('cf-connecting-ip') ?? 'unknown')) return reply(429, {ok: false, error: 'rate_limited'});
    try {
      const reaction = await createOpenAIReaction(await readJson(request), {
        ...dependencies,
        apiKey: env.OPENAI_API_KEY ?? '',
        model: env.OPENAI_MODEL || DEFAULT_MODEL
      });
      return reply(200, {ok: true, reaction});
    } catch (error) {
      const safe = error instanceof RemoteAIError ? error : new RemoteAIError('backend_unavailable');
      return reply(safe.status, {ok: false, error: safe.code});
    }
  }};
}

export default createWorker();
