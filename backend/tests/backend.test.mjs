import test from 'node:test';
import assert from 'node:assert/strict';
import {createOpenAIReaction} from '../backend/openai-client.mjs';
import {createServer} from '../backend/server.mjs';

const request = {speaker: 'SAYO', userMessage: 'PRIVATE_MESSAGE_SENTINEL', context: {memory: 'PRIVATE_CONTEXT_SENTINEL'}};
// The reaction keeps its legacy text/emotion/event fields and now also carries the
// plan-authoritative `messages` bundle. Both are pinned in full so the wire contract
// stays strict instead of being asserted as a subset.
const reaction = {text: 'PRIVATE_OUTPUT_SENTINEL', emotion: 'pleased', event: 'conversation',
  messages: [{speaker: 'SAYO', text: 'PRIVATE_OUTPUT_SENTINEL', emotion: 'pleased'}]};
const reactionFor = speaker => ({...reaction, messages: [{speaker, text: 'PRIVATE_OUTPUT_SENTINEL', emotion: 'pleased'}]});
const completed = {
  status: 'completed', model: 'gpt-5-mini-2025-08-07', store: false,
  incomplete_details: null, max_output_tokens: 1200,
  text: {format: {type: 'json_schema'}},
  output: [{type: 'reasoning', summary: []}, {type: 'message', status: 'completed', content: [{type: 'output_text', text: JSON.stringify(reaction)}]}],
  usage: {output_tokens: 200, output_tokens_details: {reasoning_tokens: 100}}
};
const mock = (body, status = 200) => async () => new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json'}});

test('SAYO and NurseT preserve structured output, store=false and reaction contract', async () => {
  for (const speaker of ['SAYO', 'NurseT']) {
    const result = await createOpenAIReaction({...request, speaker}, {
      apiKey: 'PRIVATE_KEY_SENTINEL',
      fetchImpl: async (url, init) => {
        assert.equal(url, 'https://api.openai.com/v1/responses');
        const body = JSON.parse(init.body);
        assert.equal(body.store, false);
        assert.equal(body.max_output_tokens, 1200);
        assert.deepEqual(body.reasoning, {effort: 'minimal'});
        assert.equal(body.text.format.type, 'json_schema');
        assert.equal(body.text.format.strict, true);
        assert.equal(JSON.parse(body.input[0].content[0].text).speaker, speaker);
        return mock(completed)();
      }
    });
    assert.deepEqual(result, reactionFor(speaker));
    // The local plan stays authoritative: one planned speaker means one message.
    assert.equal(result.messages.length, 1);
    assert.equal(result.text, result.messages[0].text);
  }
});

test('diagnostics contain metadata, never key, headers, input, context or output text', async () => {
  const logs = [];
  const original = console.info;
  console.info = value => logs.push(value);
  try {
    await createOpenAIReaction(request, {apiKey: 'PRIVATE_KEY_SENTINEL', fetchImpl: mock(completed)});
    const log = JSON.parse(logs[0]);
    assert.equal(log.http_status, 200);
    assert.equal(log.status, 'completed');
    assert.equal(log.reasoning_tokens, 100);
    assert.deepEqual(log.output[1].content_types, ['output_text']);
    assert.equal(log.store, false);
    assert.doesNotMatch(logs.join(''), /PRIVATE_|Authorization|Bearer/i);
  } finally { console.info = original; }
});

test('reasoning-only incomplete response preserves invalid_upstream_output fallback', async () => {
  const incomplete = {...completed, status: 'incomplete', incomplete_details: {reason: 'max_output_tokens'}, output: [{type: 'reasoning', summary: []}], usage: {output_tokens: 300, output_tokens_details: {reasoning_tokens: 300}}};
  await assert.rejects(createOpenAIReaction(request, {apiKey: 'test', fetchImpl: mock(incomplete)}), {code: 'invalid_upstream_output', status: 503});
});

test('observed 300-token exhaustion with 256 reasoning tokens rejects truncated JSON', async () => {
  const incomplete = {...completed, status: 'incomplete', max_output_tokens: 300,
    incomplete_details: {reason: 'max_output_tokens'},
    output: [{type: 'reasoning', summary: []}, {type: 'message', status: 'incomplete', content: [{type: 'output_text', text: '{"text":"unfinished'}]}],
    usage: {output_tokens: 300, output_tokens_details: {reasoning_tokens: 256}}
  };
  await assert.rejects(createOpenAIReaction(request, {apiKey: 'test', fetchImpl: mock(incomplete)}), {code: 'invalid_upstream_output', status: 503});
  await assert.rejects(createOpenAIReaction(request, {apiKey: 'test', fetchImpl: mock({...incomplete, output: completed.output})}), {code: 'invalid_upstream_output', status: 503});
});

test('model override does not receive an unsupported reasoning parameter', async () => {
  await createOpenAIReaction(request, {apiKey: 'test', model: 'gpt-4.1-mini', fetchImpl: async (url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(body.model, 'gpt-4.1-mini');
    assert.equal(body.reasoning, undefined);
    return mock(completed)();
  }});
});

test('upstream HTTP failures preserve fallback codes and do not log error payloads', async () => {
  for (const [status, code] of [[429, 'upstream_rate_limited'], [500, 'upstream_unavailable']]) {
    await assert.rejects(createOpenAIReaction(request, {apiKey: 'test', fetchImpl: mock({error: {message: 'PRIVATE_ERROR_SENTINEL'}}, status)}), {code, status: 503});
  }
});

test('timeout and missing key preserve fallback contract', async () => {
  await assert.rejects(createOpenAIReaction(request, {apiKey: ''}), {code: 'remote_not_configured', status: 503});
  await assert.rejects(createOpenAIReaction(request, {apiKey: 'test', timeoutMs: 5, fetchImpl: (url, {signal}) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('PRIVATE_ERROR_SENTINEL', 'AbortError'))))}), {code: 'upstream_timeout', status: 504});
});

test('HTTP health, success, failure envelope and input validation', async () => {
  let upstream = completed;
  const server = createServer({apiKey: 'test', fetchImpl: async () => mock(upstream)()});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.deepEqual(await (await fetch(`${base}/healthz`)).json(), {ok: true, remoteAvailable: true});
    // Which commit is serving. Without this there is no way to tell a live deploy from
    // a pushed-but-undeployed one, because the reply-target contract only shifts
    // generation statistically and the service exposes no other build identity.
    const version = await (await fetch(`${base}/version`)).json();
    assert.equal(version.ok, true);
    assert.equal(version.service, 'shin-yakushin-remote-ai');
    assert.ok('commit' in version && 'deployedAt' in version);
    assert.equal(JSON.stringify(version).includes('PRIVATE_ERROR_SENTINEL'), false);
    const post = body => fetch(`${base}/v1/reactions`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)});
    for (const speaker of ['SAYO', 'NurseT']) {
      const res = await post({...request, speaker});
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), {ok: true, reaction: reactionFor(speaker)});
    }
    upstream = {...completed, output: []};
    const failed = await post(request);
    assert.equal(failed.status, 503);
    assert.deepEqual(await failed.json(), {ok: false, error: 'invalid_upstream_output'});
    const invalid = await post({...request, speaker: 'invalid'});
    assert.equal(invalid.status, 400);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
