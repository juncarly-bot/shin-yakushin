import test from 'node:test';import assert from 'node:assert/strict';
import {StudyApplication} from '../app/src/main/assets/platform.js';
import {CommitmentStatus} from '../app/src/main/assets/commitments.js';
class Host{raw=null;read(){return JSON.stringify({ok:true,raw:this.raw})}commit(rev,raw){this.raw=raw;return this.read()}}
const T=Date.parse('2026-09-11T03:00:00Z');
function setup(){const host=new Host();let now=T;const app=new StudyApplication(host,()=>now);app.load();return {host,app,setClock:t=>{now=t;app.clock=()=>t}}}
function withMaterial(app){return app.command('saveEntity',{kind:'materials',title:'グリフィス電磁気学',target:100,progress:20,unit:'ページ'}).materials[0]}

test('an explicit clock time becomes a validated commitment, not an immediate start',()=>{
 const {app}=setup();const m=withMaterial(app);
 const next=app.command('chat',{text:'今日21時にグリフィスやる'});
 const c=next.commitments.at(-1);
 assert.ok(c,'a commitment was recorded');
 assert.equal(c.kind,'START_STUDY');assert.equal(c.status,CommitmentStatus.PENDING);
 assert.equal(c.relatedMaterialId,m.id);assert.equal(c.minutes,15);
 assert.equal(c.dueAt,Date.UTC(2026,8,11,12,0,0,0),'21:00 local (UTC+9) on the same day');
 assert.equal(next.sessions.length,0,'no study started immediately');
 assert.equal(next.sessions.filter(x=>x.endTimestamp===null).length,0);
 assert.match(next.reaction.text,/21:00/);assert.match(next.reaction.text,/呼ぶね/);
 assert.equal(next.reaction.speaker,'SAYO');
});

test('"後でやるかも" never becomes a commitment or an immediate start',()=>{
 const {app}=setup();withMaterial(app);
 const next=app.command('chat',{text:'グリフィス、明日やるかも'});
 assert.equal(next.commitments.length,0);
 assert.equal(next.sessions.length,0);
 assert.notEqual(next.reaction?.text,/呼ぶね/);
});

test('a relative time becomes a commitment from the previous study',()=>{
 const {app,setClock}=setup();const m=withMaterial(app);
 app.command('start',{sessionId:'prev',relatedMaterialId:m.id});setClock(T+45*60000);app.command('finish',{sessionId:'prev'});
 setClock(T+2*86400000);
 const next=app.command('chat',{text:'30分後に続きやる'});
 const c=next.commitments.at(-1);
 assert.ok(c,'a commitment was recorded');assert.equal(c.relatedMaterialId,m.id);
 assert.equal(c.dueAt,T+2*86400000+30*60000);
 assert.equal(next.sessions.length,1,'the finished session is untouched and no new one starts');
});

test('a bare time with no context creates a safe unbound commitment',()=>{
 const {app}=setup();
 const next=app.command('chat',{text:'明日の朝にやる'});
 const c=next.commitments.at(-1);
 assert.ok(c);assert.equal(c.relatedMaterialId,null);assert.equal(c.title,'続き');
 assert.equal(c.dueAt,Date.UTC(2026,8,12,-1,0,0,0),'tomorrow 08:00 local (UTC+9)');
});

test('an unknown material does not get silently bound to the wrong thing',()=>{
 const {app}=setup();withMaterial(app);
 const next=app.command('chat',{text:'21時に量子力学入門やる'});
 const c=next.commitments.at(-1);
 assert.ok(c);assert.equal(c.relatedMaterialId,null,'nothing matched, so nothing is guessed');
});
