import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {StudyApplication} from '../app/src/main/assets/platform.js';
import {voiceSettings} from '../app/src/main/assets/voice-settings.js';
import {speechRequest} from '../app/src/main/assets/companion.js';
import {speechQueue} from '../app/src/main/assets/voice-chunks.js';
const asset=p=>readFileSync(new URL('../app/src/main/assets/'+p,import.meta.url),'utf8');
const java=p=>readFileSync(new URL('../app/src/main/java/org/shinyakushin/study/next/'+p,import.meta.url),'utf8');
const ui=asset('ui.js'),controller=java('VoiceController.java'),activity=java('MainActivity.java'),voicevox=java('VoicevoxProvider.java');
class Host{constructor(){this.raw=null;this.batches=[];this.cancels=0}read(){return JSON.stringify({ok:true,raw:this.raw})}commit(rev,raw){this.raw=raw;return this.read()}speakBatch(raw){this.batches.push(JSON.parse(raw))}cancelVoice(){this.cancels++}}

test('replies are chunked sentence by sentence into one bounded batch',()=>{
 assert.match(ui,/speechQueue\(spoken,8\)/);
 assert.match(ui,/host\.speakBatch\(JSON\.stringify\(batch\)\)/);
 assert.match(controller,/list\.length\(\)>8/);
});

test('turning voice off cancels queued synthesis and playback immediately',()=>{
 assert.match(ui,/if\(v\.enabled\)host\.cancelVoice\?\.\(\)/);
 assert.match(controller,/public synchronized void cancel\(\)\{generation\+\+;pending\.clear\(\);main\.post\(this::stopPlayback\);\}/);
});

test('a new user turn cancels stale audio and stale remote work',()=>{
 assert.match(ui,/if\(a==='chat'\)\{host\.cancelVoice\?\.\(\);remoteAI\?\.cancel\(\)\}/);
});

test('stale tokens cannot play after cancellation',()=>{
 assert.match(controller,/private synchronized boolean valid\(long token\)\{return !closed&&foreground&&generation==token;\}/);
 assert.match(controller,/if\(!valid\(r\.token\)\)\{done\.countDown\(\);return;\}/);
 assert.match(controller,/if\(valid\(r\.token\)&&player==p\)\{p\.start\(\)/);
});

test('prewarm prepares quietly and never plays audio',()=>{
 assert.match(voicevox,/public void warmup\(\)throws Exception\{initialize\(\);\}/);
 assert.match(controller,/public void prewarm\(\)\{/);
 assert.match(controller,/provider\.warmup\(\);emit\("prewarm_completed"\);/);
 assert.match(activity,/public void prewarmVoice\(\)\{voice\.prewarm\(\);\}/);
 assert.match(ui,/function prewarmVoice\(\)\{try\{if\(!S\|\|!voiceSettings\(S\.settings\.voice\)\.enabled\)return;/);
 assert.doesNotMatch(controller.slice(controller.indexOf('private void warm('),controller.indexOf('public synchronized void cancel')),/\.start\(\)/);
});

test('prewarm failure downgrades to text instead of breaking conversation',()=>{
 const warm=controller.slice(controller.indexOf('private void warm('),controller.indexOf('public synchronized void cancel'));
 assert.match(warm,/catch\(Exception\|LinkageError ex\)/);
 assert.match(warm,/provider=new NoVoiceProvider\(\)/);
});

test('voice stays off by default and turning it on never replays history',()=>{
 const host=new Host(),app=new StudyApplication(host,()=>1700000000000);app.load();
 app.command('chat',{text:'こんばんは'});
 assert.equal(voiceSettings(app.state.settings.voice).enabled,false);
 assert.equal(host.batches.length,0,'nothing is spoken while voice is off');
 app.command('settings',{...app.state.settings,voice:{...voiceSettings(),enabled:true}});
 const before=host.batches.length;app.command('chat',{text:'続きをやろう'});
 assert.ok(host.batches.length>=before);
});

test('a group reply keeps SAYO before TT in the speech queue',()=>{
 const host=new Host(),app=new StudyApplication(host,()=>1700000000000);app.load();
 app.command('settings',{...app.state.settings,voice:{...voiceSettings(),enabled:true,frequency:'high'}});
 const previous=app.state.reaction,next=app.command('chat',{text:'二人はどう思う？'});
 assert.ok(speechRequest(next,previous,1700000000000,0));
 const queue=speechQueue(next.messages.filter(m=>['SAYO','NurseT'].includes(m.speaker)),8);
 assert.deepEqual([...new Set(queue.map(x=>x.speaker))],['SAYO','NurseT']);
 assert.equal(queue.at(-1).speaker,'SAYO');
 assert.ok(queue.length<=8);
 assert.ok(queue.every(x=>x.text.length>0));
});
