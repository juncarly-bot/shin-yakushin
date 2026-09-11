import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {StudyApplication} from '../app/src/main/assets/platform.js';
import {evaluate,followUp,InitiativeKind,validateProposal} from '../app/src/main/assets/initiative.js';
import {CommitmentStatus} from '../app/src/main/assets/commitments.js';
import {metrics,totals} from '../app/src/main/assets/domain.js';
class Host{raw=null;read(){return JSON.stringify({ok:true,raw:this.raw})}commit(rev,raw){this.raw=raw;return this.read()}}
const DAY=86400000,ui=readFileSync(new URL('../app/src/main/assets/ui.js',import.meta.url),'utf8');
function setup(now=Date.parse('2026-09-11T03:00:00Z')){const host=new Host(),app=new StudyApplication(host,()=>now);app.load();return {host,app,setClock:t=>app.clock=()=>t}}
function previousStudy(app){const t=Date.parse('2026-09-11T03:00:00Z');const m=app.command('saveEntity',{kind:'materials',title:'グリフィス電磁気学',target:100,progress:20,unit:'ページ'}).materials[0];app.clock=()=>t;app.command('start',{sessionId:'prev',relatedMaterialId:m.id});app.clock=()=>t+45*60000;app.command('finish',{sessionId:'prev'});return {m,t}}

test('an app-open proposal becomes real conversation history with real chips',()=>{
 const {app,setClock}=setup();const {m,t}=previousStudy(app);setClock(t+DAY);
 const proposal=evaluate(app.state,t+DAY);assert.ok(validateProposal(proposal));
 const next=app.command('initiativeShow',proposal,true);
 const history=next.messages.filter(x=>x.intent==='initiative');
 assert.deepEqual(history.map(x=>x.speaker),['SAYO','SAYO']);
 assert.ok(history.every(x=>x.text.length>0));
 const active=next.initiative.activeProposal;
 assert.equal(active.kind,InitiativeKind.CONTINUE_PREVIOUS_STUDY);
 assert.deepEqual(active.actionOptions.map(o=>o.id),['start','later','stop']);
 assert.equal(active.actionOptions[0].kind,'START_STUDY');
 assert.equal(active.actionOptions[0].relatedMaterialId,m.id);
});

test('the start chip actually starts the promised study with the right context',()=>{
 const {app,setClock}=setup();const {m,t}=previousStudy(app);setClock(t+DAY);
 const shown=app.command('initiativeShow',evaluate(app.state,t+DAY),true);
 const option=shown.initiative.activeProposal.actionOptions[0];
 const started=app.command('start',{sessionId:'proposed',title:m.title,relatedMaterialId:option.relatedMaterialId},true);
 assert.equal(started.sessions.filter(x=>x.endTimestamp===null).length,1);
 assert.equal(started.sessions.at(-1).relatedMaterialId,m.id);
});

test('declining clears the proposal and quiets the rest of the day',()=>{
 const {app,setClock}=setup();const {t}=previousStudy(app);const at=t+DAY;setClock(at);
 const shown=app.command('initiativeShow',evaluate(app.state,at),true);
 const after=app.command('initiative',{event:'declined',kind:shown.initiative.activeProposal.kind,quietToday:true});
 assert.equal(after.initiative.activeProposal,null);
 assert.equal(after.settings.companion.quietDay,'2026-09-12');
 assert.equal(evaluate(after,at+3600000),null);
});

test('snoozing clears the proposal and waits for the requested time',()=>{
 const {app,setClock}=setup();const {t}=previousStudy(app);const at=t+DAY;setClock(at);
 const shown=app.command('initiativeShow',evaluate(app.state,at),true);
 const after=app.command('initiative',{event:'snoozed',minutes:30});
 assert.equal(after.initiative.activeProposal,null);
 assert.equal(after.initiative.snoozeUntil,at+30*60000);
});

test('accepting the start chip never duplicates Reward or Bond',()=>{
 const {app,setClock}=setup();const {m,t}=previousStudy(app);const before=structuredClone(app.state);setClock(t+DAY);
 app.command('initiativeShow',evaluate(app.state,t+DAY),true);
 app.command('initiative',{event:'accepted',kind:InitiativeKind.CONTINUE_PREVIOUS_STUDY},true);
 app.clock=()=>t+DAY+1000;app.command('start',{sessionId:'proposed',relatedMaterialId:m.id},true);
 app.clock=()=>t+DAY+16*60000;app.command('finish',{sessionId:'proposed'},true);
 const at=t+DAY+16*60000,delta=metrics(app.state,at).reward-metrics(before,at).reward,session=app.state.sessions.find(x=>x.sessionId==='proposed');
 assert.equal(app.state.sessions.filter(x=>x.sessionId==='proposed').length,1);
 // Reward moves by exactly the one new session's study minutes, never twice.
 assert.equal(delta,Math.floor(totals(session,session.endTimestamp).study/60));
 assert.equal(app.state.sessions.length,2);
});

test('a due commitment completion does not repeat its prompt',()=>{
 const {app,setClock}=setup();const t=Date.parse('2026-09-11T03:00:00Z');const m=app.command('saveEntity',{kind:'materials',title:'夜の続き',target:100,progress:0,unit:'ページ'}).materials[0];
 app.clock=()=>t;const c=app.command('commitment',{kind:'START_STUDY',title:m.title,dueAt:t,minutes:15,relatedMaterialId:m.id}).commitments[0];
 app.clock=()=>t+1000;app.command('start',{sessionId:'done',relatedMaterialId:m.id},true);app.clock=()=>t+16*60000;app.command('finish',{sessionId:'done'},true);
 assert.equal(app.state.commitments[0].status,CommitmentStatus.COMPLETED);
 setClock(t+20*60000);const again=evaluate(app.state,t+20*60000);
 assert.notEqual(again?.kind,InitiativeKind.FOLLOW_UP_COMMITMENT,'the completed commitment is never re-proposed');
 assert.notEqual(again?.commitmentId,app.state.commitments[0].commitmentId);
});

test('the finish screen offers one more or stop, wired to real commands',()=>{
 const {app,setClock}=setup();const t=Date.parse('2026-09-11T03:00:00Z');const m=app.command('saveEntity',{kind:'materials',title:'積分',target:100,progress:0,unit:'ページ'}).materials[0];
 app.clock=()=>t;app.command('start',{sessionId:'s',relatedMaterialId:m.id});app.clock=()=>t+20*60000;app.command('finish',{sessionId:'s'});
 const follow=followUp(app.state,t+20*60000);
 assert.deepEqual(follow.actionOptions.map(o=>o.kind),['START_STUDY','DECLINE']);
 assert.match(ui,/initiativeChips\(finishProposal,'finish'\)/);
 assert.match(ui,/else if\(a==='finish'\)\{if\(command\('finish'[\s\S]*?finishProposal=followUp\(S,now\(\)\)/);
});

test('a stale proposal stops rendering and can be cleared',()=>{
 const {app,setClock}=setup();const {t}=previousStudy(app);const at=t+DAY;setClock(at);
 const p=evaluate(app.state,at),shown=app.command('initiativeShow',p,true);
 assert.equal(shown.initiative.activeProposal.expiresAt,p.expiresAt);
 assert.equal(app.command('initiative',{event:'cleared'}).initiative.activeProposal,null);
 assert.match(ui,/function liveProposal\(\)/);
 assert.match(ui,/initiativeChips\(liveProposal\(\),'active'\)/);
 assert.match(ui,/command\('initiative',\{event:'cleared'\}\)/);
});

test('the UI only ever renders proposals that pass local validation',()=>{
 assert.match(ui,/if\(!proposal\|\|!validateProposal\(proposal\)\)return false;/);
 assert.match(ui,/command\('initiativeShow',proposal,true\)/);
 assert.match(ui,/data-initiative-action="\$\{index\}"/);
 assert.match(ui,/if\(option\.kind==='START_STUDY'\)/);
});
