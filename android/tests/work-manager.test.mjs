import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../app/src/main/java/org/shinyakushin/study/next/'+p,import.meta.url),'utf8');
const scheduler=read('LifeBalanceScheduler.java');
const worker=read('LifeBalanceWorker.java');
const main=read('MainActivity.java');
const receiver=read('BreakReceiver.java');
const gradle=fs.readFileSync(new URL('../app/build.gradle',import.meta.url),'utf8');
const manifest=fs.readFileSync(new URL('../app/src/main/AndroidManifest.xml',import.meta.url),'utf8');

test('periodic work is unique and never resets a live schedule',()=>{
 assert.ok(scheduler.includes('enqueueUniquePeriodicWork(UNIQUE,ExistingPeriodicWorkPolicy.KEEP,request)'));
 assert.ok(scheduler.includes('UNIQUE="life-balance-check"'));
});
test('periodic interval is bounded, not a per-second monitor',()=>{
 const match=scheduler.match(/INTERVAL_MINUTES=(\d+)/);
 assert.ok(match,'interval must be a named constant');
 const minutes=Number(match[1]);
 assert.ok(minutes>=15,`PeriodicWorkRequest needs an interval >= 15 minutes, got ${minutes}`);
});
test('no foreground service and no background rendering loop is declared',()=>{
 for(const source of [scheduler,worker,main])assert.ok(!/startForeground\(|ForegroundService|android:foregroundServiceType/.test(source));
 assert.ok(!/<service[\s>]/.test(manifest));
});
test('worker is scheduled on app start and re-armed after reboot, never duplicated',()=>{
 assert.ok(main.includes('LifeBalanceScheduler.ensure(this)'));
 assert.ok(receiver.includes('LifeBalanceScheduler.ensure(c)'));
});
test('worker reads read-only snapshots and never writes Study, Usage or Remote AI state',()=>{
 assert.ok(worker.includes('new StateStore(context)'),'worker must open the committed state read-only');
 assert.ok(!/store\.commit|preserveImport|\.replace\(/.test(worker));
 assert.ok(!/RemoteAI|requestRemoteAI/.test(worker),'background monitoring must stay local');
 assert.ok(worker.includes('LifeBalanceSnapshot.read('));
});
test('worker failure paths are safe no-ops that return success',()=>{
 assert.ok(!/Result\.failure\(\)|Result\.retry\(\)/.test(worker));
 const returns=worker.match(/Result\.success\(\)/g)||[];
 assert.ok(returns.length>=6,`expected every guard to be a no-op success, found ${returns.length}`);
 for(const reason of ['no-state','state-unreadable','no-life-balance','usage-unavailable','no-usage-access','error'])
  assert.ok(worker.includes('reason='+reason),`missing safe no-op for ${reason}`);
});
test('androidx.work is declared and androidx is enabled for it',()=>{
 assert.ok(gradle.includes("androidx.work:work-runtime:2.9.1"));
 assert.ok(fs.readFileSync(new URL('../gradle.properties',import.meta.url),'utf8').includes('android.useAndroidX=true'));
});
