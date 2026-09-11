import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../app/src/main/assets/'+p,import.meta.url),'utf8');
const ui=read('ui.js'),css=read('style.css');

test('companions are shown with their display names, ids unchanged internally',()=>{
 assert.match(ui,/小夜とTTちゃん/);
 assert.match(ui,/'NurseT'\?'TTちゃん':'小夜'/);
 assert.doesNotMatch(ui,/message-speaker">小夜 \/ SAYO/);
 // formal credits and settings may still use the full name
 assert.match(ui,/VOICEVOX:ナースロボ＿タイプＴ/);
});

test('typing indicator uses messenger labels for each companion',()=>{
 assert.match(ui,/が入力中…/);
 assert.match(ui,/が話しています…/);
 assert.match(ui,/TTちゃん/);
 assert.match(ui,/小夜/);
});

test('typing indicator reflects real pending state and is always cleared',()=>{
 assert.match(ui,/pendingTyping=/);
 assert.match(ui,/function showTyping\(/);
 assert.match(ui,/function hideTyping\(\)/);
 // cleared on success, error/cancel fallback, a new user turn, and route-away
 assert.match(ui,/finally\{clearTimeout\(stage\);hideTyping\(\);latency\.flush\(\)\}/);
 assert.match(ui,/if\(type==='conversation'\)\{hideTyping\(\);/);
});

test('the indicator is rendered inside the conversation, not as a floating delay',()=>{
 assert.match(ui,/typingHtml\(\)\+initiativeChips\([^)]*\)\+'<div id="messages-end">/);
 assert.match(css,/\.typing-dots/);
 assert.match(css,/typing-pulse/);
});

test('user feedback is measured and rendered before any remote work starts',()=>{
 const iSubmit=ui.indexOf("latency.mark('user_submit_at')");
 const iPlan=ui.indexOf("latency.mark('reply_plan_created_at')");
 const iBubble=ui.indexOf("latency.mark('user_bubble_rendered_at')");
 const iRemote=ui.indexOf('if(pendingRemote){const job=pendingRemote');
 assert.ok(iSubmit>=0&&iPlan>iSubmit&&iBubble>iPlan&&iRemote>iBubble,'submit -> plan -> user bubble -> remote');
 assert.match(ui,/enhanceConversation\(job\.localMessages,job\.text,job\.previous\)/);
});

test('assistant text is rendered before voice playback is requested',()=>{
 assert.match(ui,/latency\.mark\('assistant_text_rendered_at'\);speakMessages\(/);
});
