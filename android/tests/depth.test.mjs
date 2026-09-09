import test from 'node:test';import assert from 'node:assert/strict';
import {StudyApplication} from '../app/src/main/assets/platform.js';
class Host{raw=null;read(){return JSON.stringify({ok:true,raw:this.raw})}commit(rev,raw){this.raw=raw;return this.read()}}
test('deep conversation continues across 30 user turns and restart without creating study',()=>{
 const host=new Host();let time=1900000000000;let app=new StudyApplication(host,()=>time);app.load();
 app.command('chat',{text:'電場のエネルギーについて詳しく話したい'});
 for(let i=0;i<30;i++){time+=60000;app.command('chat',{text:'それってなんで？'});assert.equal(app.state.conversation.depthContext.depth,'DEEP');assert.match(app.state.reaction.text,/電場のエネルギー/);assert.ok(app.lastVoiceMessages.length<=4)}
 app=new StudyApplication(host,()=>time);app.load();assert.match(app.state.conversation.depthContext.topic,/電場/);assert.equal(app.state.sessions.length,0);assert.equal(app.state.memories.length,0);
});
test('explicit ending lowers depth, a new topic replaces discussion context',()=>{
 let t=1900000000000;const app=new StudyApplication(new Host(),()=>t++);app.load();app.command('chat',{text:'力学について詳しく話したい'});app.command('chat',{text:'確率について教えて'});assert.match(app.state.conversation.depthContext.topic,/確率/);app.command('chat',{text:'今日はここまで'});assert.equal(app.state.conversation.depthContext.depth,'QUICK_REACTION');
});
