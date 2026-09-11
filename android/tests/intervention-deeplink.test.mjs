import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {StudyApplication} from '../app/src/main/assets/platform.js';
import {interventionMessage} from '../app/src/main/assets/life-balance.js';
const main=fs.readFileSync(new URL('../app/src/main/java/org/shinyakushin/study/next/MainActivity.java',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../app/src/main/assets/ui.js',import.meta.url),'utf8');
const copy=fs.readFileSync(new URL('../app/src/main/java/org/shinyakushin/study/next/InterventionCopy.java',import.meta.url),'utf8');

test('notification tap is delivered to the running or cold activity',()=>{
 assert.ok(main.includes('public void onNewIntent(Intent intent)'),'warm activity must receive the tap');
 assert.ok(main.includes('handleIntervention(getIntent())'),'cold start must consume the tap');
 assert.ok(main.includes('LifeBalanceNotifier.ACTION.equals(intent.getAction())'),'only the life-balance action is handled');
 assert.ok(main.includes('web.evaluateJavascript("window.platformIntervention && window.platformIntervention('),'payload reaches the JS timeline');
 assert.ok(main.includes('if(!webReady){pendingIntervention=json;return;}'),'a tap before page load must be queued once');
});

test('the deep link carries only the minimal payload',()=>{
 for(const key of ['interventionId','speaker','reason','day','at'])assert.ok(main.includes(`getStringExtra("${key}")`)||main.includes(`getLongExtra("${key}"`),`missing ${key}`);
 for(const leak of ['packageName','entertainmentUsedMinutes','studyCompletedMinutes','appCategories','events'])assert.ok(!main.includes(`getStringExtra("${leak}"`),`raw usage must not travel through the Intent: ${leak}`);
});

test('the JS handler merges into the existing conversation and opens it',()=>{
 assert.match(ui,/interventionMessage\(p\.reason,p\.speaker\)\.body/);
 assert.match(ui,/command\('intervention',\{interventionId:p\.interventionId/);
 assert.match(ui,/page='chat';render\(\)/);
 assert.ok(!/new Conversation|conversation\s*=\s*\{\}/.test(ui),'a tap must not create a second conversation');
});

test('the local copy is shared by the notification and the conversation',()=>{
 const message=interventionMessage('budget-exceeded','NurseT');
 assert.equal(message.body,'そろそろ戻ってきませんか？');
 assert.ok(copy.includes(`"${message.body}"`),'notification body and conversation text must match');
});

test('a notification tap adds exactly one message and survives a restart',()=>{
 class Host{raw=null;read(){return JSON.stringify({ok:true,raw:this.raw})}commit(rev,raw){this.raw=raw;return this.read()}}
 const host=new Host();const clock=()=>Date.UTC(2026,8,11,3);
 let app=new StudyApplication(host,clock);app.load();
 const tap={interventionId:'2026-09-11|FOCUS|budget-exceeded|1',speaker:'NurseT',reason:'budget-exceeded'};
 const text=interventionMessage(tap.reason,tap.speaker).body;
 app.command('intervention',{...tap,text});
 assert.equal(app.state.messages.filter(m=>m.text===text).length,1,'one message on first tap');
 assert.equal(app.state.settings.lifeBalance.lastInterventionId,tap.interventionId);
 app.command('intervention',{...tap,text});
 assert.equal(app.state.messages.filter(m=>m.text===text).length,1,'repeat taps never duplicate');
 app=new StudyApplication(host,()=>Date.UTC(2026,8,11,4));app.load();
 app.command('intervention',{...tap,text});
 assert.equal(app.state.messages.filter(m=>m.text===text).length,1,'restart keeps the dedupe');
 assert.equal(app.state.sessions.length,0,'Usage-driven coaching never writes StudySession');
});

test('local rules carry the conversation when Remote AI is unavailable',()=>{
 class Host{raw=null;read(){return JSON.stringify({ok:true,raw:this.raw})}commit(rev,raw){this.raw=raw;return this.read()}}
 const host=new Host();const app=new StudyApplication(host,()=>Date.UTC(2026,8,11,3));app.load();
 assert.equal(app.host.remoteAIAvailable?.(),undefined,'this host has no remote AI at all');
 const message=interventionMessage('budget-exceeded','SAYO');
 app.command('intervention',{interventionId:'d|NORMAL|budget-exceeded|0',speaker:'SAYO',reason:'budget-exceeded',text:message.body});
 assert.equal(app.state.messages.filter(m=>m.text===message.body).length,1,'local copy still reaches the timeline');
});
