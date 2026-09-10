import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {fresh,apply,migrate} from '../app/src/main/assets/domain.js';
const categories={'com.google.android.youtube':'ENTERTAINMENT','com.twitter.android':'ENTERTAINMENT','com.android.chrome':'STUDY','com.openai.chatgpt':'STUDY','removed.example':'NEUTRAL'};
test('daily summary renders joined usage and study without treating unavailable usage as zero',()=>{
 const ui=fs.readFileSync(new URL('../app/src/main/assets/ui.js',import.meta.url),'utf8');
 const source=ui.split('\n').find(l=>l.startsWith('function balanceText('));
 const context=vm.createContext({});vm.runInContext(source,context);
 const unavailable=vm.runInContext('balanceText(null)',context);assert.match(unavailable,/未取得/);
 context.snapshot={permissionGranted:true,entertainmentUsedMinutes:82,entertainmentBudgetMinutes:60,entertainmentRemainingMinutes:0,studyCompletedMinutes:35,studyGoalMinutes:180};
 const text=vm.runInContext('balanceText(snapshot)',context);assert.match(text,/82分 \/ 60分/);assert.match(text,/学習 35分 \/ 180/);
 context.snapshot.entertainmentBudgetMinutes=null;context.snapshot.entertainmentRemainingMinutes=null;
 assert.match(vm.runInContext('balanceText(snapshot)',context),/制限なし/);
});
test('classifications survive serialized reload and missing installed packages',()=>{
 const s=fresh();const saved=apply(s,'settings',{...s.settings,lifeBalance:{...s.settings.lifeBalance,appCategories:categories}}).state;
 const restored=migrate(JSON.parse(JSON.stringify(saved)));
 assert.deepEqual(restored.settings.lifeBalance.appCategories,categories);
 assert.deepEqual(restored.sessions,s.sessions);assert.deepEqual(restored.memories,s.memories);
});
test('catalog renders current package category without inferred defaults',()=>{
 const ui=fs.readFileSync(new URL('../app/src/main/assets/ui.js',import.meta.url),'utf8');
 const source=ui.split('\n').find(l=>l.startsWith('function appCatalogRows('));
 const apps=Object.keys(categories).map(packageName=>({packageName,label:packageName,icon:''}));
 const html=vm.runInNewContext(source+';appCatalogRows(apps,categories)',{apps,categories,E:String});
 assert.equal((html.match(/value="ENTERTAINMENT" selected/g)||[]).length,2);
 assert.equal((html.match(/value="STUDY" selected/g)||[]).length,2);
 assert.equal((html.match(/value="NEUTRAL" selected/g)||[]).length,1);
});
