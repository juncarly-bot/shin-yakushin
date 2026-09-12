import test from 'node:test';import assert from 'node:assert/strict';
import {StudyApplication} from '../app/src/main/assets/platform.js';
import {enqueueReturn,dueReturn,markReturnDelivered,pruneReturns,detectSessionReturn,sessionHalves,nextMorning,returnMessages,ReturnKind,MAX_RETURNS} from '../app/src/main/assets/return-queue.js';
import {evaluate,InitiativeKind} from '../app/src/main/assets/initiative.js';
import {fresh,validate} from '../app/src/main/assets/domain.js';
const T=Date.parse('2026-09-11T03:00:00Z'),DAY=86400000;
class Host{raw=null;read(){return JSON.stringify({ok:true,raw:this.raw})}commit(rev,raw){this.raw=raw;return this.read()}}
const segments=(a,b,c,d)=>({sessionId:'s1',title:'自由学習',sourceType:'free',relatedMaterialId:null,relatedTaskId:null,relatedGoalId:null,relatedPlanId:null,startTimestamp:a,endTimestamp:d,segments:[{kind:'study',start:a,end:b},{kind:'break',start:b,end:c},{kind:'study',start:c,end:d}]});

test('a deferred observation is not delivered before it is due',()=>{
 const s=fresh();
 const item=enqueueReturn(s,{kind:ReturnKind.PATTERN,summary:'後半の方が集中が長く続いていたね',speakerPreference:'NurseT',availableAfter:T+DAY,importance:60},T);
 assert.equal(dueReturn(s,T),null);
 assert.equal(dueReturn(s,T+DAY-1),null);
 assert.equal(dueReturn(s,T+DAY).id,item.id);
});

test('an item is delivered exactly once and expires on schedule',()=>{
 const s=fresh();
 const item=enqueueReturn(s,{kind:ReturnKind.PATTERN,summary:'x',availableAfter:T+1000,expiresAt:T+2*DAY},T);
 assert.equal(dueReturn(s,T+2000).id,item.id);
 markReturnDelivered(item,T+2000);
 assert.equal(dueReturn(s,T+3000),null,'no duplicate delivery');
 assert.equal(s.returnQueue.length,1,'delivery is recorded so the same observation can never be re-queued');
 pruneReturns(s,T+2*DAY+1000);
 assert.equal(s.returnQueue.length,1,'the delivery record is kept for a bounded window');
 pruneReturns(s,T+10*DAY);
 assert.equal(s.returnQueue.length,0,'and then dropped');
 const expired=enqueueReturn(s,{kind:ReturnKind.GOAL,summary:'y',availableAfter:T,expiresAt:T+1000},T);
 assert.equal(dueReturn(s,T+5000),null,'an expired item is never delivered');
 pruneReturns(s,T+5000);
 assert.equal(s.returnQueue.some(x=>x.id===expired.id),false);
});

test('the queue is bounded and de-duplicated',()=>{
 const s=fresh();
 for(let i=0;i<MAX_RETURNS+10;i++)enqueueReturn(s,{id:'r:'+i,kind:ReturnKind.PATTERN,summary:'s'+i},T+i);
 assert.equal(s.returnQueue.length,MAX_RETURNS);
 assert.equal(enqueueReturn(s,{id:'r:'+(MAX_RETURNS+9),kind:ReturnKind.PATTERN,summary:'again'},T),null);
});

test('the deferred observation comes from the real session shape',()=>{
 const strongSecond=segments(T,T+15*60000,T+20*60000,T+80*60000);
 strongSecond.segments[2]={kind:'study',start:T+45*60000,end:T+80*60000};
 assert.equal(sessionHalves(strongSecond).segments,2);
 const item=detectSessionReturn(strongSecond,540);
 assert.equal(item.kind,ReturnKind.PATTERN);
 assert.equal(item.speakerPreference,'NurseT');
 assert.match(item.summary,/後半/);
 const strongFirst=segments(T,T+70*60000,T+75*60000,T+90*60000);
 assert.equal(detectSessionReturn(strongFirst,540).speakerPreference,'SAYO');
 assert.match(detectSessionReturn(strongFirst,540).summary,/前半/);
 assert.equal(detectSessionReturn({segments:[{kind:'study',start:T,end:T+3600000}]},540),null,'one block has no front/back pattern');
 assert.equal(detectSessionReturn(segments(T,T+60000,T+120000,T+240000),540),null,'a short session is not worth deferring');
});

test('next morning is the next local 08:00 after the session',()=>{
 const evening=Date.UTC(2026,8,11,13,0,0);
 const at=nextMorning(evening,540);
 assert.ok(at>evening);
 assert.equal(new Date(at+540*60000).toISOString().slice(11,16),'08:00');
 assert.equal(nextMorning(Date.UTC(2026,8,10,20,0,0),540),Date.UTC(2026,8,10,23,0,0),'an early run keeps the same morning');
});

test('the deferred line is a reaction, not a second summary',()=>{
 const [first,second]=returnMessages({summary:'後半の方が集中が長く続いていたね',speakerPreference:'NurseT'});
 assert.equal(first.speaker,'NurseT');
 assert.match(first.text,/^昨日は後半/);
 assert.equal(second.speaker,'SAYO');
 assert.notEqual(second.text,first.text);
});

test('end to end: a long night session defers, then returns the next morning',()=>{
 let now=T;const host=new Host();const app=new StudyApplication(host,()=>now);app.load();
 app.clock=()=>T;app.command('start',{sessionId:'long',title:'グリフィス電磁気学'});
 app.clock=()=>T+15*60000;app.command('break',{sessionId:'long',minutes:5});
 app.clock=()=>T+45*60000;app.command('resume',{sessionId:'long'});
 app.clock=()=>T+80*60000;app.command('finish',{sessionId:'long'});
 assert.equal(app.state.returnQueue.length,1,'the observation was saved, not delivered');
 const item=app.state.returnQueue[0];
 assert.equal(item.deliveredAt,null);
 assert.ok(item.availableAfter>app.state.messages.at(-1).at,'nothing is dumped at night');
 assert.equal(evaluate(app.state,T+80*60000+1000),null,'not at night');
 const proposal=evaluate(app.state,T+DAY);
 assert.equal(proposal.kind,InitiativeKind.DEFERRED_RETURN);
 assert.equal(proposal.returnId,item.id);
 assert.match(proposal.messages[0].text,/昨日は後半/);
 const shown=app.command('initiativeShow',proposal,true);
 assert.equal(shown.initiative.activeProposal.returnId,item.id);
 assert.equal(app.state.returnQueue[0].deliveredAt!==null,true,'delivery is marked on the item');
 assert.equal(evaluate(app.state,T+DAY+60000),null,'a delivered item never repeats');
});

test('a missing returnQueue array is repaired additively',()=>{
 const s=fresh();delete s.returnQueue;validate(s);
 assert.deepEqual(s.returnQueue,[]);
});
