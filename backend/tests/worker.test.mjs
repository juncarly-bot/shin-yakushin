import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorker} from '../backend/cloudflare-worker.mjs';
import {createServer} from '../backend/server.mjs';
import {DEFAULT_MODEL} from '../backend/openai-client.mjs';

const env = {OPENAI_API_KEY: 'PRIVATE_KEY_SENTINEL'};
const payload = {speaker: 'SAYO', userMessage: 'PRIVATE_MESSAGE_SENTINEL', context: {note: 'PRIVATE_CONTEXT_SENTINEL'}};
const reaction = {text: 'PRIVATE_OUTPUT_SENTINEL', emotion: 'pleased', event: 'conversation'};
const completed = {status: 'completed', model: DEFAULT_MODEL, output: [{type: 'message', status: 'completed', content: [{type: 'output_text', text: JSON.stringify(reaction)}]}]};
const mock = (body = completed, status = 200) => async () => new Response(JSON.stringify(body), {status});
const post = (body = payload, headers = {}) => new Request('https://unit.test/v1/reactions', {method: 'POST', headers: {'content-type': 'application/json', ...headers}, body: typeof body === 'string' ? body : JSON.stringify(body)});

test('Worker and Render send identical OpenAI requests and return identical reactions', async () => {
  const bodies = [];
  const fetchImpl = async (url, init) => { bodies.push(JSON.parse(init.body)); return mock()(); };
  const worker = createWorker({fetchImpl});
  const server = createServer({apiKey: env.OPENAI_API_KEY, model: DEFAULT_MODEL, fetchImpl});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    for (const speaker of ['SAYO', 'NurseT']) {
      const body = {...payload, speaker};
      const workerResult = await worker.fetch(post(body), env);
      const renderResult = await fetch(`http://127.0.0.1:${server.address().port}/v1/reactions`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)});
      assert.equal(workerResult.status, renderResult.status);
      assert.deepEqual(await workerResult.json(), await renderResult.json());
      assert.deepEqual(bodies.at(-2), bodies.at(-1));
      assert.equal(bodies.at(-1).model, DEFAULT_MODEL);
      assert.equal(bodies.at(-1).store, false);
      assert.equal(bodies.at(-1).max_output_tokens, 1200);
      assert.deepEqual(bodies.at(-1).reasoning, {effort: 'minimal'});
      assert.equal(bodies.at(-1).text.format.strict, true);
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('Worker health and missing Secret do not use process credentials', async () => {
  const worker = createWorker({fetchImpl: () => { throw Error('must not fetch'); }});
  for (const [bindings, available] of [[{}, false], [env, true]]) {
    assert.deepEqual(await (await worker.fetch(new Request('https://unit.test/healthz'), bindings)).json(), {ok: true, remoteAvailable: available});
  }
  const res = await worker.fetch(post(), {});
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), {ok: false, error: 'remote_not_configured'});
});

test('Worker rejects malformed JSON, invalid speakers and oversized streamed bodies before OpenAI', async () => {
  let calls = 0;
  const worker = createWorker({fetchImpl: async () => { calls++; return mock()(); }});
  for (const [request, status, error] of [
    [post('{'), 400, 'invalid_json'],
    [post({...payload, speaker: 'other'}), 400, 'invalid_speaker'],
    [post({...payload, userMessage: ''}), 400, 'missing_message'],
    [post(payload, {'content-type': 'text/plain'}), 415, 'content_type_required'],
    [post(payload, {'content-length': '65537'}), 413, 'request_too_large'],
    [post({...payload, context: {note: 'x'.repeat(65536)}}), 413, 'request_too_large']
  ]) {
    const res = await worker.fetch(request, env);
    assert.equal(res.status, status);
    assert.deepEqual(await res.json(), {ok: false, error});
  }
  let cancelled = false;
  const stream = new ReadableStream({start(controller) { controller.enqueue(new Uint8Array(65537)); }, cancel() { cancelled = true; }});
  const streamed = new Request('https://unit.test/v1/reactions', {method: 'POST', headers: {'content-type': 'application/json'}, body: stream, duplex: 'half'});
  assert.equal((await worker.fetch(streamed, env)).status, 413);
  assert.equal(cancelled, true);
  assert.equal(calls, 0);
});

test('Worker preserves normalized upstream failures and does not leak payloads', async () => {
  const logs = [];
  const original = console.info;
  console.info = value => logs.push(value);
  try {
    for (const [fetchImpl, status, code] of [
      [mock({error: {code: 'insufficient_quota', message: 'PRIVATE_ERROR_SENTINEL'}}, 429), 503, 'upstream_rate_limited'],
      [mock({error: {message: 'PRIVATE_ERROR_SENTINEL'}}, 500), 503, 'upstream_unavailable'],
      [async () => new Response('PRIVATE_BAD_JSON_SENTINEL'), 503, 'upstream_unavailable'],
      [mock({...completed, status: 'incomplete'}), 503, 'invalid_upstream_output'],
      [mock({...completed, output: []}), 503, 'invalid_upstream_output'],
      [mock({...completed, output: [{type: 'message', content: [{type: 'refusal', refusal: 'PRIVATE_REFUSAL_SENTINEL'}]}]}), 503, 'invalid_upstream_output'],
      [(url, {signal}) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('PRIVATE_TIMEOUT_SENTINEL', 'AbortError')))), 504, 'upstream_timeout']
    ]) {
      const result = await createWorker({fetchImpl, timeoutMs: 5}).fetch(post(), env);
      assert.equal(result.status, status);
      assert.deepEqual(await result.json(), {ok: false, error: code});
    }
    await createWorker({fetchImpl: mock()}).fetch(post(), env);
    assert.doesNotMatch(logs.join(''), /PRIVATE_|Authorization|Bearer/i);
  } finally { console.info = original; }
});

test('Worker throttles before paid calls and supports a model override', async () => {
  let calls = 0;
  const worker = createWorker({fetchImpl: async (url, init) => {
    calls++;
    assert.equal(JSON.parse(init.body).model, 'gpt-4.1-mini');
    return mock()();
  }});
  for (let i = 0; i < 30; i++) assert.equal((await worker.fetch(post(), {...env, OPENAI_MODEL: 'gpt-4.1-mini'})).status, 200);
  const limited = await worker.fetch(post(), env);
  assert.equal(limited.status, 429);
  assert.deepEqual(await limited.json(), {ok: false, error: 'rate_limited'});
  assert.equal(calls, 30);
});
