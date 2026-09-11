import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,readdirSync} from 'node:fs';
const assets=new URL('../app/src/main/assets/',import.meta.url);
const activity=readFileSync(new URL('../app/src/main/java/org/shinyakushin/study/next/MainActivity.java',import.meta.url),'utf8');
const allowed=new Set([...activity.matchAll(/"(\/[^"]+\.(?:js|css|png|html))"/g)].map(m=>m[1]));
const files=readdirSync(assets).filter(name=>name.endsWith('.js'));

test('every asset module import resolves to an allow-listed WebView asset',()=>{
 for(const name of files){
  const source=readFileSync(new URL(name,assets),'utf8');
  for(const m of source.matchAll(/from\s+'\.\/([^']+)'/g)){
   assert.ok(allowed.has('/'+m[1]),`${name} imports ./${m[1]} which is not served by MainActivity`);
  }
 }
});

test('the latency instrumentation asset is served to the WebView',()=>{
 assert.ok(allowed.has('/latency.js'));
 assert.ok(files.includes('latency.js'));
});
