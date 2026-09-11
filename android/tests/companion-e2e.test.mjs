import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {StudyApplication} from '../app/src/main/assets/platform.js';
import {evaluate,followUp,InitiativeKind} from '../app/src/main/assets/initiative.js';
import {CommitmentStatus} from '../app/src/main/assets/commitments.js';
import {metrics,dateKey} from '../app/src/main/assets/domain.js';
const DAY=86400000,T=Date.parse('2026-09-11T03:00:00Z');
const ui=readFileSync(new URL('../app/src/main/assets/ui.js',import.meta.url),'utf8');
class Host{raw=null;read(){return JSON.stringify({ok:true,raw:this.raw})}commit(rev,raw){this.raw=raw;return this.read()}}
function setup(){const host=new Host();const clock={now:T};const app=new StudyApplication(host,()=>clock.now);app.load();return {host,app,clock,setClock:t=>{clock.now=t}}}
function studied(app,minutes=45,t0=T){const m=app.command('saveEntity',{kind:'materials',title:'グリフィス電磁気学',target:100,progress:20,unit:'ページ'}).materials[0];app.clock=()=>t0;app.command('start',{sessionId:'prev',relatedMaterialId:m.id});app.clock=()=>t0+minutes*60000;app.command('finish',{sessionId:'prev'});return m}

test('end to end: a next-day proposal starts real study, follows up, then stops cleanly',()=>{
 const {app,setClock}=setup();const m=studied(app);const at=T+DAY;setClock(at);
 const proposal=evaluate(app.state,at);
 assert.equal(proposal.kind,InitiativeKind.CONTINUE_PREVIOUS_STUDY);
 assert.equal(proposal.relatedMaterialId,m.id);
 const shown=app.command('initiativeShow',proposal,true);
 assert.equal(shown.initiative.activeProposal.kind,InitiativeKind.CONTINUE_PREVIOUS_STUDY);
 const startOption=shown.initiative.activeProposal.actionOptions.find(o=>o.kind==='START_STUDY');
 assert.ok(startOption,'the proposal offers a real start');
 // The chip starts exactly the promised material through the existing path.
 app.command('initiative',{event:'accepted',kind:proposal.kind,relatedId:proposal.relatedMaterialId},true);
 app.clock=()=>at+1000;app.command('start',{sessionId:'proposed',relatedMaterialId:startOption.relatedMaterialId},true);
 app.clock=()=>at+16*60000;const after=app.command('finish',{sessionId:'proposed'},true);
 assert.equal(after.sessions.filter(x=>x.sessionId==='proposed').length,1);
 // The finish screen offers one more or stop, wired to real commands.
 const follow=followUp(app.state,at+16*60000);
 assert.deepEqual(follow.actionOptions.map(o=>o.kind),['START_STUDY','DECLINE']);
 // Choosing 今日は終了 is a decline, and nothing repeats afterwards.
 app.command('initiative',{event:'declined',kind:follow.kind,quietToday:false});
 assert.equal(evaluate(app.state,at+16*60000+60000),null,'no repeated prompt after a clear stop');
 // Reward reflects the two real sessions once, never a duplicate.
 assert.equal(metrics(app.state,at+16*60000).reward,45+15);
});

test('end to end: an explicit promise survives restart, snoozes once, then goes quiet',()=>{
 const {host,app,clock,setClock}=setup();
 const m=app.command('saveEntity',{kind:'materials',title:'グリフィス電磁気学',target:100,progress:20,unit:'ページ'}).materials[0];
 const made=app.command('chat',{text:'今日21時にグリフィスやる'});
 const commitment=made.commitments[0];
 assert.equal(commitment.relatedMaterialId,m.id);assert.equal(commitment.dueAt,Date.parse('2026-09-11T12:00:00Z'));
 assert.equal(made.sessions.length,0,'nothing starts at promise time');
 // Restart keeps the promise exactly once.
 const restored=new StudyApplication(host,()=>clock.now);restored.load();
 assert.equal(restored.state.commitments.length,1);
 const dueAt=commitment.dueAt+60000;setClock(dueAt);
 const first=evaluate(restored.state,dueAt);
 assert.equal(first.kind,InitiativeKind.FOLLOW_UP_COMMITMENT);
 restored.command('initiativeShow',first,true);
 assert.equal(restored.state.commitments[0].promptCount,1);
 // Choosing 30分後 snoozes and quiets the promise until then.
 restored.command('commitmentAction',{commitmentId:commitment.commitmentId,op:'snooze',minutes:30});
 restored.command('initiative',{event:'snoozed',minutes:30});
 assert.equal(restored.state.commitments[0].status,CommitmentStatus.SNOOZED);
 assert.equal(evaluate(restored.state,dueAt+5*60000),null,'snoozed promise stays quiet');
 // Exactly one later prompt at the requested minute.
 const later=evaluate(restored.state,dueAt+30*60000+1000);
 assert.equal(later.kind,InitiativeKind.FOLLOW_UP_COMMITMENT);
 restored.command('initiativeShow',later,true);
 assert.equal(restored.state.commitments[0].status,CommitmentStatus.PENDING,'the snooze is consumed on show');
 assert.equal(restored.state.commitments[0].promptCount,2);
 assert.equal(evaluate(restored.state,dueAt+31*60000+1000),null,'an ignored promise is not re-prompted again');
 // A decline ends it without any punishment state.
 restored.command('commitmentAction',{commitmentId:commitment.commitmentId,op:'decline'});
 assert.equal(restored.state.commitments[0].status,CommitmentStatus.DECLINED);
 assert.equal(evaluate(restored.state,dueAt+DAY),null);
});

test('end to end: finishing a promised session marks it complete without touching Reward twice',()=>{
 const {app,setClock}=setup();const m=studied(app,0);const at=T+DAY;setClock(at);
 app.command('commitment',{kind:'START_STUDY',title:m.title,dueAt:T+DAY,minutes:15,relatedMaterialId:m.id});
 const before=metrics(app.state,T+DAY+20*60000);
 app.clock=()=>at+60000;app.command('start',{sessionId:'kept',relatedMaterialId:m.id},true);
 app.clock=()=>at+17*60000;app.command('finish',{sessionId:'kept'},true);
 assert.equal(app.state.commitments[0].status,CommitmentStatus.COMPLETED);
 const after=metrics(app.state,T+DAY+20*60000);
 assert.equal(after.reward-before.reward,16,'only the real minutes count, once');
 assert.equal(app.state.sessions.filter(x=>x.sessionId==='kept').length,1);
});

test('a two-second tap can never complete a promise',()=>{
 const {app,setClock}=setup();const m=studied(app,0);const at=T+DAY;setClock(at);
 app.command('commitment',{kind:'START_STUDY',title:m.title,dueAt:at,minutes:15,relatedMaterialId:m.id});
 app.clock=()=>at+1000;app.command('start',{sessionId:'tap',relatedMaterialId:m.id},true);
 app.clock=()=>at+3000;app.command('finish',{sessionId:'tap'},true);
 assert.equal(app.state.commitments[0].status,CommitmentStatus.PENDING,'an accidental tap is not a promise kept');
});

test('a promise for another material is not completed by the wrong study',()=>{
 const {app,setClock}=setup();const m=studied(app,0);
 const other=app.command('saveEntity',{kind:'materials',title:'線形代数',target:100,progress:0,unit:'ページ'}).materials.at(-1);
 const at=T+DAY;setClock(at);
 app.command('commitment',{kind:'START_STUDY',title:m.title,dueAt:at,minutes:15,relatedMaterialId:m.id});
 app.clock=()=>at+60000;app.command('start',{sessionId:'wrong',relatedMaterialId:other.id},true);
 app.clock=()=>at+20*60000;app.command('finish',{sessionId:'wrong'},true);
 assert.equal(app.state.commitments[0].status,CommitmentStatus.PENDING);
});

test('the settings screen exposes proactivity and 今日は静かに',()=>{
 assert.match(ui,/data-form="companion"/);
 assert.match(ui,/data-action="quietToday"/);
 assert.match(ui,/\['LOW','控えめ'\]/);
 assert.match(ui,/\['NORMAL','標準'\]/);
 assert.match(ui,/\['HIGH','多め'\]/);
 assert.match(ui,/command\('companion',\{proactivity:/);
 assert.match(ui,/command\('companion',\{quietDay:today\(\)\}\)/);
});

test('proactivity and a quiet day survive restart and never silence a real promise',()=>{
 const {host,app,clock,setClock}=setup();const m=studied(app);const at=T+DAY;
 app.command('companion',{proactivity:'LOW'});
 app.clock=()=>at;app.command('companion',{quietDay:dateKey(at,540)});
 const restored=new StudyApplication(host,()=>clock.now);restored.load();
 assert.equal(restored.state.settings.companion.proactivity,'LOW');
 assert.equal(restored.state.settings.companion.quietDay,dateKey(at,540));
 assert.equal(evaluate(restored.state,at),null,'a quiet day suppresses generic suggestions');
 restored.command('commitment',{kind:'START_STUDY',title:m.title,dueAt:at,minutes:15,relatedMaterialId:m.id});
 assert.equal(evaluate(restored.state,at+60000).kind,InitiativeKind.FOLLOW_UP_COMMITMENT,'a quiet day never silences an explicit promise');
});
