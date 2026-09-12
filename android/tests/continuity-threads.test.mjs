import test from 'node:test';import assert from 'node:assert/strict';
import {StudyApplication} from '../app/src/main/assets/platform.js';
import {openThread,detectThread,extractTopic,resolveThreads,selectThread,markThreadResurfaced,abandonThread,threadMessages,ThreadStatus,ThreadSource,MAX_RESURFACE,THREAD_COOLDOWN} from '../app/src/main/assets/continuity.js';
import {evaluate,InitiativeKind} from '../app/src/main/assets/initiative.js';
import {fresh,validate,migrate} from '../app/src/main/assets/domain.js';
const T=Date.parse('2026-09-11T03:00:00Z'),DAY=86400000;
class Host{raw=null;read(){return JSON.stringify({ok:true,raw:this.raw})}commit(rev,raw){this.raw=raw;return this.read()}}
const setup=()=>{let now=T;const host=new Host();const app=new StudyApplication(host,()=>now);app.load();return {host,app,set:t=>{now=t;app.clock=()=>t}}};

test('an unresolved question becomes one persisted OpenThread',()=>{
 const s=fresh();
 const thread=detectThread(s,'境界条件まだよく分からない',T);
 assert.equal(s.openThreads.length,1);
 assert.equal(thread.topic,'境界条件');
 assert.equal(thread.status,ThreadStatus.OPEN);
 assert.equal(thread.source,ThreadSource.STUCK);
 assert.equal(thread.owner,'SAYO');
 assert.equal(extractTopic('境界条件まだよく分からない'),'境界条件');
 assert.equal(extractTopic('電場のエネルギーがむずかしい'),'電場のエネルギー');
 assert.equal(detectThread(s,'今日はいい天気',T),null);
});

test('the thread survives a restart',()=>{
 const s=fresh();
 detectThread(s,'境界条件まだよく分からない',T);
 const raw=JSON.stringify(s);
 const reloaded=validate(JSON.parse(raw));
 assert.equal(reloaded.openThreads.length,1);
 assert.equal(reloaded.openThreads[0].topic,'境界条件');
 assert.equal(reloaded.openThreads[0].status,ThreadStatus.OPEN);
 assert.equal(openThread(reloaded,{topic:'境界条件'},T+1000).id,reloaded.openThreads[0].id);
 assert.equal(reloaded.openThreads.length,1,'the same topic is never duplicated');
});

test('resurfacing respects the cooldown and the resurface limit',()=>{
 const s=fresh();
 const thread=openThread(s,{topic:'境界条件'},T);
 assert.equal(selectThread(s,T+1000).id,thread.id);
 markThreadResurfaced(thread,T+2000);
 assert.equal(thread.resurfaceCount,1);
 assert.equal(selectThread(s,T+3000),null,'cooldown blocks an immediate repeat');
 assert.equal(selectThread(s,T+THREAD_COOLDOWN+3000).id,thread.id);
 markThreadResurfaced(thread,T+THREAD_COOLDOWN+4000);
 markThreadResurfaced(thread,T+2*THREAD_COOLDOWN+5000);
 assert.equal(thread.resurfaceCount,MAX_RESURFACE);
 assert.equal(selectThread(s,T+10*THREAD_COOLDOWN),null,'a thread is never nagged forever');
});

test('resolution and expiry end a thread for good',()=>{
 const s=fresh();
 const thread=openThread(s,{topic:'境界条件'},T);
 const resolved=resolveThreads(s,'境界条件わかった',T+1000);
 assert.equal(resolved.length,1);
 assert.equal(thread.status,ThreadStatus.RESOLVED);
 assert.equal(selectThread(s,T+10*DAY),null,'a resolved thread never comes back');
 const later=openThread(s,{topic:'電場のエネルギー'},T+2000);
 later.expiresAt=T+3*DAY;
 assert.equal(selectThread(s,T+4*DAY),null,'an expired thread is not selected');
 assert.equal(later.status,ThreadStatus.EXPIRED);
 abandonThread(s,openThread(s,{topic:'保留の話'},T+3000).id,T+4000);
 assert.equal(s.openThreads.filter(t=>t.status===ThreadStatus.ABANDONED).length,1);
});

test('resurfacing copy names the stored topic, never an invented one',()=>{
 const s=fresh();
 const stuck=detectThread(s,'境界条件まだよく分からない',T);
 const [first,second]=threadMessages(stuck);
 assert.equal(first.speaker,'SAYO');
 assert.match(first.text,/そういや昨日の境界条件、あれどうなった？/);
 assert.notEqual(second.text,first.text);
 const postponed=openThread(fresh(),{topic:'来週の計画',source:ThreadSource.POSTPONE,owner:'NurseT'},T);
 assert.match(threadMessages(postponed)[0].text,/あとでって言ってたよね/);
});

test('end to end: yesterday creates the thread, today it returns with its reason',()=>{
 const {app,set}=setup();
 app.command('chat',{text:'境界条件まだよく分からない'});
 assert.equal(app.state.openThreads.length,1);
 set(T+DAY);
 const proposal=evaluate(app.state,T+DAY);
 assert.equal(proposal.kind,InitiativeKind.OPEN_THREAD_FOLLOWUP);
 assert.equal(proposal.threadId,app.state.openThreads[0].id);
 assert.equal(proposal.reason,'open-thread');
 assert.match(proposal.messages[0].text,/そういや昨日の境界条件、あれどうなった？/);
 const shown=app.command('initiativeShow',proposal,true);
 assert.equal(shown.initiative.activeProposal.threadId,app.state.openThreads[0].id);
 assert.equal(app.state.openThreads[0].resurfaceCount,1,'showing the proposal marks the thread resurfaced');
 assert.equal(evaluate(app.state,T+DAY+60000),null,'it does not repeat while cooling down');
});

test('a resolved topic is not offered again',()=>{
 const {app,set}=setup();
 app.command('chat',{text:'境界条件まだよく分からない'});
 app.command('chat',{text:'境界条件わかった'});
 assert.equal(app.state.openThreads[0].status,ThreadStatus.RESOLVED);
 set(T+DAY);
 assert.equal(evaluate(app.state,T+DAY)?.kind??null,null,'a resolved topic is not offered again');
});

test('a missing openThreads array is repaired additively',()=>{
 const s=migrate(JSON.parse(JSON.stringify(fresh())));
 delete s.openThreads;
 validate(s);
 assert.deepEqual(s.openThreads,[]);
 assert.equal(s.schemaVersion,2);
});
