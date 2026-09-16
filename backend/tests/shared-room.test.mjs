/**
 * Shared-room backend contract.
 *
 * The Android client owns who may speak and in what order. This backend only phrases
 * content for the speaker it was asked about, so these tests pin three things that a
 * regression would break silently because the client tolerates legacy responses:
 *
 *   1. the local `turn` plan survives the round trip unmodified;
 *   2. the second companion is told what the first one actually said;
 *   3. every failure rejects the whole bundle instead of committing half of it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createOpenAIReaction, sanitizeRequest, DEFAULT_MODEL} from '../backend/openai-client.mjs';
import {createServer} from '../backend/server.mjs';
import {createWorker} from '../backend/cloudflare-worker.mjs';

const plan = order => ({order, allowedSpeakers: [...new Set(order)], maxMessages: order.length});
const sent = captured => JSON.parse(captured.input[0].content[0].text);
const body = messages => JSON.stringify({text: messages[0].text, emotion: messages[0].emotion, event: 'conversation', messages});
const upstream = (messages, status = 'completed') => async () => new Response(JSON.stringify({
  status, model: DEFAULT_MODEL, store: false,
  output: [{type: 'message', status: 'completed', content: [{type: 'output_text', text: body(messages)}]}]
}), {status: 200, headers: {'content-type': 'application/json'}});

/** Runs one request and hands back both the OpenAI request body and the parsed reaction. */
async function run(request, messages, options = {}) {
  let captured = null;
  const result = await createOpenAIReaction(request, {apiKey: 'PRIVATE_KEY_SENTINEL', ...options,
    fetchImpl: async (url, init) => { captured = JSON.parse(init.body); return upstream(messages)(); }});
  return {captured, result};
}

test('the local turn plan survives the round trip unmodified', async () => {
  const turn = plan(['SAYO', 'NurseT']);
  const context = {previousLines: [], request: {conversationDepth: 'NORMAL', causalOrder: true, reason: null}};
  const {captured} = await run(
    {speaker: 'SAYO', userMessage: 'でっかい車乗りたい', turn, context},
    [{speaker: 'SAYO', text: 'a', emotion: 'pleased'}, {speaker: 'NurseT', text: 'b', emotion: 'calm'}]);
  assert.deepEqual(sent(captured).turn, {order: turn.order, maxMessages: 2});
  assert.deepEqual(sent(captured).context, context);
  assert.deepEqual(captured.text.format.schema.properties.messages.items.properties.speaker.enum, ['SAYO', 'NurseT']);
  assert.equal(captured.text.format.schema.properties.messages.maxItems, 3);
});

test('a multi-speaker plan returns every planned line in plan order', async () => {
  const {result} = await run(
    {speaker: 'SAYO', userMessage: 'でっかい車乗りたい', turn: plan(['SAYO', 'NurseT']), context: {}},
    [{speaker: 'SAYO', text: 'a', emotion: 'pleased'}, {speaker: 'NurseT', text: 'b', emotion: 'calm'}]);
  assert.deepEqual(result.messages.map(m => m.speaker), ['SAYO', 'NurseT']);
  assert.deepEqual(result.messages.map(m => m.text), ['a', 'b']);
  // The legacy fields stay coherent with the bundle for older clients.
  assert.equal(result.text, 'a');
  assert.equal(result.emotion, 'pleased');
  assert.equal(result.event, 'conversation');
});

test('the second companion is told what the first one actually said', async () => {
  const previousLines = [{speaker: 'SAYO', text: '私は毎日使うなら駐車場が気になるな'}];
  const {captured} = await run(
    {speaker: 'NurseT', userMessage: 'でっかい車乗りたい', turn: plan(['NurseT']), context: {previousLines}},
    [{speaker: 'NurseT', text: 'b', emotion: 'calm'}]);
  const instructions = captured.instructions;
  assert.match(instructions, /先に小夜が話しました/);
  assert.match(instructions, /相手が実際に言った内容に触れ/);
  assert.match(instructions, /相手と同じ質問を繰り返さないでください/);
  assert.match(instructions, /相手の発言を無視してユーザーへ最初から答え直さないでください/);
});

test('an empty previousLines means nobody has spoken, so no causal claim is made', async () => {
  const {captured} = await run(
    {speaker: 'SAYO', userMessage: '猫いた', turn: plan(['SAYO']), context: {previousLines: []}},
    [{speaker: 'SAYO', text: 'a', emotion: 'pleased'}]);
  assert.doesNotMatch(captured.instructions, /先に.+が話しました/);
  assert.doesNotMatch(captured.instructions, /相手が実際に言った内容に触れ/);
  // `conversation` is the room snapshot from earlier turns and must never be used as a
  // substitute for "someone spoke this turn".
  const {captured: snapshotOnly} = await run(
    {speaker: 'SAYO', userMessage: '猫いた', turn: plan(['SAYO']),
      context: {conversation: {messages: [{speaker: 'NurseT', text: 'さっきの話'}]}}},
    [{speaker: 'SAYO', text: 'a', emotion: 'pleased'}]);
  assert.doesNotMatch(snapshotOnly.instructions, /相手が実際に言った内容に触れ/);
});

test('both companions are briefed with the same shared-room rules', async () => {
  const rules = [
    /ここはユーザー・小夜・ナースロボ＿タイプＴが同じ部屋で話している会話です/,
    /質問は会話を続ける既定の手段ではありません/,
    /二人ともユーザーに質問してはいけません/,
    /同じ内容を順番に言うパネル討論のような形にしないでください/,
    /意見を無理に分けないでください/,
    /学習の話題でないときに学習や行動を促さないでください/
  ];
  const seen = [];
  for (const speaker of ['SAYO', 'NurseT']) {
    const {captured} = await run({speaker, userMessage: '猫いた', turn: plan([speaker]), context: {}},
      [{speaker, text: 'a', emotion: 'calm'}]);
    seen.push(captured.instructions);
    for (const rule of rules) assert.match(captured.instructions, rule);
  }
  const roomRule = source => source.slice(source.indexOf('ここはユーザー'), source.indexOf('返答は通常180文字以内'));
  assert.equal(roomRule(seen[0]), roomRule(seen[1]));
});

test('a plan that does not start with the requested speaker is collapsed, never honoured', () => {
  assert.deepEqual(sanitizeRequest({speaker: 'SAYO', userMessage: 'x', turn: plan(['NurseT', 'SAYO'])}).turn,
    {order: ['SAYO'], maxMessages: 1});
  assert.deepEqual(sanitizeRequest({speaker: 'NurseT', userMessage: 'x', turn: plan(['NurseT', 'SAYO'])}).turn,
    {order: ['NurseT', 'SAYO'], maxMessages: 2});
  // A plan may never grow past the three-message room bound, and unknown ids are dropped.
  assert.deepEqual(sanitizeRequest({speaker: 'SAYO', userMessage: 'x', turn: plan(['SAYO', 'NurseT', 'SAYO', 'NurseT', 'SAYO'])}).turn,
    {order: ['SAYO', 'NurseT', 'SAYO'], maxMessages: 3});
  assert.deepEqual(sanitizeRequest({speaker: 'SAYO', userMessage: 'x', turn: plan(['SAYO', 'USER'])}).turn,
    {order: ['SAYO'], maxMessages: 1});
});

test('speaker identity comes from the plan and an unknown speaker rejects the bundle', async () => {
  // The model never chooses who speaks; the plan does.
  const {result} = await run({speaker: 'SAYO', userMessage: 'x', turn: plan(['SAYO']), context: {}},
    [{speaker: 'NurseT', text: 'a', emotion: 'calm'}]);
  assert.deepEqual(result.messages.map(m => m.speaker), ['SAYO']);
  // An unidentified speaker is a malformed bundle, not something to repair.
  await assert.rejects(createOpenAIReaction({speaker: 'SAYO', userMessage: 'x', turn: plan(['SAYO']), context: {}},
    {apiKey: 'k', fetchImpl: upstream([{speaker: 'USER', text: 'a', emotion: 'calm'}])}),
    {code: 'invalid_upstream_output', status: 503});
});

test('one malformed line rejects the whole bundle instead of committing half of it', async () => {
  for (const messages of [
    [{speaker: 'SAYO', text: 'a', emotion: 'calm'}, {speaker: 'NurseT', text: '   ', emotion: 'calm'}],
    [{speaker: 'SAYO', text: 'a', emotion: 'calm'}, {speaker: 'UNKNOWN', text: 'b', emotion: 'calm'}],
    [{speaker: 'SAYO', text: 'a', emotion: 'calm'}, {text: 'b', emotion: 'calm'}]
  ]) {
    await assert.rejects(createOpenAIReaction({speaker: 'SAYO', userMessage: 'x', turn: plan(['SAYO', 'NurseT']), context: {}},
      {apiKey: 'k', fetchImpl: upstream(messages)}), {code: 'invalid_upstream_output', status: 503});
  }
});

test('legacy single-reaction clients still get one bounded message', async () => {
  const {captured, result} = await run({speaker: 'NurseT', userMessage: '休憩しよう', context: {}},
    [{speaker: 'NurseT', text: '休みましょう', emotion: 'relaxed'}]);
  assert.equal(sent(captured).turn.order.length, 1);
  assert.equal(result.text, '休みましょう');
  assert.deepEqual(result.messages, [{speaker: 'NurseT', text: '休みましょう', emotion: 'relaxed'}]);
});

test('the room fix keeps the verified output budget and never widens the schema', async () => {
  const {captured} = await run({speaker: 'SAYO', userMessage: 'x', turn: plan(['SAYO']), context: {}},
    [{speaker: 'SAYO', text: 'a', emotion: 'calm'}]);
  assert.equal(captured.max_output_tokens, 1200);
  assert.deepEqual(captured.reasoning, {effort: 'minimal'});
  assert.equal(captured.store, false);
  assert.equal(captured.text.format.strict, true);
  assert.equal(captured.text.format.schema.additionalProperties, false);
  assert.deepEqual(captured.text.format.schema.required, ['text', 'emotion', 'event', 'messages']);
});

test('companion instructions never carry secrets, user text or context text', async () => {
  const {captured} = await run({speaker: 'SAYO', userMessage: 'PRIVATE_MESSAGE_SENTINEL',
    turn: plan(['SAYO']), context: {memory: 'PRIVATE_CONTEXT_SENTINEL'}},
    [{speaker: 'SAYO', text: 'a', emotion: 'calm'}]);
  assert.doesNotMatch(captured.instructions, /PRIVATE_|Bearer|OPENAI/);
  // The user text and context still reach the model as data, which is what they are for.
  assert.equal(sent(captured).userMessage, 'PRIVATE_MESSAGE_SENTINEL');
});

test('the Worker returns the same multi-speaker bundle as the Render server', async () => {
  const request = {speaker: 'SAYO', userMessage: 'でっかい車乗りたい', turn: plan(['SAYO', 'NurseT']), context: {}};
  const messages = [{speaker: 'SAYO', text: 'a', emotion: 'pleased'}, {speaker: 'NurseT', text: 'b', emotion: 'calm'}];
  const worker = createWorker({fetchImpl: upstream(messages)});
  const workerResponse = await worker.fetch(new Request('https://unit.test/v1/reactions', {method: 'POST',
    headers: {'content-type': 'application/json'}, body: JSON.stringify(request)}), {OPENAI_API_KEY: 'worker-secret'});
  assert.equal(workerResponse.status, 200);
  const workerReaction = (await workerResponse.json()).reaction;

  const server = createServer({apiKey: 'server-secret', fetchImpl: upstream(messages)});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/reactions`, {method: 'POST',
      headers: {'content-type': 'application/json'}, body: JSON.stringify(request)});
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).reaction, workerReaction);
  } finally { await new Promise(resolve => server.close(resolve)); }
  assert.deepEqual(workerReaction.messages.map(m => m.speaker), ['SAYO', 'NurseT']);
});
