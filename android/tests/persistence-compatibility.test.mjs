import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {StudyApplication} from '../app/src/main/assets/platform.js';
import {fresh,migrate,metrics} from '../app/src/main/assets/domain.js';

// Fault injection at the real JS/native boundary, not an Android SQLite test.
class ReadOnlyHost {
 constructor(raw){this.raw=raw;this.writes=0;}
 read(){return JSON.stringify({ok:true,raw:this.raw});}
 commit(){this.writes++;throw Error('unexpected write while loading');}
}
const golden=JSON.parse(fs.readFileSync(new URL('./v01-golden.json',import.meta.url)));
function legacy(){const s=migrate(golden.state);delete s.settings.lifeBalance;return s;}
function load(s){const raw=typeof s==='string'?s:JSON.stringify(s),host=new ReadOnlyHost(raw),app=new StudyApplication(host);return {host,app,raw};}
test('old schema-2 state without LifeBalance loads with defaults and no native write',()=>{
 const original=legacy(),{host,app,raw}=load(original),next=app.load();
 assert.deepEqual(next.settings.lifeBalance,fresh().settings.lifeBalance);
 assert.equal(host.raw,raw);assert.equal(host.writes,0);
 const withoutDefaults=structuredClone(next);delete withoutDefaults.settings.lifeBalance;
 assert.deepEqual(withoutDefaults,original);
 assert.deepEqual(metrics(next,golden.now),metrics(original,golden.now));
});
test('unknown compatible fields and user categories survive migration and restart',()=>{
 const s=legacy();s.futureExtension={keep:['unchanged']};s.settings.lifeBalance={appCategories:{'uninstalled.package':'STUDY'},futureOption:42};
 const {host,app}=load(s);assert.deepEqual(app.load(),s);
 assert.deepEqual(new StudyApplication(host).load(),s);assert.equal(host.writes,0);
});
test('missing optional voice, conversation and timeline fields do not require a reset',()=>{
 const s=legacy();delete s.conversation;delete s.messages;delete s.settings.voice;
 const {host,app}=load(s);assert.doesNotThrow(()=>app.load());assert.equal(host.writes,0);
});
test('corrupt JSON and invalid required core fields remain byte-for-byte unchanged',()=>{
 for(const input of ['{"schemaVersion":2,',JSON.stringify({...legacy(),sessions:null}),JSON.stringify({...legacy(),schemaVersion:99})]){
  const {host,app,raw}=load(input);assert.throws(()=>app.load());assert.equal(host.raw,raw);assert.equal(host.writes,0);assert.equal(app.state,null);
 }
});
test('failure after migration during timeline validation never publishes partial state',()=>{
 const s=legacy();s.messages=[{id:'bad',speaker:'unknown',text:'x',at:1}];
 const {host,app,raw}=load(s);const previous=fresh();app.state=previous;
 assert.throws(()=>app.load());assert.equal(app.state,previous);assert.equal(host.raw,raw);assert.equal(host.writes,0);
});
test('successful migrated serialization can be reloaded without altering study or reward inputs',()=>{
 const original=legacy(),first=load(original).app.load();
 const second=load(JSON.stringify(first)).app.load();assert.deepEqual(second,first);
 for(const key of ['sessions','memories','progressEvents','visits','materials','goals','tasks','plans','dialogueHistory'])assert.deepEqual(second[key],original[key]);
 assert.deepEqual(metrics(second,golden.now),metrics(original,golden.now));
});
