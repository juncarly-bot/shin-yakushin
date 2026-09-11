import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {StudyApplication} from '../app/src/main/assets/platform.js';
import {fresh} from '../app/src/main/assets/domain.js';
import {coachingFromSnapshot,interventionMessage} from '../app/src/main/assets/life-balance.js';
import {aggregateFromSnapshot,dailyCounts,weeklySummary,weeklyContext,weeklyReply,weekStart,shiftDay,localDay,pendingFinalizedDays,upsertDaily} from '../app/src/main/assets/life-balance-analytics.js';
const java=p=>fs.readFileSync(new URL('../app/src/main/java/org/shinyakushin/study/next/'+p,import.meta.url),'utf8');
const asset=p=>fs.readFileSync(new URL('../app/src/main/assets/'+p,import.meta.url),'utf8');
const zone=Intl.DateTimeFormat().resolvedOptions().timeZone;
const localMidnight=d=>new Date(d+'T00:00:00').getTime();
class Host{raw=null;writes=0;read(){return JSON.stringify({ok:true,raw:this.raw})}commit(rev,raw){this.writes++;this.raw=raw;return this.read()}}
const focusLifeBalance=lb=>({...lb,dailyMode:'FOCUS',budgetMinutes:{NORMAL:90,HOLIDAY:180,FOCUS:60},studyGoalMinutes:180});

test('end to end: FOCUS over-budget intervention returns to study and reaches the weekly review',()=>{
 const host=new Host();let clock=Date.parse('2026-09-11T03:00:00Z');
 const app=new StudyApplication(host,()=>clock);app.load();
 app.command('settings',{...app.state.settings,lifeBalance:focusLifeBalance(app.state.settings.lifeBalance)});
 const day=localDay(clock);
 // The real Usage + Study snapshot decides NurseT strict before any intervention exists.
 const snapshot={permissionGranted:true,observedAt:clock,day,dailyMode:'FOCUS',entertainmentBudgetMinutes:60,entertainmentUsedMinutes:82,studyGoalMinutes:180,studyCompletedMinutes:35};
 const decision=coachingFromSnapshot(snapshot,app.state.settings.lifeBalance,clock);
 assert.equal(decision.speaker,'NurseT');assert.equal(decision.level,'STRICT');assert.equal(decision.budget.exceededMinutes,22);
 // Notification tap merges exactly one intervention into the existing conversation.
 app.command('intervention',{interventionId:decision.interventionId,speaker:'NurseT',reason:'budget-exceeded',text:interventionMessage('budget-exceeded','NurseT').body});
 assert.equal(app.state.messages.filter(m=>m.intent==='intervention').length,1,'one intervention message');
 // Return to study inside the recovery window.
 clock+=5*60000;app.command('start',{sessionId:'s1',title:'積分'});
 clock+=15*60000;app.command('finish',{sessionId:'s1'});
 const counts=dailyCounts(app.state,day,zone);
 assert.equal(counts.interventionCount,1);assert.equal(counts.recoveryCount,1);
 assert.equal(app.state.sessions.length,1,'Usage-side coaching never adds a StudySession beyond the real one');
 // Daily aggregate carries the real totals plus the local counts; the day stays partial.
 const aggregate=aggregateFromSnapshot(snapshot,app.state.sessions,zone,counts);
 assert.equal(aggregate.complete,false);assert.equal(aggregate.entertainmentMinutes,82);assert.equal(aggregate.goalMinutes,180);
 assert.equal(aggregate.interventionCount,1);assert.equal(aggregate.recoveryCount,1);
 let ledger=app.recordDailyAggregate(aggregate).lifeBalanceAnalytics;
 // A finalized past day keeps the ledger complete while today stays partial.
 const date=shiftDay(day,-1);
 ledger=app.recordDailyAggregate({date,timeZone:zone,startMs:localMidnight(date),endMs:localMidnight(day),observedAt:localMidnight(day),complete:true,mode:'FOCUS',budgetMinutes:60,studyMinutes:120,goalMinutes:180,entertainmentMinutes:30,studyAppMinutes:60,neutralMinutes:20}).lifeBalanceAnalytics;
 const week=weeklySummary(ledger,weekStart(clock));
 assert.equal(week.observedDays,2);assert.equal(week.completeDays,1);assert.equal(week.studyMinutes,155);
 assert.equal(week.interventionCount,1);assert.equal(week.recoveryCount,1);
 const context=weeklyContext(ledger,weekStart(clock),{relevant:true});
 assert.equal(context.studyMinutes,155);assert.ok(!JSON.stringify(context).includes('startMs'));
 assert.match(weeklyReply(context),/2時間35分/);
 // 「今週どうだった？」 resolves locally and never touches Study.
 const sessions=JSON.stringify(app.state.sessions);
 app.command('conversation',{text:'今週どうだった？'});
 assert.equal(JSON.stringify(app.state.sessions),sessions);
});

test('finalized history never downgrades an already-complete day',()=>{
 const ledger=upsertDaily(undefined,{date:'2026-09-10',timeZone:'UTC',startMs:Date.parse('2026-09-10Z'),endMs:Date.parse('2026-09-11Z'),observedAt:Date.parse('2026-09-11Z'),complete:true,mode:'NORMAL',budgetMinutes:90,studyMinutes:60,goalMinutes:180,entertainmentMinutes:30,interventionCount:3,recoveryCount:2});
 const partial={date:'2026-09-11',timeZone:'UTC',startMs:Date.parse('2026-09-11Z'),endMs:Date.parse('2026-09-12Z'),observedAt:Date.parse('2026-09-12Z'),complete:true,mode:'NORMAL',budgetMinutes:90};
 const pending=pendingFinalizedDays(ledger,[{date:'2026-09-10'},{date:'2026-09-11'},null,{date:7}]);
 assert.deepEqual(pending.map(d=>d.date),['2026-09-11']);
 const after=pendingFinalizedDays(upsertDaily(ledger,{...partial,date:'2026-09-11'}),[{date:'2026-09-10'},{date:'2026-09-11'}]);
 assert.deepEqual(after,[]);
 assert.equal(ledger.days[0].interventionCount,3,'the finalized day keeps its authoritative counts');
});
test('daily counts ignore non-intervention messages and count each session once',()=>{
 const host=new Host();const clock=Date.parse('2026-09-11T03:00:00Z');const app=new StudyApplication(host,()=>clock);app.load();
 const day=localDay(clock);
 app.command('intervention',{interventionId:'d|NORMAL|budget-exceeded|0',speaker:'SAYO',reason:'budget-exceeded',text:'休もう'});
 app.command('intervention',{interventionId:'d|NORMAL|budget-exceeded|0',speaker:'SAYO',reason:'budget-exceeded',text:'休もう'});
 const counts=dailyCounts(app.state,day,zone);
 assert.equal(counts.interventionCount,1,'duplicate taps never inflate the daily count');
 assert.equal(counts.recoveryCount,0,'no session yet');
 assert.deepEqual(dailyCounts(app.state,'not-a-date',zone),{interventionCount:0,recoveryCount:0});
});

test('past-day finalization is bounded, read-only and uses the default mode',()=>{
 const history=java('LifeBalanceHistory.java');
 assert.ok(history.includes('if(!repo.hasUsageAccess())return days;'),'no permission yields no finalized days');
 assert.ok(history.includes('date.plusDays(1).atStartOfDay(zone)'),'windows are local-midnight bounded');
 assert.ok(history.includes('.put("complete",true)'),'past days are finalized');
 assert.ok(history.includes('optString("defaultMode","NORMAL")'),'a past day is not judged by today special mode');
 assert.ok(!/store\.commit|preserveImport|\.replace\(|System\.currentTimeMillis\(\)\s*;?\s*store/.test(history));
 assert.ok(history.includes('/60000L'),'minutes come from bounded millisecond sums');
});

test('history and the debug trigger are bridged natively and gated to debug builds',()=>{
 const main=java('MainActivity.java');
 assert.ok(main.includes('LifeBalanceHistory.read(MainActivity.this,store.read()'),'history is read-only from committed state');
 assert.ok(main.includes('window.platformDailyHistory'));
 assert.ok(main.includes('ApplicationInfo.FLAG_DEBUGGABLE'),'debug trigger uses the debuggable flag, not a release build config');
 assert.ok(main.includes('LifeBalanceCheck.run(this,System.currentTimeMillis())'),'debug trigger runs the same check as the worker');
 const ui=asset('ui.js');
 assert.ok(ui.includes('host.debugToolsEnabled?.()'),'the QA button is hidden unless the host reports a debug build');
 assert.ok(ui.includes("host.runLifeBalanceNow?.()"));
 assert.match(ui,/platformDailyHistory/);
 assert.match(ui,/dailyCounts\(S,day\.date,zone\)/);
 assert.match(ui,/app\.recordDailyAggregate/);
});

test('the merged ui keeps coaching, intervention and analytics on the same callback',()=>{
 const ui=asset('ui.js');
 assert.match(ui,/function applyCoaching\(\)/);
 assert.match(ui,/window\.platformIntervention/);
 assert.match(ui,/aggregateFromSnapshot\(dailyBalance,S\.sessions\)/);
 const callback=ui.split('\n').find(line=>line.startsWith('window.platformDailyBalance='));
 assert.ok(callback.indexOf('applyCoaching()')<callback.indexOf('aggregateFromSnapshot'),'coaching runs before the analytics save');
 assert.ok(callback.includes('catch{toast(\'集計の保存を見送りました'),'an analytics failure is caught on its own');
});

test('core domain keeps the intervention action and the compatibility migration together',()=>{
 const domain=asset('domain.js');
 assert.match(domain,/case 'intervention'/);
 assert.match(domain,/compatibleLifeBalance\(original\.settings\.lifeBalance/);
 assert.match(domain,/lastInterventionId/);
});

test('the worker remains thin and read-only after the shared check extraction',()=>{
 const worker=java('LifeBalanceWorker.java');
 assert.ok(worker.includes('LifeBalanceCheck.run(getApplicationContext()'));
 assert.ok(!/StateStore|LifeBalanceSnapshot|RemoteAI/.test(worker));
 assert.ok(worker.includes('Result.success()'));
});
