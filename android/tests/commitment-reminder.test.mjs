import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {CommitmentCopy,commitmentMessage,nextDue,CommitmentStatus} from '../app/src/main/assets/commitments.js';
const base=new URL('../app/src/main/java/org/shinyakushin/study/next/',import.meta.url);
const java=p=>fs.readFileSync(new URL(p,base),'utf8');
const scheduler=java('CommitmentScheduler.java'),worker=java('CommitmentWorker.java');
const check=java('CommitmentCheck.java'),notifier=java('CommitmentNotifier.java');
const copy=java('CommitmentCopy.java'),main=java('MainActivity.java'),receiver=java('BreakReceiver.java');
const manifest=fs.readFileSync(new URL('../app/src/main/AndroidManifest.xml',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../app/src/main/assets/ui.js',import.meta.url),'utf8');

test('a promise is scheduled once, inexactly, and replaces a stale delay',()=>{
 assert.match(scheduler,/enqueueUniqueWork\(UNIQUE,\s*ExistingWorkPolicy\.REPLACE,\s*request\)/);
 assert.match(scheduler,/OneTimeWorkRequest\.Builder\(CommitmentWorker\.class\)/);
 assert.match(scheduler,/setInitialDelay\(delay,\s*TimeUnit\.MILLISECONDS\)/);
 assert.match(scheduler,/UNIQUE\s*=\s*"commitment-reminder"/);
 assert.ok(!/setExact|AlarmManager|setAndAllowWhileIdle/.test(scheduler),'no exact alarm');
});

test('no exact-alarm permission and no second foreground service are needed',()=>{
 assert.ok(!manifest.includes('SCHEDULE_EXACT_ALARM'));
 for(const source of [scheduler,worker,notifier,check])assert.ok(!/startForeground\(|ForegroundService/.test(source));
 assert.ok(!/<service[\s>]/.test(manifest));
});

test('the next-due reader understands only open promises',()=>{
 assert.match(scheduler,/"PENDING"\.equals\(status\)/);
 assert.match(scheduler,/"SNOOZED"\.equals\(status\)/);
 assert.ok(scheduler.includes('snoozedUntil'));
 assert.match(scheduler,/return best;/);
});

test('the worker is a thin always-success wrapper over a read-only check',()=>{
 assert.ok(worker.includes('CommitmentCheck.run('));
 assert.ok(worker.includes('Result.success()'));
 assert.ok(!/Result\.failure\(\)|Result\.retry\(\)/.test(worker));
 assert.ok(check.includes('new StateStore(context)'),'opens state read-only');
 assert.ok(!/store\.commit|preserveImport|\.replace\(/.test(check));
 assert.ok(!/RemoteAI/.test(check),'reminders stay local');
 for(const reason of ['no-state','state-unreadable','notifications-off','study-active','no-due','error'])
  assert.ok(check.includes('reason='+reason),`missing safe no-op for ${reason}`);
});

test('a due promise is not repeated, but a snooze arms exactly one later prompt',()=>{
 assert.match(notifier,/signature\s*=\s*commitmentId\s*\+\s*"@"\s*\+\s*due/);
 assert.ok(notifier.includes('if (signature.equals(prefs.getString(KEY_SIG, ""))) return false;'));
 assert.ok(notifier.includes('prefs.edit().putString(KEY_SIG, signature).apply()'));
 assert.ok(notifier.includes('LifeBalanceNotifier.notificationsEnabled(context)'),'permission + toggle gate posting');
});

test('reminder copy is privacy-safe and identical across Java and JavaScript',()=>{
 for(const [name,value] of Object.entries(CommitmentCopy))assert.ok(copy.includes(`"${value}"`),`Java CommitmentCopy must mirror ${name}`);
 assert.deepEqual(commitmentMessage('SAYO'),{title:CommitmentCopy.TITLE_SAYO,body:CommitmentCopy.BODY_SAYO});
 assert.deepEqual(commitmentMessage('NurseT'),{title:CommitmentCopy.TITLE_NURSE_T,body:CommitmentCopy.BODY_NURSE_T});
 assert.deepEqual(commitmentMessage(null),{title:CommitmentCopy.TITLE_SAYO,body:CommitmentCopy.BODY_SAYO});
 for(const leak of ['グリフィス','分の学習','分、学習'])assert.ok(!copy.includes(leak),'no study detail on the lock screen');
});

test('the reminder deep link carries only the promise id and due time',()=>{
 for(const key of ['commitmentId','at'])assert.ok(notifier.includes(`putExtra("${key}"`),`missing ${key}`);
 assert.ok(notifier.includes('"org.shinyakushin.COMMITMENT"'));
 for(const leak of ['usage','material','title','minutes','speaker'])assert.ok(!notifier.includes(`putExtra("${leak}`),`deep link must not carry ${leak}`);
});

test('the schedule is re-armed on start, on commit, and after reboot',()=>{
 assert.ok(main.includes('CommitmentScheduler.ensure(this,initial)'));
 assert.ok(main.includes('CommitmentScheduler.ensure(MainActivity.this,raw)'));
 assert.ok(receiver.includes('CommitmentScheduler.ensure(c,raw)'));
});

test('a tap reuses the conversation and inserts the proposal at most once',()=>{
 assert.ok(main.includes('handleCommitment(getIntent())'));
 assert.ok(main.includes('handleCommitment(intent)'));
 assert.ok(main.includes('window.platformCommitment'));
 assert.match(ui,/window\.platformCommitment=raw=>/);
 assert.match(ui,/S\.initiative\?\.activeProposal\?\.commitmentId/);
 assert.match(ui,/command\('initiativeShow',proposal,true\)/);
 assert.match(ui,/evaluate\(S,now\(\),\{source:'notification'\}\)/);
});

test('an open promise never fires a notification while study is running',()=>{
 assert.ok(check.includes('activeSession(state)'));
 assert.ok(check.includes('isNull("endTimestamp")'));
 assert.ok(check.includes('settings.optBoolean("notifications")'));
});

test('nextDue picks the earliest open promise and ignores closed ones',()=>{
 const now=Date.parse('2026-09-11T12:00:00Z');
 const state={commitments:[
  {commitmentId:'a',status:CommitmentStatus.COMPLETED,dueAt:now-1000},
  {commitmentId:'b',status:CommitmentStatus.PENDING,dueAt:now+60000},
  {commitmentId:'c',status:CommitmentStatus.SNOOZED,snoozedUntil:now+30000}
 ]};
 assert.equal(nextDue(state.commitments,now),now+30000,'earliest open moment wins');
 assert.equal(nextDue([{status:CommitmentStatus.DECLINED,dueAt:now}],now),null);
 assert.equal(nextDue([],now),null);
});
