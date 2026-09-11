import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {InterventionCopy,interventionMessage} from '../app/src/main/assets/life-balance.js';
const java=p=>fs.readFileSync(new URL('../app/src/main/java/org/shinyakushin/study/next/'+p,import.meta.url),'utf8');
const notifier=java('LifeBalanceNotifier.java');
const copy=java('InterventionCopy.java');
const worker=java('LifeBalanceWorker.java');
const main=java('MainActivity.java');
const manifest=fs.readFileSync(new URL('../app/src/main/AndroidManifest.xml',import.meta.url),'utf8');

test('notification channel is declared and created, not a foreground service',()=>{
 assert.ok(notifier.includes('CHANNEL="life-balance"'));
 assert.ok(notifier.includes('new NotificationChannel(CHANNEL,"生活バランス",NotificationManager.IMPORTANCE_DEFAULT)'));
 assert.ok(main.includes('LifeBalanceNotifier.ensureChannel(this)'));
 assert.ok(manifest.includes('android.permission.POST_NOTIFICATIONS'));
});

test('POST_NOTIFICATIONS denial disables only the notification',()=>{
 assert.ok(notifier.includes('BreakReceiver.permitted(c)'),'runtime permission must gate posting');
 assert.ok(notifier.includes('areNotificationsEnabled()'),'app toggle must gate posting');
 assert.ok(!/Result\.failure|startForeground/.test(notifier));
 assert.ok(worker.includes('notified="+notified'),'worker logs whether a notification was posted');
});

test('copy is privacy-safe and identical across Java and JavaScript',()=>{
 assert.equal(InterventionCopy.TITLE_NURSE_T,'Tから呼ばれています');
 assert.equal(InterventionCopy.TITLE_SAYO,'小夜から');
 assert.equal(InterventionCopy.BODY_RETURN,'そろそろ戻ってきませんか？');
 assert.equal(InterventionCopy.BODY_GENTLE,'少し休んだら、学習の続きに戻ろう。');
 assert.equal(InterventionCopy.BODY_GOAL_COMPLETE,'今日の目標まで届いたね。よく頑張った。');
 for(const value of Object.values(InterventionCopy))assert.ok(!/\d/.test(value),`copy must not contain numbers: ${value}`);
 for(const [name,value] of Object.entries(InterventionCopy))assert.ok(copy.includes(`"${value}"`),`Java InterventionCopy must mirror ${name}`);
 assert.deepEqual(interventionMessage('budget-exceeded','NurseT'),{title:InterventionCopy.TITLE_NURSE_T,body:InterventionCopy.BODY_RETURN});
 assert.deepEqual(interventionMessage('budget-exceeded','SAYO'),{title:InterventionCopy.TITLE_SAYO,body:InterventionCopy.BODY_GENTLE});
 assert.deepEqual(interventionMessage('goal-complete','SAYO'),{title:InterventionCopy.TITLE_SAYO,body:InterventionCopy.BODY_GOAL_COMPLETE});
});

test('notification carries a minimal deep-link payload with no usage data',()=>{
 for(const key of ['interventionId','speaker','reason','day','at'])assert.ok(notifier.includes(`putExtra("${key}"`),`missing ${key}`);
 assert.ok(notifier.includes('"org.shinyakushin.LIFE_BALANCE"'));
 for(const leak of ['usage','Usage','package','minutes','entertainmentUsedMinutes','appCategories'])assert.ok(!notifier.includes(`putExtra("${leak}`),`deep link must not carry ${leak}`);
});

test('duplicate and cooldown state persists across restart through SharedPreferences',()=>{
 assert.ok(notifier.includes('PREFS="life-balance-notify"'));
 assert.ok(notifier.includes('KEY_ID="lastNotifiedId"')&&notifier.includes('KEY_AT="lastNotifiedAt"'));
 assert.ok(notifier.includes('getSharedPreferences(PREFS,Context.MODE_PRIVATE)'));
 assert.ok(notifier.includes('prefs.edit().putString(KEY_ID,interventionId).putLong(KEY_AT,now).apply()'));
});

test('notification opt-out and non-actionable decisions stay silent',()=>{
 assert.ok(notifier.includes('optBoolean("usageNotifications",true)'));
 assert.ok(notifier.includes('decision.actionable()'));
 const workerGate=worker.indexOf('LifeBalanceNotifier.maybeNotify');
 assert.ok(workerGate>0,'worker must route the decision through the notifier');
});
