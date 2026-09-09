import test from 'node:test';
import assert from 'node:assert/strict';
import {RemoteAIProvider,remoteRequest} from '../app/src/main/assets/remote-ai.js';
import {StudyApplication} from '../app/src/main/assets/platform.js';
import {fresh} from '../app/src/main/assets/domain.js';

globalThis.window={};

test('cancel stops native request and late reply cannot complete the old turn',async()=>{
 let id,cancelled=0;const host={remoteAIAvailable:()=>true,requestRemoteAI:x=>{id=x},cancelRemoteAI:()=>{cancelled++}};
 const provider=new RemoteAIProvider(host,100),pending=provider.generate({speaker:'SAYO'});
 const rejection=assert.rejects(pending,/cancelled/);provider.cancel();provider.resolve(id,JSON.stringify({text:'stale'}));await rejection;
 assert.equal(cancelled,1);assert.equal(provider.pending.size,0);
});

test('deadline rejects and ignores later backend reply',async()=>{
 let id;const provider=new RemoteAIProvider({remoteAIAvailable:()=>true,requestRemoteAI:x=>{id=x}},5);
 await assert.rejects(provider.generate({}),/timeout/);provider.resolve(id,JSON.stringify({text:'late'}));assert.equal(provider.pending.size,0);
});

test('malformed remote output releases the request for local fallback',async()=>{
 let id;const provider=new RemoteAIProvider({remoteAIAvailable:()=>true,requestRemoteAI:x=>{id=x}},100);
 const pending=provider.generate({}),rejection=assert.rejects(pending,/invalid/);provider.resolve(id,'{}');await rejection;assert.equal(provider.pending.size,0);
});

class Host{
 constructor(state=fresh()){this.raw=JSON.stringify(state);this.calls=[];this.available=true}
 read(){return JSON.stringify({ok:true,raw:this.raw,error:'',warning:''})}
 commit(revision,raw){const current=JSON.parse(this.raw);if(revision!==-1&&revision!==current.revision)throw Error('revision');this.raw=raw;return this.read()}
 remoteAIAvailable(){return this.available}
 requestRemoteAI(id,raw){this.calls.push({id,raw})}
}

test('RemoteAIProvider sends detached context through native bridge and accepts valid output',async()=>{
 const host=new Host(),provider=new RemoteAIProvider(host,1000),promise=provider.generate({speaker:'SAYO',userMessage:'続き',context:{conversation:{topic:'電磁気'}}});
 assert.equal(host.calls.length,1);const sent=JSON.parse(host.calls[0].raw);sent.context.conversation.topic='changed';
 window.platformRemoteAIResult(host.calls[0].id,JSON.stringify({text:'昨日の続きだね。',emotion:'focused',event:'conversation'}));
 assert.equal((await promise).text,'昨日の続きだね。');
});

test('RemoteAIProvider rejects when backend is unavailable',async()=>{
 const host=new Host();host.available=false;const provider=new RemoteAIProvider(host);
 await assert.rejects(()=>provider.generate({}),/unavailable/);
});

test('remote reaction changes dialogue only, preserving StudySession Reward Bond and Memory',()=>{
 const host=new Host(),app=new StudyApplication(host,()=>1_700_000_000_000);app.load();
 app.command('start',{sessionId:'s1',title:'電磁気'});app.clock=()=>1_700_000_060_000;app.command('finish',{sessionId:'s1'});app.clock=()=>1_700_000_061_000;app.command('chat',{text:'続きの話をしよう'});
 const before=structuredClone(app.state),target=app.lastVoiceMessages.find(x=>x.speaker==='SAYO'||x.speaker==='NurseT');
 app.acceptRemoteReaction(target.id,{text:'うん、続きを一緒に考えよう。',emotion:'focused',event:'conversation'});
 assert.deepEqual(app.state.sessions,before.sessions);assert.deepEqual(app.state.rewardLedger,before.rewardLedger);assert.deepEqual(app.state.affinityLedger,before.affinityLedger);assert.deepEqual(app.state.memories,before.memories);
 assert.equal(app.state.messages.find(x=>x.id===target.id).text,'うん、続きを一緒に考えよう。');
});

test('stale remote response cannot replace a message after a newer user turn',()=>{
 const host=new Host(),app=new StudyApplication(host,()=>1_700_000_000_000);app.load();app.command('chat',{text:'最初の話'});const target=app.lastVoiceMessages[0];app.clock=()=>1_700_000_001_000;app.command('chat',{text:'別の話'});
 assert.throws(()=>app.acceptRemoteReaction(target.id,{text:'古い返答',emotion:'calm'}),/stale/);
});

test('remote request carries continuity without writable state',()=>{
 const state=fresh(),context={conversation:{currentTopic:'グリフィス'},recentSessions:[]};const value=remoteRequest(state,'それってなんで？','SAYO',context);
 assert.equal(value.speaker,'SAYO');assert.equal(value.context.conversation.currentTopic,'グリフィス');assert.equal('commit' in value,false);
});
