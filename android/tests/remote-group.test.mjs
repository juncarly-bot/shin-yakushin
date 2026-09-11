import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {RemoteAIProvider,remoteRequest,validateTurn} from '../app/src/main/assets/remote-ai.js';
import {createOpenAIReaction} from '../backend/openai-client.mjs';
import {StudyApplication} from '../app/src/main/assets/platform.js';
import {fresh} from '../app/src/main/assets/domain.js';

globalThis.window={};
const plan=(order)=>({order,allowedSpeakers:[...new Set(order)],maxMessages:order.length});

test('a remote turn bundle never exceeds three messages or leaves the plan',()=>{
 assert.throws(()=>validateTurn({messages:[1,2,3,4].map(()=>({speaker:'SAYO',text:'x'}))},plan(['SAYO'])),/invalid/);
 assert.throws(()=>validateTurn({messages:[{speaker:'NurseT',text:'x'}]},plan(['SAYO','NurseT'])),/invalid remote speaker/);
 assert.throws(()=>validateTurn({messages:[{speaker:'SAYO',text:'   '}]},plan(['SAYO'])),/invalid/);
});

test('the local plan owns speaker order, so a reordered bundle is rejected',()=>{
 assert.throws(()=>validateTurn({messages:[{speaker:'NurseT',text:'b'},{speaker:'SAYO',text:'a'}]},plan(['SAYO','NurseT'])),/order/);
 const messages=validateTurn({messages:[{speaker:'SAYO',text:'a'},{speaker:'NurseT',text:'b'}]},plan(['SAYO','NurseT']));
 assert.deepEqual(messages.map(m=>m.speaker),['SAYO','NurseT']);
});

test('oversized remote text is bounded and legacy single reactions still work',()=>{
 const bounded=validateTurn({text:'あ'.repeat(2000),emotion:'focused'},plan(['SAYO']));
 assert.equal(bounded.length,1);assert.equal(bounded[0].text.length,800);assert.equal(bounded[0].speaker,'SAYO');
});

test('one group turn sends exactly one remote request carrying the local plan',async()=>{
 let id,raw;const host={remoteAIAvailable:()=>true,requestRemoteAI:(x,y)=>{id=x;raw=JSON.parse(y)}};
 const provider=new RemoteAIProvider(host,1000),request=remoteRequest({conversation:{depth:'NORMAL'}},'二人はどう思う？','SAYO',{conversation:{}},plan(['SAYO','NurseT','SAYO']));
 const promise=provider.generate(request);
 assert.deepEqual(request.turn.order,['SAYO','NurseT','SAYO']);
 assert.deepEqual(raw.turn.order,['SAYO','NurseT','SAYO']);
 window.platformRemoteAIResult(id,JSON.stringify({messages:[{speaker:'SAYO',text:'a'},{speaker:'NurseT',text:'b'},{speaker:'SAYO',text:'c'}],event:'conversation'}));
 const result=await promise;assert.deepEqual(result.messages.map(m=>m.speaker),['SAYO','NurseT','SAYO']);assert.equal(result.text,'a');
});

test('a malformed bundle falls back instead of half-applying',async()=>{
 let id;const provider=new RemoteAIProvider({remoteAIAvailable:()=>true,requestRemoteAI:x=>{id=x}},100);
 const pending=provider.generate(remoteRequest({conversation:{}},'x','SAYO',{},plan(['SAYO','NurseT']))),rejection=assert.rejects(pending,/invalid/);
 window.platformRemoteAIResult(id,JSON.stringify({messages:[{speaker:'SAYO',text:'a'},{speaker:'UNKNOWN',text:'b'}]}));
 await rejection;
});

test('backend returns a bounded bundle while keeping the legacy reaction text',async()=>{
 const request={speaker:'SAYO',userMessage:'二人はどう思う？',turn:plan(['SAYO','NurseT']),context:{}};
 let captured;
 const result=await createOpenAIReaction(request,{apiKey:'server-test-secret',model:'test-model',fetchImpl:async(url,options)=>{captured=JSON.parse(options.body);return {ok:true,json:async()=>({output:[{content:[{text:JSON.stringify({text:'a',emotion:'calm',event:'conversation',messages:[{speaker:'SAYO',text:'a',emotion:'calm'},{speaker:'NurseT',text:'b',emotion:'focused'}]})}]}]})}}});
 assert.equal(result.text,'a');assert.deepEqual(result.messages.map(m=>m.speaker),['SAYO','NurseT']);
 assert.deepEqual(captured.text.format.schema.properties.messages.maxItems,3);
});

test('an older client without a turn plan still receives a single legacy reaction',async()=>{
 const result=await createOpenAIReaction({speaker:'NurseT',userMessage:'休憩しよう',context:{}},{apiKey:'k',fetchImpl:async()=>({ok:true,json:async()=>({output:[{content:[{text:JSON.stringify({text:'休みましょう',emotion:'relaxed',event:'break'})}]}]})})});
 assert.equal(result.text,'休みましょう');assert.equal(result.messages.length,1);assert.equal(result.messages[0].speaker,'NurseT');
});

class Host{constructor(state){this.raw=JSON.stringify(state);this.calls=[]}read(){return JSON.stringify({ok:true,raw:this.raw})}commit(revision,raw){const current=JSON.parse(this.raw);if(revision!==-1&&revision!==current.revision)throw Error('revision');this.raw=raw;return this.read()}}

test('accepting a group turn rewrites only dialogue and keeps Study Reward Bond Memory',()=>{
 const app=new StudyApplication(new Host(fresh()),()=>1700000000000);app.load();
 app.command('start',{sessionId:'s1',title:'電磁気'});app.clock=()=>170000000060000;app.command('finish',{sessionId:'s1'});app.clock=()=>170000000061000;app.command('chat',{text:'二人はどう思う？'});
 const before=structuredClone(app.state),ids=app.lastVoiceMessages.map(m=>m.id);
 const after=app.acceptRemoteTurn(ids,[{speaker:'SAYO',text:'リモートA',emotion:'pleased'},{speaker:'NurseT',text:'リモートB',emotion:'calm'},{speaker:'SAYO',text:'リモートC',emotion:'focused'}]);
 assert.deepEqual(after.sessions,before.sessions);assert.deepEqual(after.rewardLedger,before.rewardLedger);assert.deepEqual(after.affinityLedger,before.affinityLedger);assert.deepEqual(after.memories,before.memories);
 assert.equal(after.messages.find(m=>m.id===ids[0]).text,'リモートA');
 assert.equal(after.messages.find(m=>m.id===ids[1]).text,'リモートB');
});

test('a short legacy bundle only upgrades the bubbles the backend answered',()=>{
 const ui=fs.readFileSync(new URL('../app/src/main/assets/ui.js',import.meta.url),'utf8');
 assert.match(ui,/filled=targets\.map\(\(local,index\)=>remote\[index\]\?\?\{speaker:local\.speaker,text:local\.text\}\)/);
 const app=new StudyApplication(new Host(fresh()),()=>1700000000000);app.load();app.command('chat',{text:'二人はどう思う？'});
 const local=app.lastVoiceMessages.map(m=>({speaker:m.speaker,text:m.text})),ids=app.lastVoiceMessages.map(m=>m.id);
 const remote=[{speaker:'SAYO',text:'リモートA',emotion:'pleased'}],filled=local.map((l,i)=>remote[i]??{speaker:l.speaker,text:l.text});
 const after=app.acceptRemoteTurn(ids,filled);
 assert.equal(after.messages.find(m=>m.id===ids[0]).text,'リモートA');
 assert.equal(after.messages.find(m=>m.id===ids[1]).text,local[1].text,'the unanswered bubble keeps its local phrasing');
});

test('a stale group turn cannot overwrite a newer user message',()=>{
 const app=new StudyApplication(new Host(fresh()),()=>1700000000000);app.load();app.command('chat',{text:'二人はどう思う？'});const ids=app.lastVoiceMessages.map(m=>m.id);app.clock=()=>1700000001000;app.command('chat',{text:'別の話'});
 assert.throws(()=>app.acceptRemoteTurn(ids,[{speaker:'SAYO',text:'古い'}]),/stale/);
});
