import test from 'node:test';import assert from 'node:assert/strict';
import {StudyApplication} from '../app/src/main/assets/platform.js';
import {evaluate,followUp,InitiativeKind,dueCommitment,proactivityOf} from '../app/src/main/assets/initiative.js';
class Host{raw=null;read(){return JSON.stringify({ok:true,raw:this.raw})}commit(rev,raw){this.raw=raw;return this.read()}}
const JST=540,DAY=86400000;
function setup(now=Date.parse('2026-09-11T03:00:00Z')){const host=new Host(),app=new StudyApplication(host,()=>now);app.load();return {host,app,setClock:t=>app.clock=()=>t,now}}
function studiedYesterday(app,{minutes=45,title='グリフィス電磁気学'}={}){
 const t=Date.parse('2026-09-11T03:00:00Z');
 const m=app.command('saveEntity',{kind:'materials',title,target:100,progress:20,unit:'ページ'}).materials[0];
 app.clock=()=>t;app.command('start',{sessionId:'prev',relatedMaterialId:m.id});app.clock=()=>t+minutes*60000;app.command('finish',{sessionId:'prev'});
 return {m,t};
}

test('a next-day launch proposes continuing the previous study',()=>{
 const {app,setClock,now}=setup();const {m,t}=studiedYesterday(app);
 setClock(t+DAY);const p=evaluate(app.state,t+DAY);
 assert.equal(p.kind,InitiativeKind.CONTINUE_PREVIOUS_STUDY);
 assert.equal(p.relatedMaterialId,m.id);
 assert.ok(p.messages.some(x=>/続き/.test(x.text)));
 assert.deepEqual(p.actionOptions.map(o=>o.id),['start','later','stop']);
});

test('an unfinished task is resumed rather than a generic greeting',()=>{
 const {app,setClock}=setup();const t=Date.parse('2026-09-11T03:00:00Z');
 const m=app.command('saveEntity',{kind:'materials',title:'解析力学',target:100,progress:0,unit:'ページ'}).materials[0];
 const task=app.command('saveEntity',{kind:'tasks',title:'章末問題',relatedMaterialId:m.id}).tasks[0];
 app.clock=()=>t;app.command('start',{sessionId:'prev',relatedTaskId:task.id,title:'章末問題'});app.clock=()=>t+30*60000;app.command('finish',{sessionId:'prev'});
 setClock(t+DAY);const p=evaluate(app.state,t+DAY);
 assert.equal(p.kind,InitiativeKind.RESUME_UNFINISHED_TASK);
});

test("today's plan becomes a small start when nothing else is pending",()=>{
 const {app,setClock}=setup();const t=Date.parse('2026-09-11T03:00:00Z');
 app.clock=()=>t;app.command('saveEntity',{kind:'plans',title:'積分の復習',date:'2026-09-11'});
 setClock(t+2*3600000);const p=evaluate(app.state,t+2*3600000);
 assert.equal(p.kind,InitiativeKind.START_SMALL_SESSION);assert.equal(p.title,'積分の復習');
});

test('a quiet fresh state produces no proposal at all',()=>{
 const {app,now}=setup();assert.equal(evaluate(app.state,now),null);
});

test('a due commitment outranks every generic suggestion',()=>{
 const {app,setClock,now}=setup();const {m,t}=studiedYesterday(app);
 app.clock=()=>t;app.command('commitment',{kind:'START_STUDY',title:m.title,dueAt:t+3600000,minutes:15,relatedMaterialId:m.id});
 setClock(t+3650000);const p=evaluate(app.state,t+3650000);
 assert.equal(p.kind,InitiativeKind.FOLLOW_UP_COMMITMENT);assert.equal(p.commitmentId,app.state.commitments[0].commitmentId);
 assert.ok(p.messages[0].text.includes(':'));
});

test('a recent decline lowers the heat instead of nagging',()=>{
 const {app,setClock}=setup();const {t}=studiedYesterday(app);
 setClock(t+DAY);const at=t+DAY,first=evaluate(app.state,at);assert.ok(first);
 app.clock=()=>at;app.command('initiative',{event:'shown',kind:first.kind,relatedId:first.relatedMaterialId});
 app.command('initiative',{event:'declined',kind:first.kind,relatedId:first.relatedMaterialId});
 assert.equal(evaluate(app.state,at+60000),null,'declined proposal stays quiet');
});

test('a snooze suppresses the same proposal until it is due again',()=>{
 const {app,setClock}=setup();const {t}=studiedYesterday(app);const at=t+DAY;
 app.clock=()=>at;app.command('initiative',{event:'snoozed',minutes:30});
 assert.equal(evaluate(app.state,at+60000),null);
 assert.ok(evaluate(app.state,at+31*60000));
});

test('the same proposal is not repeated inside the cooldown',()=>{
 const {app,setClock}=setup();const {t}=studiedYesterday(app);const at=t+DAY,first=evaluate(app.state,at);
 app.clock=()=>at;app.command('initiative',{event:'shown',kind:first.kind,relatedId:first.relatedMaterialId});
 assert.equal(evaluate(app.state,at+5*60000),null);
});

test('「今日は静かに」 suppresses invitations but not explicit commitments',()=>{
 const {app,setClock,now}=setup();const {m,t}=studiedYesterday(app);const at=t+DAY;
 app.clock=()=>at;app.command('initiative',{event:'declined',kind:InitiativeKind.CONTINUE_PREVIOUS_STUDY,quietToday:true});
 assert.equal(evaluate(app.state,at+3600000),null,'a quiet day suppresses generic suggestions');
 app.command('commitment',{kind:'START_STUDY',title:m.title,dueAt:at,minutes:15,relatedMaterialId:m.id});
 assert.equal(evaluate(app.state,at+7200000).kind,InitiativeKind.FOLLOW_UP_COMMITMENT,'an explicit promise still follows through');
});

test('an active study session stays quiet',()=>{
 const {app,now}=setup();app.command('start',{sessionId:'run',title:'集中'});
 assert.equal(evaluate(app.state,now+5*60000),null);
});

test('a 90 minute active session offers a break through the practical companion',()=>{
 const {app,now}=setup();app.command('start',{sessionId:'run',title:'集中'});
 const p=evaluate(app.state,now+91*60000);
 assert.equal(p.kind,InitiativeKind.TAKE_BREAK);assert.equal(p.messages[0].speaker,'NurseT');
});

test('proactivity level changes frequency, not correctness',()=>{
 const {app,now}=setup();
 assert.equal(proactivityOf(app.state),'NORMAL');
 assert.equal(proactivityOf(app.command('companion',{proactivity:'LOW'})),'LOW');
 assert.equal(proactivityOf(app.command('companion',{proactivity:'HIGH'})),'HIGH');
 assert.throws(()=>app.command('companion',{proactivity:'MAX'}));
});

test('restart keeps the daily initiative count and decline state',()=>{
 const {host,app,setClock}=setup();const {t}=studiedYesterday(app);const at=t+DAY,first=evaluate(app.state,at);
 app.clock=()=>at;app.command('initiative',{event:'shown',kind:first.kind,relatedId:first.relatedMaterialId});
 app.command('initiative',{event:'declined',kind:first.kind,quietToday:false});
 const restored=new StudyApplication(host,()=>at);restored.load();
 assert.equal(restored.state.initiativeStats.shown,1);assert.equal(restored.state.initiativeStats.declined,1);
 assert.equal(restored.state.initiative.lastDeclinedKind,first.kind);
});

test('a commitment across midnight is followed up once, on the right local day',()=>{
 const {app,setClock}=setup();const t=Date.parse('2026-09-11T14:55:00Z'); // 23:55 JST
 const m=app.command('saveEntity',{kind:'materials',title:'夜の続き',target:100,progress:0,unit:'ページ'}).materials[0];
 app.clock=()=>t;app.command('commitment',{kind:'START_STUDY',title:m.title,dueAt:t+5*60000,minutes:15,relatedMaterialId:m.id});
 const after=t+15*60000; // 00:10 JST next day
 setClock(after);assert.equal(dueCommitment(app.state,after).commitmentId,app.state.commitments[0].commitmentId);
 const first=evaluate(app.state,after);assert.equal(first.kind,InitiativeKind.FOLLOW_UP_COMMITMENT);
 app.command('initiative',{event:'shown',kind:first.kind,relatedId:first.relatedMaterialId});
 assert.equal(dueCommitment(app.state,after).status,'PENDING','showing does not consume the promise');
});

test('finishing a meaningful session produces a bounded follow-up',()=>{
 const {app,setClock}=setup();const t=Date.parse('2026-09-11T03:00:00Z');
 const m=app.command('saveEntity',{kind:'materials',title:'積分',target:100,progress:0,unit:'ページ'}).materials[0];
 app.clock=()=>t;app.command('start',{sessionId:'s',relatedMaterialId:m.id});app.clock=()=>t+20*60000;app.command('finish',{sessionId:'s'});
 const p=followUp(app.state,t+20*60000);
 assert.deepEqual(p.messages.map(x=>x.speaker),['SAYO','NurseT']);
 assert.deepEqual(p.actionOptions.map(o=>o.id),['more','stop']);
});
