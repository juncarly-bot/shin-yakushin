import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {fresh,apply,migrate} from '../app/src/main/assets/domain.js';
const categories={'com.google.android.youtube':'ENTERTAINMENT','com.twitter.android':'ENTERTAINMENT','com.android.chrome':'STUDY','com.openai.chatgpt':'STUDY','removed.example':'NEUTRAL'};
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
