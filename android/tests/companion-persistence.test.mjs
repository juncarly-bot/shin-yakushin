import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {StudyApplication} from '../app/src/main/assets/platform.js';
import {fresh,validate,migrate,metrics} from '../app/src/main/assets/domain.js';
import {assessMigration} from '../app/src/main/assets/migration-verify.js';
import {detectThread,ThreadStatus} from '../app/src/main/assets/continuity.js';
import {enqueueReturn,ReturnKind} from '../app/src/main/assets/return-queue.js';
import {addShared,addCharacterMemory} from '../app/src/main/assets/character-memory.js';
const T=Date.parse('2026-09-11T03:00:00Z'),DAY=86400000;
class Host{raw=null;writes=0;read(){return JSON.stringify({ok:true,raw:this.raw})}commit(rev,raw){this.writes++;this.raw=raw;return this.read()}}
const golden=JSON.parse(fs.readFileSync(new URL('./v01-golden.json',import.meta.url),'utf8'));

test('an old backup loads with safe empty companion state',()=>{
 const legacy=migrate(JSON.parse(JSON.stringify(golden.state)));
 assert.deepEqual(legacy.sharedMemories,[]);
 assert.deepEqual(legacy.characterMemories,{SAYO:[],NurseT:[]});
 assert.deepEqual(legacy.openThreads,[]);
 assert.deepEqual(legacy.returnQueue,[]);
 assert.equal(legacy.schemaVersion,2,'the schema version is not bumped for additive fields');
 assert.equal(legacy.sessions.length,golden.state.sessions.length);
});

test('new companion state survives a restart',()=>{
 const host=new Host();let now=T;const app=new StudyApplication(host,()=>now);app.load();
 addShared(app.state,{id:'shared:1',text:'グリフィス第1章を完了',importance:5},T);
 addCharacterMemory(app.state,'SAYO',{id:'sayo:1',text:'かなり嬉しそうだった'},T);
 addCharacterMemory(app.state,'NurseT',{id:'tt:1',text:'予定より早く完了した'},T);
 detectThread(app.state,'境界条件まだよく分からない',T);
 enqueueReturn(app.state,{id:'return:1',kind:ReturnKind.PATTERN,summary:'後半の方が長く続いていたね',availableAfter:T+DAY},T);
 app.command('chat',{text:'ただいま'});
 const reloaded=new StudyApplication(host,()=>now).load();
 assert.equal(reloaded.sharedMemories[0].id,'shared:1');
 assert.deepEqual(reloaded.characterMemories.SAYO.map(m=>m.id),['sayo:1']);
 assert.deepEqual(reloaded.characterMemories.NurseT.map(m=>m.id),['tt:1']);
 assert.equal(reloaded.openThreads[0].status,ThreadStatus.OPEN);
 assert.equal(reloaded.openThreads[0].topic,'境界条件');
 assert.equal(reloaded.returnQueue[0].id,'return:1');
 assert.equal(reloaded.returnQueue[0].deliveredAt,null);
});

test('backup and restore keep the separated memory and continuity state',()=>{
 const host=new Host();let now=T;const app=new StudyApplication(host,()=>now);app.load();
 app.clock=()=>T;app.command('start',{sessionId:'s1',title:'グリフィス電磁気学'});
 app.clock=()=>T+95*60000;app.command('finish',{sessionId:'s1'});
 app.command('chat',{text:'境界条件まだよく分からない'});
 const backup=host.raw;
 const target=new StudyApplication(new Host());
 target.load();
 target.restore(target.previewImport(backup));
 assert.deepEqual(target.state.sharedMemories,app.state.sharedMemories);
 assert.deepEqual(target.state.characterMemories,app.state.characterMemories);
 assert.deepEqual(target.state.openThreads,app.state.openThreads);
 assert.deepEqual(target.state.returnQueue,app.state.returnQueue);
 assert.deepEqual(metrics(target.state,now),metrics(app.state,now));
 assert.ok(target.state.sharedMemories.length>0);
 assert.ok(target.state.openThreads.length>0);
});

test('migration verification recognises the new fields as known and preserved',()=>{
 const s=fresh();
 addShared(s,{id:'shared:1',text:'記録',importance:4},T);
 addCharacterMemory(s,'NurseT',{id:'tt:1',text:'所見'},T);
 detectThread(s,'境界条件まだよく分からない',T);
 enqueueReturn(s,{id:'return:1',kind:ReturnKind.PATTERN,summary:'s',availableAfter:T+1},T);
 const report=assessMigration(JSON.stringify(s),{name:'backup.json',format:'json'});
 assert.equal(report.pass,true);
 assert.deepEqual(report.unknownFields.names,[]);
 assert.equal(report.entityCounts.materials,s.materials.length);
 const withUnknown=JSON.parse(JSON.stringify(s));withUnknown.experimentalField={kept:true};
 const second=assessMigration(JSON.stringify(withUnknown),{});
 assert.deepEqual(second.unknownFields.names,['experimentalField']);
 assert.equal(second.pass,true);
});

test('transient render state is never persisted',()=>{
 const s=fresh();
 for(const key of ['typing','pendingTyping','renderToken','initializing','bootTrace'])assert.equal(key in s,false,key+' must not be saved');
 const host=new Host();let now=T;const app=new StudyApplication(host,()=>now);app.load();
 app.command('chat',{text:'ただいま'});
 const raw=JSON.parse(host.raw);
 for(const key of ['typing','pendingTyping','renderToken','initializing','bootTrace'])assert.equal(key in raw,false);
 // The structural tag that the repetition guard needs is persisted; audio/render state is not.
 assert.ok(raw.messages.some(m=>m.structure));
 assert.ok(!JSON.stringify(raw).includes('user_submit_at'));
});

test('a malformed companion vault is repaired additively without touching real state',()=>{
 const s=migrate(JSON.parse(JSON.stringify(golden.state)));
 s.sharedMemories=null;s.characterMemories=undefined;s.openThreads=null;s.returnQueue=undefined;
 validate(s);
 assert.deepEqual(s.sharedMemories,[]);
 assert.deepEqual(s.openThreads,[]);
 assert.deepEqual(s.returnQueue,[]);
 assert.deepEqual(s.characterMemories,{SAYO:[],NurseT:[]});
 assert.equal(s.sessions.length,golden.state.sessions.length);
 // A wrong type is refused rather than silently dropped: nothing is cleared.
 const wrong=migrate(JSON.parse(JSON.stringify(golden.state)));wrong.openThreads='broken';
 assert.throws(()=>validate(wrong),/データ形式が不正です/);
 assert.equal(wrong.sessions.length,golden.state.sessions.length);
});
