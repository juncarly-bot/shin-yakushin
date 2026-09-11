import test from 'node:test';import assert from 'node:assert/strict';
import {LatencyMarks,createLatencyTracker} from '../app/src/main/assets/latency.js';

function tracker(){let time=1000;const lines=[];const t=createLatencyTracker({enabled:true,clock:()=>time,sink:line=>lines.push(line)});return {t,lines,at:v=>{time+=v},now:()=>time};}

test('latency marks are an explicit bounded vocabulary',()=>{
 for(const name of ['user_submit_at','user_bubble_rendered_at','reply_plan_created_at','remote_request_started_at','remote_first_response_at','remote_response_completed_at','assistant_text_rendered_at','voice_request_at','voice_synthesis_started_at','voice_first_chunk_ready_at','voice_playback_started_at','voice_playback_completed_at'])assert.ok(LatencyMarks.includes(name),name);
 assert.ok(Object.isFrozen(LatencyMarks));
});

test('unknown marks are rejected so typos cannot silently disappear',()=>{
 const {t}=tracker();
 assert.throws(()=>t.mark('made_up_mark'),/unknown latency mark/);
});

test('disabled tracker records nothing and emits nothing',()=>{
 const t=createLatencyTracker({enabled:false,clock:()=>({})});
 assert.equal(t.mark('user_submit_at'),null);
 assert.equal(t.has('user_submit_at'),false);
 assert.deepEqual(t.flush(),[]);
});

test('user bubble is measured before remote completion without sleeping',()=>{
 const {t,lines,at}=tracker();
 t.mark('user_submit_at');at(34);t.mark('user_bubble_rendered_at');at(1826);t.mark('remote_request_started_at');at(20);t.mark('remote_first_response_at');at(1840);t.mark('remote_response_completed_at');at(5);t.mark('assistant_text_rendered_at');
 t.flush();
 assert.deepEqual(lines,[
  'CONVERSATION_LATENCY userBubble=34ms',
  'CONVERSATION_LATENCY remoteFirstByte=20ms',
  'CONVERSATION_LATENCY remote=1860ms',
  'CONVERSATION_LATENCY assistantText=3725ms'
 ]);
});

test('voice lines report first chunk and submit-to-audio with a stable shape',()=>{
 const {t,lines,at}=tracker();
 t.mark('user_submit_at');at(400);t.mark('assistant_text_rendered_at');at(100);t.mark('voice_synthesis_started_at');at(420);t.mark('voice_first_chunk_ready_at');at(90);t.mark('voice_playback_started_at');
 t.flush();
 assert.deepEqual(lines,['CONVERSATION_LATENCY assistantText=400ms','VOICE_LATENCY firstChunk=420ms','VOICE_LATENCY playbackStart=610ms','VOICE_LATENCY submitToAudio=1010ms']);
});

test('flush clears marks so a turn never duplicates lines',()=>{
 const {t,at}=tracker();
 t.mark('user_submit_at');at(10);t.mark('user_bubble_rendered_at');
 assert.equal(t.flush().length,1);
 assert.deepEqual(t.flush(),[]);
});

test('lines() is non-destructive and delta returns null for missing marks',()=>{
 const {t,at}=tracker();
 t.mark('user_submit_at');at(7);t.mark('user_bubble_rendered_at');
 assert.equal(t.lines().length,1);
 assert.equal(t.lines().length,1);
 assert.equal(t.delta('user_submit_at','voice_playback_started_at'),null);
});
