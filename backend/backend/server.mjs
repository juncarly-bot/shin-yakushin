import http from 'node:http';
import {pathToFileURL} from 'node:url';
import {createOpenAIReaction, RemoteAIError} from './openai-client.mjs';

const MAX_BODY = 64 * 1024;
const buckets = new Map();

function json(res, status, value) {
  const raw = JSON.stringify(value);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(raw),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  });
  res.end(raw);
}

function allowed(ip, now = Date.now()) {
  const previous = buckets.get(ip);
  const bucket = !previous || now - previous.since >= 60_000 ? {since: now, count: 0} : previous;
  bucket.count += 1; buckets.set(ip, bucket);
  return bucket.count <= Number(process.env.REQUESTS_PER_MINUTE ?? 30);
}

async function readJson(req) {
  if (!(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) throw new RemoteAIError('content_type_required', 415);
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new RemoteAIError('request_too_large', 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new RemoteAIError('invalid_json', 400); }
}

export function createServer(dependencies = {}) {
  return http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/healthz') return json(res, 200, {ok: true, remoteAvailable: Boolean(dependencies.apiKey ?? process.env.OPENAI_API_KEY)});
    // Which code is actually serving. Render injects RENDER_GIT_COMMIT on every deploy,
    // and without it there is no way to tell a live deploy from a pushed-but-undeployed
    // commit: the service exposes no other build identity, and behavioural probes are
    // ambiguous because the reply-target prompt only shifts generation statistically.
    // Read-only, no request body, no dependency on the model provider.
    if (req.method === 'GET' && req.url === '/version') return json(res, 200, {
      ok: true,
      service: 'shin-yakushin-remote-ai',
      commit: process.env.RENDER_GIT_COMMIT ?? null,
      deployedAt: process.env.RENDER_DEPLOY_ID ?? null
    });
    if (req.method !== 'POST' || req.url !== '/v1/reactions') return json(res, 404, {ok: false, error: 'not_found'});
    const ip = req.socket.remoteAddress ?? 'unknown';
    if (!allowed(ip)) return json(res, 429, {ok: false, error: 'rate_limited'});
    try {
      const reaction = await createOpenAIReaction(await readJson(req), dependencies);
      return json(res, 200, {ok: true, reaction});
    } catch (error) {
      const safe = error instanceof RemoteAIError ? error : new RemoteAIError('backend_unavailable');
      return json(res, safe.status, {ok: false, error: safe.code});
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 8787);
  createServer().listen(port, '0.0.0.0', () => console.log(`RemoteAI backend listening on ${port}`));
}

