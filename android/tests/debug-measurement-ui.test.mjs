import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');
const ui=read('app/src/main/assets/ui.js'),css=read('app/src/main/assets/style.css'),main=read('app/src/main/java/org/shinyakushin/study/next/MainActivity.java');

test('development controls are separated from the normal menu',()=>{
 const more=ui.slice(ui.indexOf('function more(){'),ui.indexOf('function settings()'));
 assert.match(more,/\$\{debugPanel\(\)\}/);
 assert.doesNotMatch(more,/debugLifeBalance|debugInitiative|debugCommitment/);
 assert.match(ui,/details class="debug-panel section" data-debug-panel/);
 assert.match(css,/\.debug-panel\{/);
});

test('debug actions report measured wall time instead of only a toast',()=>{
 assert.match(ui,/performance\.now\(\)/);
 for(const key of ['lifeBalance','initiative','commitment'])assert.ok(ui.includes(`runDebugMeasurement('${key}'`),key);
 assert.match(ui,/elapsedMs:measuredMs/);
});

test('native startup marks are exposed to debug UI as an actual process-start measurement',()=>{
 assert.match(main,/Map<String,Long> startupMeasurements/);
 assert.match(main,/public String startupMeasurements\(\)/);
 assert.match(main,/timeToUsableChatMs/);
 assert.match(ui,/process start → composer interactive/);
});

test('TT compact speaker label is no longer a bare T',()=>{
 assert.match(css,/content:"TTちゃん";font-size:12px/);
 assert.doesNotMatch(css,/content:"T";font-size:12px/);
});
