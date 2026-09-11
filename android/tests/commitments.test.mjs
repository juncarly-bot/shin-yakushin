import test from 'node:test';import assert from 'node:assert/strict';
import {StudyApplication} from '../app/src/main/assets/platform.js';
import {fresh,migrate} from '../app/src/main/assets/domain.js';
import {parseDueAt,isMeaningful,matchesStudy,nextDue,CommitmentStatus} from '../app/src/main/assets/commitments.js';
class Host{raw=null;read(){return JSON.stringify({ok:true,raw:this.raw})}commit(rev,raw){this.raw=raw;return this.read()}}
function setup(now=Date.parse('2026-09-11T03:00:00Z')){const host=new Host(),app=new StudyApplication(host,()=>now);app.load();return {host,app,setClock:t=>app.clock=()=>t}}
const createMaterial=app=>app.command('saveEntity',{kind:'materials',title:'グリフィス電磁気学',target:100,progress:20,unit:'ページ'}).materials[0];

test('only reliable time expressions become a due time',()=>{
 const now=Date.parse('2026-09-11T03:00:00Z');
 assert.equal(parseDueAt('今日は3時間やろうかな',now),null);
 assert.equal(parseDueAt('いつかやりたい',now),null);
 assert.equal(parseDueAt('たぶんやるかも',now),null);
 assert.equal(parseDueAt('9時にやる',now).label,'9時');
 assert.equal(parseDueAt('30分後',now).dueAt,now+30*60000);
 assert.equal(parseDueAt('1時間後',now).dueAt,now+3600000);
 assert.equal(parseDueAt('明日の朝',now).dueAt,Date.UTC(2026,8,12,8)-540*60000);
});

test('an explicit intent becomes a persisted pending commitment',()=>{
 const {host,app}=setup();const m=createMaterial(app);const now=Date.parse('2026-09-11T03:00:00Z');
 const next=app.command('commitment',{kind:'START_STUDY',title:m.title,dueAt:now+3600000,minutes:15,relatedMaterialId:m.id,source:'conversation'});
 const c=next.commitments[0];assert.equal(c.status,CommitmentStatus.PENDING);assert.equal(c.minutes,15);assert.equal(c.relatedMaterialId,m.id);
 const restored=new StudyApplication(host,()=>now);restored.load();assert.equal(restored.state.commitments.length,1);assert.equal(restored.state.commitments[0].commitmentId,c.commitmentId);
});

test('a 30 minute snooze persists and survives restart',()=>{
 const {host,app}=setup();const now=Date.parse('2026-09-11T03:00:00Z');const m=createMaterial(app);
 const c=app.command('commitment',{kind:'START_STUDY',title:m.title,dueAt:now,minutes:15,relatedMaterialId:m.id}).commitments[0];
 const next=app.command('commitmentAction',{commitmentId:c.commitmentId,op:'snooze',minutes:30});
 assert.equal(next.commitments[0].status,CommitmentStatus.SNOOZED);assert.equal(next.commitments[0].snoozedUntil,now+30*60000);
 const restored=new StudyApplication(host,()=>now);restored.load();assert.equal(restored.state.commitments[0].snoozedUntil,now+30*60000);
});

test('a commitment completes only from meaningful matching study',()=>{
 const {app,setClock}=setup();const now=Date.parse('2026-09-11T03:00:00Z');const m=createMaterial(app);
 const other=app.command('saveEntity',{kind:'materials',title:'別の本',target:50,progress:0,unit:'ページ'}).materials.find(x=>x.title==='別の本');
 const c=app.command('commitment',{kind:'START_STUDY',title:m.title,dueAt:now,minutes:15,relatedMaterialId:m.id}).commitments[0];
 setClock(now+1000);app.command('start',{sessionId:'accidental',relatedMaterialId:other.id});setClock(now+3000);app.command('finish',{sessionId:'accidental'});
 assert.equal(app.state.commitments[0].status,CommitmentStatus.PENDING,'wrong material never completes');
 setClock(now+5*60000);app.command('start',{sessionId:'real',relatedMaterialId:m.id});setClock(now+5*60000+2*60000);app.command('finish',{sessionId:'real'});
 assert.equal(app.state.commitments[0].status,CommitmentStatus.PENDING,'2 minutes is not meaningful');
 setClock(now+30*60000);app.command('start',{sessionId:'meant',relatedMaterialId:m.id});setClock(now+30*60000+13*60000);app.command('finish',{sessionId:'meant'});
 assert.equal(app.state.commitments[0].status,CommitmentStatus.COMPLETED);
});

test('a decline persists and never completes by accident',()=>{
 const {host,app}=setup();const now=Date.parse('2026-09-11T03:00:00Z');const m=createMaterial(app);
 const c=app.command('commitment',{kind:'START_STUDY',title:m.title,dueAt:now,minutes:15,relatedMaterialId:m.id}).commitments[0];
 app.command('commitmentAction',{commitmentId:c.commitmentId,op:'decline'});
 const restored=new StudyApplication(host,()=>now);restored.load();assert.equal(restored.state.commitments[0].status,CommitmentStatus.DECLINED);assert.equal(restored.state.commitments[0].declinedAt,now);
});

test('stale commitments expire safely instead of nagging forever',()=>{
 const {app,setClock}=setup();const now=Date.parse('2026-09-11T03:00:00Z');const m=createMaterial(app);
 app.command('commitment',{kind:'START_STUDY',title:m.title,dueAt:now,minutes:15,relatedMaterialId:m.id});
 setClock(now+40*3600000);const next=app.command('commitmentMaintenance',{});
 assert.equal(next.commitments[0].status,CommitmentStatus.EXPIRED);
});

test('old backups without commitments load with safe defaults',()=>{
 const legacy=fresh();delete legacy.commitments;delete legacy.initiativeStats;delete legacy.initiative;delete legacy.settings.companion;
 const migrated=migrate(legacy);
 assert.deepEqual(migrated.commitments,[]);assert.equal(migrated.settings.companion.proactivity,'NORMAL');assert.equal(migrated.initiativeStats.shown,0);
 assert.equal(nextDue(migrated.commitments,0),null);
});

test('backup and restore round-trip commitments and proactivity without transient state',()=>{
 const {host,app}=setup();const now=Date.parse('2026-09-11T03:00:00Z');const m=createMaterial(app);
 app.command('commitment',{kind:'START_STUDY',title:m.title,dueAt:now+60000,minutes:15,relatedMaterialId:m.id});
 app.command('companion',{proactivity:'HIGH'});
 const raw=JSON.stringify(app.state);
 const preview=app.previewImport(raw);assert.equal(preview.state.commitments.length,1);assert.equal(preview.state.settings.companion.proactivity,'HIGH');
 const restored=app.restore(preview);assert.equal(restored.commitments.length,1);assert.equal(restored.settings.companion.proactivity,'HIGH');
 assert.equal('pendingTyping' in restored,false);
});

test('the meaningful threshold scales with the promised duration',()=>{
 const now=Date.now(),session=seconds=>({endTimestamp:now,segments:[{start:now-seconds*1000,end:now}]});
 assert.equal(isMeaningful({minutes:15},session(700),now),false);
 assert.equal(isMeaningful({minutes:15},session(900),now),true);
 assert.equal(isMeaningful({minutes:15},session(2),now),false);
});

test('a commitment only matches the promised study context',()=>{
 const session={relatedMaterialId:'m1',relatedTaskId:null,relatedGoalId:null};
 assert.equal(matchesStudy({relatedMaterialId:'m1'},session),true);
 assert.equal(matchesStudy({relatedMaterialId:'m2'},session),false);
 assert.equal(matchesStudy({},session),true);
});
