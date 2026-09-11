import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import vm from 'node:vm';
const main=fs.readFileSync(new URL('../app/src/main/java/org/shinyakushin/study/next/MainActivity.java',import.meta.url),'utf8');
const repo=fs.readFileSync(new URL('../app/src/main/java/org/shinyakushin/study/next/AppUsageRepository.java',import.meta.url),'utf8');
test('usage access bridge is optional and opens Android settings',()=>{assert.ok(main.includes('usageAccessAllowed()'));assert.ok(main.includes('openUsageAccessSettings()'));assert.ok(repo.includes('Settings.ACTION_USAGE_ACCESS_SETTINGS'))});
const ui=fs.readFileSync(new URL('../app/src/main/assets/ui.js',import.meta.url),'utf8');
for(const granted of [true,false])test(`permission settings renders actual bridge state: ${granted}`,()=>{
 const source=ui.split('\n').find(line=>line.startsWith('function settings()'));
 const html=vm.runInNewContext(source+';settings()', {S:{settings:{}},host:{usageAccessAllowed:()=>granted,notificationAllowed:()=>false},remoteAI:null,E:String,voiceForm:()=>'',today:()=>'2026-09-11'});
 assert.ok(html.includes(`使用状況へのアクセス: ${granted?'許可済み':'未許可'}`));
 assert.ok(html.includes('data-action="usageAccess"'));
 assert.ok(html.includes('未許可でも学習と会話は通常どおり使えます'));
});
test('all JavaScript module imports are served by the local WebView allowlist',()=>{
 const dir=new URL('../app/src/main/assets/',import.meta.url);
 for(const file of fs.readdirSync(dir).filter(x=>x.endsWith('.js'))){
  const code=fs.readFileSync(new URL(file,dir),'utf8');
  for(const match of code.matchAll(/from\s+['"]\.\/([^'"]+\.js)['"]/g))assert.ok(main.includes('"/'+match[1]+'"'),`${file} imports blocked module ${match[1]}`);
 }
});
