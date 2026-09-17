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
    // Goal 14 replaced the absolute "neither companion may ask the USER anything"
    // ban. That ban left NurseT with no licensed move on a tiny remark, and the
    // model escaped the dead end by copying the previous line verbatim. The room
    // still refuses the *duplicate* question; it no longer forbids questions.
    /一人目が質問したら、二人目は同じことを聞かずに自分の考えや反応を足してください/,
    /ユーザーの言葉や相手の発言をそのまま繰り返さないでください/,
    /小さな感想・気づいたこと・連想・好み・別の理由での同意・軽い反対・不確かさのどれか/,
    /同じ内容を順番に言うパネル討論のような形にしないでください/,
    /意見を無理に分けないでください/,
    /学習の話題でないときに学習や行動を促さないでください/,
    // Goal 15 closed the first-line coaching gap the Goal 14 audit could not see:
    // nobody looked at line 1, and `眠い` came back as rest advice in all four
    // stored passes. A stated condition is conversation, not a help request.
    /体調や気分をひとこと言っただけのときは/,
    /休憩・睡眠・水分・ストレッチ・体調の話は/,
    /選択肢を並べて聞き返す質問を、毎回しないでください/
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

/**
 * Goal 14 - the bounded echo guard.
 *
 * Measured before this change: NurseT returned the USER's sentence or SAYO's
 * sentence byte-identical in 30 of 98 audited turns, and the client refuses a
 * whole bundle whose only candidate echoed. The guard re-asks at most once with a
 * strengthened instruction and keeps the better answer. It never edits prose, so
 * the remote-only invariant is untouched.
 */
async function echoRun(request, samples) {
  const bodies = [];
  const replies = [...samples];
  const result = await createOpenAIReaction(request, {apiKey: 'PRIVATE_KEY_SENTINEL',
    fetchImpl: async (url, init) => {
      bodies.push(JSON.parse(init.body));
      const next = replies.length > 1 ? replies.shift() : replies[0];
      return typeof next === 'function' ? next() : upstream(next)();
    }});
  return {bodies, result};
}

test('a first answer that repeats the USER verbatim is re-asked once and replaced', async () => {
  const request = {speaker: 'NurseT', userMessage: '猫いた', turn: plan(['NurseT']), context: {previousLines: []}};
  const {bodies, result} = await echoRun(request, [
    [{speaker: 'NurseT', text: '猫いた', emotion: 'calm'}],
    [{speaker: 'NurseT', text: '猫は見かけるだけで、ちょっと得した感じがしますね', emotion: 'relaxed'}]
  ]);
  assert.equal(bodies.length, 2, 'exactly one bounded re-ask');
  assert.equal(result.messages[0].text, '猫は見かけるだけで、ちょっと得した感じがしますね');
  // The base prompt is unchanged; the retry only appends the stronger rule.
  assert.equal(bodies[1].instructions.startsWith(bodies[0].instructions), true);
  assert.match(bodies[1].instructions, /繰り返しただけでした/);
  assert.match(bodies[1].instructions, /この文は使わず/);
});

test('a first answer that repeats the earlier companion is re-asked and replaced', async () => {
  const previousLines = [{speaker: 'SAYO', text: 'そういう日、あるよね。無理しなくていいよ。'}];
  const request = {speaker: 'NurseT', userMessage: '今日は何もしたくない', turn: plan(['NurseT']), context: {previousLines}};
  const {bodies, result} = await echoRun(request, [
    [{speaker: 'NurseT', text: 'そういう日、あるよね。無理しなくていいよ。', emotion: 'calm'}],
    [{speaker: 'NurseT', text: '私も、そういう日は予定をひとつ消します', emotion: 'relaxed'}]
  ]);
  assert.equal(bodies.length, 2);
  assert.equal(result.messages[0].text, '私も、そういう日は予定をひとつ消します');
});

test('an echoing answer is never lost to a persistent echo, an upstream failure or an abort', async () => {
  const request = {speaker: 'NurseT', userMessage: '空がきれい', turn: plan(['NurseT']), context: {previousLines: []}};
  const echo = [{speaker: 'NurseT', text: '空がきれい', emotion: 'calm'}];
  const both = await echoRun(request, [echo, echo]);
  assert.equal(both.bodies.length, 3, 'both re-asks are spent before giving up');
  assert.equal(both.result.messages[0].text, '空がきれい', 'a persistent echo leaves the original in place');
  const failed = await echoRun(request, [echo, async () =>
    new Response('{"ok":false}', {status: 500, headers: {'content-type': 'application/json'}})]);
  assert.equal(failed.result.messages[0].text, '空がきれい', 'a failed re-ask must not lose the working answer');
  const aborted = await echoRun(request, [echo, async () => { const error = new Error('aborted'); error.name = 'AbortError'; throw error; }]);
  assert.equal(aborted.result.messages[0].text, '空がきれい', 'an aborted re-ask must not lose the working answer');
});

test('an echo that survives the first re-ask gets a second one, and that one wins', async () => {
  const request = {speaker: 'NurseT', userMessage: '今日は自炊した', turn: plan(['NurseT']), context: {previousLines: []}};
  const {bodies, result} = await echoRun(request, [
    [{speaker: 'NurseT', text: '今日は自炊した', emotion: 'calm'}],
    [{speaker: 'NurseT', text: '今日は自炊した', emotion: 'calm'}],
    [{speaker: 'NurseT', text: '自炊、いいですね。私は汁物をひとつ足すと満足感が変わります', emotion: 'pleased'}]
  ]);
  assert.equal(bodies.length, 3, 'the second re-ask is reached');
  assert.equal(result.messages[0].text, '自炊、いいですね。私は汁物をひとつ足すと満足感が変わります');
});

test('the re-ask quotes the line it is asking the model to stop copying', async () => {
  const request = {speaker: 'NurseT', userMessage: '猫いた', turn: plan(['NurseT']), context: {previousLines: []}};
  const previousLines = [{speaker: 'SAYO', text: 'そういう日、あるよね。無理しなくていいよ。'}];
  const withCompanion = {speaker: 'NurseT', userMessage: '今日は何もしたくない', turn: plan(['NurseT']), context: {previousLines}};
  const {bodies} = await echoRun(request, [
    [{speaker: 'NurseT', text: '猫いた', emotion: 'calm'}],
    [{speaker: 'NurseT', text: '猫は見かけるだけで得した感じがしますね', emotion: 'relaxed'}]
  ]);
  assert.match(bodies[1].instructions, /「猫いた」/, 'the USER echo is quoted back');
  const companion = await echoRun(withCompanion, [
    [{speaker: 'NurseT', text: 'そういう日、あるよね。無理しなくていいよ。', emotion: 'calm'}],
    [{speaker: 'NurseT', text: '私も、そういう日は予定をひとつ消します', emotion: 'relaxed'}]
  ]);
  assert.match(companion.bodies[1].instructions, /そういう日、あるよね/, 'the companion echo is quoted back too');
});

test('the echo re-ask runs at a higher reasoning effort than the answer it repairs', async () => {
  const request = {speaker: 'NurseT', userMessage: '猫いた', turn: plan(['NurseT']), context: {previousLines: []}};
  const {bodies} = await echoRun(request, [
    [{speaker: 'NurseT', text: '猫いた', emotion: 'calm'}],
    [{speaker: 'NurseT', text: '猫は見かけるだけで得した感じがしますね', emotion: 'relaxed'}]
  ]);
  assert.equal(bodies[0].reasoning.effort, 'minimal', 'the common turn is unchanged');
  assert.equal(bodies[1].reasoning.effort, 'low', 'the repair is given more room');
});

test('a contributing answer costs exactly one upstream call, so the common turn is unchanged', async () => {
  const request = {speaker: 'NurseT', userMessage: '猫いた', turn: plan(['NurseT']), context: {previousLines: []}};
  const {bodies, result} = await echoRun(request, [[{speaker: 'NurseT', text: 'ふわふわの子だった？', emotion: 'pleased'}]]);
  assert.equal(bodies.length, 1, 'no extra call when the first answer contributes');
  assert.equal(result.messages[0].text, 'ふわふわの子だった？');
});

test('a minimal acknowledgement is a contribution, not an echo', async () => {
  const request = {speaker: 'NurseT', userMessage: '猫いた', turn: plan(['NurseT']), context: {previousLines: []}};
  const {bodies, result} = await echoRun(request, [[{speaker: 'NurseT', text: 'それはいいですね。', emotion: 'relaxed'}]]);
  assert.equal(bodies.length, 1, 'a short acknowledgement is never re-asked');
  assert.equal(result.messages[0].text, 'それはいいですね。');
});

test('the echo guard catches punctuation and whitespace differences, not paraphrase', async () => {
  const request = {speaker: 'NurseT', userMessage: '猫いた', turn: plan(['NurseT']), context: {previousLines: []}};
  const {bodies} = await echoRun(request, [
    [{speaker: 'NurseT', text: ' 猫いた。 ', emotion: 'calm'}],
    [{speaker: 'NurseT', text: '猫がいたんだ', emotion: 'pleased'}]
  ]);
  assert.equal(bodies.length, 2, 'punctuation-only difference still counts as a verbatim echo');
});

test('NurseT is licensed positive moves and the absolute question ban is gone', async () => {
  const {captured} = await run({speaker: 'NurseT', userMessage: '猫いた', turn: plan(['NurseT']), context: {}},
    [{speaker: 'NurseT', text: 'a', emotion: 'calm'}]);
  // The dead end Goal 14 removed: an absolute ban with no licensed alternative.
  assert.doesNotMatch(captured.instructions, /二人ともユーザーに質問してはいけません/);
  assert.match(captured.instructions, /ユーザーの言葉や相手の発言をそのまま繰り返さないでください/);
  assert.match(captured.instructions, /小さな好みや感想/);
  // The rules that cut casual over-coaching from 8 to 1 must stay in place.
  assert.match(captured.instructions, /学習の話題でないときに学習や行動を促さないでください/);
  assert.match(captured.instructions, /次に何をするかの提案を毎回しないでください/);
});

test('Goal 15: the two companions are separated by what they notice, not by register', async () => {
  const sayo = await run({speaker: 'SAYO', userMessage: '猫いた', turn: plan(['SAYO']), context: {}},
    [{speaker: 'SAYO', text: 'a', emotion: 'pleased'}]);
  const tt = await run({speaker: 'NurseT', userMessage: '猫いた', turn: plan(['NurseT']), context: {}},
    [{speaker: 'NurseT', text: 'a', emotion: 'calm'}]);
  // The first-line coaching closure, present for BOTH speakers because either may
  // open a casual turn.
  assert.match(sayo.captured.instructions, /体調や気分をひとこと言っただけのときは/);
  assert.match(sayo.captured.instructions, /休憩・睡眠・水分・ストレッチ・体調の話は/);
  assert.match(tt.captured.instructions, /休憩・睡眠・水分・ストレッチ・体調の話は/);
  assert.match(tt.captured.instructions, /選択肢を並べて聞き返す質問を、毎回しないでください/);
  // Attention, not politeness, is what separates them: each identity names a
  // different set of things, and neither carries the other's.
  assert.match(sayo.captured.instructions, /ユーザーが楽しそうか、気分がどう動いたか/);
  assert.match(tt.captured.instructions, /見落とされている具体点、大きさや量/);
  assert.doesNotMatch(tt.captured.instructions, /ユーザーが楽しそうか/);
  assert.doesNotMatch(sayo.captured.instructions, /見落とされている具体点/);
  // NurseT keeps the Goal 14 licence to voice a small preference, but is no longer
  // the health officer or the facilitator.
  assert.match(tt.captured.instructions, /小さな好みや感想、軽い驚きも口にします/);
  assert.match(tt.captured.instructions, /健康指導係でも進行役でもありません/);
  // SAYO may end on a statement instead of a question.
  assert.match(sayo.captured.instructions, /質問で締めなくても大丈夫です/);
});

test('Goal 15: the second speaker must not pile another piece of advice on the first', async () => {
  const previousLines = [{speaker: 'SAYO', text: '無理しないで、少し休んだら？'}];
  const {captured} = await run(
    {speaker: 'NurseT', userMessage: '眠い', turn: plan(['NurseT']), context: {previousLines}},
    [{speaker: 'NurseT', text: 'b', emotion: 'calm'}]);
  assert.match(captured.instructions, /相手が助言や気づかいをしていたら/);
  // The Goal 14 protection is untouched by the Goal 15 edit.
  assert.match(captured.instructions, /相手の文をそのまま使わず、自分の言葉で足してください/);
});
