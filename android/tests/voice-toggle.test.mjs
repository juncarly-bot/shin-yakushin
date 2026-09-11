import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {StudyApplication} from '../app/src/main/assets/platform.js';
import {voiceSettings} from '../app/src/main/assets/voice-settings.js';
const read=p=>readFileSync(new URL('../app/src/main/assets/'+p,import.meta.url),'utf8');
class Host{raw=null;read(){return JSON.stringify({ok:true,raw:this.raw})}commit(rev,raw){this.raw=raw;return this.read()}}
const setup=()=>{const app=new StudyApplication(new Host(),()=>1700000000000);app.load();return app};

test('composer offers a one-tap voice toggle next to send with a visible state',()=>{
 const ui=read('ui.js'),css=read('style.css');
 assert.match(ui,/data-action="toggleVoice" aria-pressed="\$\{on\}" aria-label="\$\{on\?'音声をオフにする':'音声をオンにする'\}"/);
 assert.match(ui,/enterkeyhint="send" required><\/textarea>'\+voiceToggle\(\)\+'<button type="submit"/);
 assert.match(css,/\.voice-toggle\{[^}]*min-height:48px/);
 assert.match(css,/prefers-color-scheme:dark\)\{\.voice-toggle/);
});

test('quick toggle writes the same authoritative voice flag the settings form uses',()=>{
 const app=setup();
 assert.equal(app.state.settings.voice,undefined);
 const on=app.command('settings',{...app.state.settings,voice:{...voiceSettings(app.state.settings.voice),enabled:true}});
 assert.equal(voiceSettings(on.settings.voice).enabled,true);
 assert.equal(voiceSettings(on.settings.voice).sayo,true);
 assert.equal(voiceSettings(on.settings.voice).nurse,true);
 assert.equal(voiceSettings(on.settings.voice).quietHours,true);
 const off=app.command('settings',{...on.settings,voice:{...voiceSettings(on.settings.voice),enabled:false}});
 assert.equal(voiceSettings(off.settings.voice).enabled,false);
});

test('turning voice off never blocks text conversation',()=>{
 const app=setup();
 app.command('settings',{...app.state.settings,voice:{...voiceSettings(),enabled:false}});
 const next=app.command('chat',{text:'こんばんは'});
 assert.equal(next.settings.voice.enabled,false);
 assert.ok(next.messages.some(m=>m.speaker==='user'));
 assert.ok(next.messages.some(m=>['SAYO','NurseT'].includes(m.speaker)));
});

test('voice toggle does not disable the per-character voice preferences',()=>{
 const app=setup();
 app.command('settings',{...app.state.settings,voice:{...voiceSettings(),sayo:false,enabled:true}});
 const next=app.command('settings',{...app.state.settings,voice:{...voiceSettings(app.state.settings.voice),enabled:false}});
 assert.equal(voiceSettings(next.settings.voice).enabled,false);
 assert.equal(voiceSettings(next.settings.voice).sayo,false);
});
