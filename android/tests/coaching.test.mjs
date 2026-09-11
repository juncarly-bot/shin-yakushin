import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {StudyApplication} from '../app/src/main/assets/platform.js';
import {fresh} from '../app/src/main/assets/domain.js';
import {DailyModes,budgetFromSnapshot,coachingFromSnapshot,coachingMessage,interventionIdFor} from '../app/src/main/assets/life-balance.js';
const rows=readFileSync(new URL('./coaching-fixtures.tsv',import.meta.url),'utf8').split('\n').filter(x=>x&&!x.startsWith('#')).map(x=>x.split('\t'));
const snapshotOf=r=>({day:r[0].slice(0,10),dailyMode:r[1],entertainmentBudgetMinutes:r[1]===DailyModes.UNLIMITED?null:Number(r[2]),entertainmentUsedMinutes:Number(r[3]),studyGoalMinutes:Number(r[4]),studyCompletedMinutes:Number(r[5])});
for(const r of rows)test('shared coaching fixture: '+r[0],()=>{
 const decision=coachingFromSnapshot(snapshotOf(r),{interventionLevel:r[6],cooldownMinutes:Number(r[7]),lastInterventionAt:Number(r[8])},Number(r[9]));
 assert.equal(decision.level,r[10]);assert.equal(decision.speaker,r[11]==='null'?null:r[11]);assert.equal(decision.reason,r[12]);
});
test('real entertainment and study minutes drive the FOCUS intervention',()=>{
 const snapshot={day:'2026-09-11',dailyMode:'FOCUS',entertainmentBudgetMinutes:60,entertainmentUsedMinutes:82,studyGoalMinutes:180,studyCompletedMinutes:35,permissionGranted:true};
 const decision=coachingFromSnapshot(snapshot,{cooldownMinutes:120,interventionLevel:'NORMAL'},1700000000000);
 assert.equal(decision.level,'STRICT');assert.equal(decision.speaker,'NurseT');assert.equal(decision.budget.exceededMinutes,22);
 assert.match(coachingMessage(decision,decision.budget),/22分/);
});
test('budget below/above and unlimited resolve from the snapshot only',()=>{
 assert.equal(budgetFromSnapshot({dailyMode:'NORMAL',entertainmentBudgetMinutes:90,entertainmentUsedMinutes:90}).exceededMinutes,0);
 assert.equal(budgetFromSnapshot({dailyMode:'NORMAL',entertainmentBudgetMinutes:90,entertainmentUsedMinutes:91}).exceededMinutes,1);
 assert.equal(budgetFromSnapshot({dailyMode:'UNLIMITED',entertainmentBudgetMinutes:null,entertainmentUsedMinutes:999}).unlimited,true);
 assert.equal(coachingFromSnapshot({day:'d',dailyMode:'UNLIMITED',entertainmentBudgetMinutes:null,entertainmentUsedMinutes:999,studyGoalMinutes:180,studyCompletedMinutes:0},{},1).level,'NONE');
});
test('study goal complete is encouragement and incomplete over budget is an intervention',()=>{
 const base={day:'d',dailyMode:'NORMAL',entertainmentBudgetMinutes:90,entertainmentUsedMinutes:95};
 const complete=coachingFromSnapshot({...base,studyGoalMinutes:180,studyCompletedMinutes:180},{},1);
 assert.equal(complete.level,'NONE');assert.equal(complete.speaker,'SAYO');assert.equal(complete.reason,'goal-complete');
 const incomplete=coachingFromSnapshot({...base,studyGoalMinutes:180,studyCompletedMinutes:20},{},1);
 assert.equal(incomplete.speaker,'NurseT');
});
test('duplicate suppression and cooldown survive a restart',()=>{
 const snapshot={day:'2026-09-11',dailyMode:'NORMAL',entertainmentBudgetMinutes:90,entertainmentUsedMinutes:95,studyGoalMinutes:180,studyCompletedMinutes:20};
 const first=coachingFromSnapshot(snapshot,{cooldownMinutes:120},1700000000000);
 assert.equal(first.level,'STRICT');
 const cooled=coachingFromSnapshot(snapshot,{cooldownMinutes:120,lastInterventionAt:1700000000000},1700000000000+60000);
 assert.equal(cooled.reason,'cooldown');
 const duplicate=coachingFromSnapshot(snapshot,{cooldownMinutes:120,lastInterventionId:first.interventionId,lastInterventionAt:1700000000000},1700000000000+121*60000);
 assert.equal(duplicate.level,'NONE');assert.equal(duplicate.reason,'duplicate');
 const afterCooldown=coachingFromSnapshot(snapshot,{cooldownMinutes:120,lastInterventionAt:1700000000000},1700000000000+121*60000);
 assert.equal(afterCooldown.level,'STRICT');
});
test('day rollover issues a new intervention id for the same reason',()=>{
 const a={day:'2026-09-11',dailyMode:'NORMAL',entertainmentBudgetMinutes:90,entertainmentUsedMinutes:95,studyGoalMinutes:180,studyCompletedMinutes:20};
 const b={...a,day:'2026-09-12'};
 const first=coachingFromSnapshot(a,{cooldownMinutes:120},1700000000000);
 const nextDay=coachingFromSnapshot(b,{cooldownMinutes:120,lastInterventionId:first.interventionId,lastInterventionAt:1700000000000},1700086400000);
 assert.notEqual(first.interventionId,nextDay.interventionId);
 assert.equal(nextDay.level,'STRICT');assert.equal(nextDay.reason,'budget-exceeded');
 assert.equal(interventionIdFor(a,{reason:'budget-exceeded'},first.budget),interventionIdFor(a,{reason:'budget-exceeded'},first.budget));
});
test('notification tap adds one intervention message and survives restart',()=>{
 class Host{raw=null;read(){return JSON.stringify({ok:true,raw:this.raw})}commit(rev,raw){this.raw=raw;return this.read()}}
 const h=new Host();let clock=Date.UTC(2026,8,11,3);let app=new StudyApplication(h,()=>clock);app.load();
 const payload={interventionId:'2026-09-11|FOCUS|budget-exceeded|0',speaker:'NurseT',reason:'budget-exceeded',text:'娯楽が予定を22分超えています。そろそろ学習の続きに戻りませんか？'};
 app.command('intervention',payload);
 const afterFirst=app.state.messages.filter(m=>m.text===payload.text).length;
 assert.equal(afterFirst,1);
 app.command('intervention',payload);
 assert.equal(app.state.messages.filter(m=>m.text===payload.text).length,1);
 assert.equal(app.state.sessions.length,0);
 assert.equal(app.state.settings.lifeBalance.lastInterventionId,payload.interventionId);
 app=new StudyApplication(h,()=>clock+1000);app.load();
 app.command('intervention',payload);
 assert.equal(app.state.messages.filter(m=>m.text===payload.text).length,1);
});
test('independent interventions on different days are both recorded once',()=>{
 class Host{raw=null;read(){return JSON.stringify({ok:true,raw:this.raw})}commit(rev,raw){this.raw=raw;return this.read()}}
 const h=new Host();let clock=Date.UTC(2026,8,11,3);const app=new StudyApplication(h,()=>clock);app.load();
 const first={interventionId:'d1|NORMAL|budget-exceeded|0',speaker:'NurseT',reason:'budget-exceeded',text:'one'};
 app.command('intervention',first);clock+=86400000;
 app.command('intervention',{interventionId:'d2|NORMAL|budget-exceeded|0',speaker:'NurseT',reason:'budget-exceeded',text:'two'});
 assert.equal(app.state.messages.filter(m=>['one','two'].includes(m.text)).length,2);
 assert.equal(app.state.settings.lifeBalance.lastInterventionId,'d2|NORMAL|budget-exceeded|0');
 assert.equal(app.state.settings.lifeBalance.lastInterventionDay,'2026-09-12');
 assert.equal(fresh().settings.lifeBalance.lastInterventionId,undefined);
});
test('the app derives coaching from the real balance snapshot and keeps raw usage local',()=>{
 const ui=readFileSync(new URL('../app/src/main/assets/ui.js',import.meta.url),'utf8');
 const domain=readFileSync(new URL('../app/src/main/assets/domain.js',import.meta.url),'utf8');
 const remote=readFileSync(new URL('../app/src/main/assets/remote-ai.js',import.meta.url),'utf8');
 assert.match(ui,/coachingFromSnapshot\(dailyBalance/);
 assert.match(ui,/command\('intervention'/);
 assert.match(ui,/host\.requestDailyBalance\?\.\(\)/);
 assert.match(domain,/lb\.lastInterventionId===id\)return \{state:s,event:null/);
 assert.doesNotMatch(remote,/packageName|eventType|queryEvents|entertainmentUsedMinutes/);
});
