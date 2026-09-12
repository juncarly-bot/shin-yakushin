import test from 'node:test';import assert from 'node:assert/strict';
import {addShared,addCharacterMemory,verifyAuthority,interpretation,CharacterMemoryRouter,noteFinishedSession,MAX_SHARED} from '../app/src/main/assets/character-memory.js';
import {fresh,validate,migrate} from '../app/src/main/assets/domain.js';
const T=Date.parse('2026-09-11T03:00:00Z');
const router=new CharacterMemoryRouter();
const material=(s,progress=40,archived=false)=>{s.materials.push({id:'m1',title:'グリフィス電磁気学',memo:'',createdAt:T,completedAt:null,archived,target:100,progress,unit:'ページ'});return s};

test('SharedMemory is what both companions mutually know',()=>{
 const s=fresh();
 const record=addShared(s,{kind:'MATERIAL',text:'グリフィス電磁気学 第1章を完了',importance:5},T);
 assert.ok(record&&record.id);
 assert.equal(s.sharedMemories.length,1);
 assert.equal(router.route(s,{speaker:'SAYO'}).shared[0].text,'グリフィス電磁気学 第1章を完了');
 assert.equal(router.route(s,{speaker:'NurseT'}).shared[0].text,'グリフィス電磁気学 第1章を完了');
});

test('SayoMemory and TTMemory stay character-specific',()=>{
 const s=fresh();
 addCharacterMemory(s,'SAYO',{text:'かなり嬉しそうだった',relatedId:'m1'},T);
 addCharacterMemory(s,'NurseT',{text:'予定より早く完了した',relatedId:'m1'},T);
 const sayo=router.route(s,{speaker:'SAYO',relatedId:'m1'});
 const nurse=router.route(s,{speaker:'NurseT',relatedId:'m1'});
 assert.deepEqual(sayo.own.map(m=>m.text),['かなり嬉しそうだった']);
 assert.deepEqual(nurse.own.map(m=>m.text),['予定より早く完了した']);
 assert.equal(sayo.own.some(m=>m.text==='予定より早く完了した'),false);
 assert.equal(nurse.own.some(m=>m.text==='かなり嬉しそうだった'),false);
 assert.equal(router.route(s,{speaker:'SAYO',relatedId:'m1'}).shared.length,0);
});

test('an interpretation is dropped when authoritative state no longer supports it',()=>{
 const s=material(fresh(),40);
 const memory=addCharacterMemory(s,'NurseT',{text:'予定より早く完了した',relatedId:'m1',authority:{kind:'material',id:'m1',minProgress:40}},T);
 assert.equal(interpretation(s,memory),'予定より早く完了した');
 assert.equal(router.route(s,{speaker:'NurseT',relatedId:'m1'}).own.length,1);
 // Authoritative state wins: the material went back or was archived.
 s.materials[0].progress=10;
 assert.equal(interpretation(s,memory),null);
 assert.equal(router.route(s,{speaker:'NurseT',relatedId:'m1'}).own.length,0);
 s.materials[0].progress=90;s.materials[0].archived=true;
 assert.equal(interpretation(s,memory),null);
});

test('a session interpretation only survives while that session is finished',()=>{
 const s=fresh();
 s.sessions.push({sessionId:'s1',title:'自由学習',sourceType:'free',relatedMaterialId:null,relatedTaskId:null,relatedGoalId:null,relatedPlanId:null,startTimestamp:T,endTimestamp:null,segments:[{kind:'study',start:T,end:null}]});
 const memory=addCharacterMemory(s,'SAYO',{text:'集中していた',authority:{kind:'session',id:'s1'}},T);
 assert.equal(interpretation(s,memory),null);
 s.sessions[0].endTimestamp=T+600000;s.sessions[0].segments[0].end=T+600000;
 assert.equal(interpretation(s,memory),'集中していた');
 assert.equal(verifyAuthority(s,{kind:'session',id:'s1'}),true);
 assert.equal(verifyAuthority(s,{kind:'session',id:'missing'}),false);
});

test('memory stays bounded and de-duplicated by id',()=>{
 const s=fresh();
 for(let i=0;i<MAX_SHARED+20;i++)addShared(s,{id:'dup:'+i,text:'fact '+i},T+i);
 assert.equal(s.sharedMemories.length,MAX_SHARED);
 assert.equal(addShared(s,{id:'dup:'+(MAX_SHARED+19),text:'again'},T),null);
 assert.equal(addShared(s,{text:'   '},T),null);
 assert.equal(addCharacterMemory(s,'USER',{text:'x'},T),null);
});

test('routing returns a small bounded slice, never the full vault',()=>{
 const s=material(fresh());
 for(let i=0;i<30;i++)addShared(s,{text:'共通の記録 '+i,importance:i%5},T+i);
 const slice=router.route(s,{speaker:'SAYO',limit:2});
 assert.equal(slice.shared.length,2);
 assert.equal(slice.speaker,'SAYO');
 assert.ok(s.sharedMemories.length>2);
});

test('a finished session records shared facts plus each companion interpretation',()=>{
 const s=fresh();
 s.sessions.push({sessionId:'s1',title:'自由学習',sourceType:'free',relatedMaterialId:null,relatedTaskId:null,relatedGoalId:null,relatedPlanId:null,startTimestamp:T,endTimestamp:T+3600000,segments:[{kind:'study',start:T,end:T+3600000}]});
 const written=noteFinishedSession(s,s.sessions[0],T+3600000,{});
 assert.ok(written.shared,'shared fact written');
 assert.equal(s.sharedMemories.length,1);
 assert.equal(s.characterMemories.SAYO.length,1);
 assert.equal(s.characterMemories.NurseT.length,1);
 assert.notEqual(s.characterMemories.SAYO[0].text,s.characterMemories.NurseT[0].text);
 assert.ok(written.characters.every(m=>m.authority.kind==='session'));
});

test('old saves gain empty vaults without touching existing data',()=>{
 const s=migrate(JSON.parse(JSON.stringify(fresh())));
 delete s.sharedMemories;delete s.characterMemories;delete s.openThreads;delete s.returnQueue;
 s.materials.push({id:'m1',title:'本',memo:'',createdAt:T,completedAt:null,archived:false,target:10,progress:1,unit:'ページ'});
 validate(s);
 assert.deepEqual(s.sharedMemories,[]);
 assert.deepEqual(s.characterMemories,{SAYO:[],NurseT:[]});
 assert.deepEqual(s.openThreads,[]);
 assert.deepEqual(s.returnQueue,[]);
 assert.equal(s.materials.length,1);
});
