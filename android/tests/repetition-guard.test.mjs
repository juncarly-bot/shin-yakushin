import test from 'node:test';import assert from 'node:assert/strict';
import {StudyApplication} from '../app/src/main/assets/platform.js';
import {structureKey,recentStructures,guardStructure,STRUCTURE_LIMIT} from '../app/src/main/assets/repetition.js';
import {fresh} from '../app/src/main/assets/domain.js';
const T=Date.parse('2026-09-11T03:00:00Z');
class Host{raw=null;read(){return JSON.stringify({ok:true,raw:this.raw})}commit(rev,raw){this.raw=raw;return this.read()}}
const message=(speaker,structure,at)=>({id:speaker+at,speaker,text:'x',at,structure});

test('the structure key encodes the interaction shape, not the words',()=>{
 assert.equal(structureKey({mode:'CASUAL',order:['SAYO'],question:false,cta:false}),'CASUAL|SAYO|s|nocta');
 assert.equal(structureKey({mode:'CASUAL',order:['SAYO'],question:true,cta:false}),'CASUAL|SAYO|q|nocta');
 assert.equal(structureKey({mode:'PLANNING',order:['SAYO','NurseT'],question:false,cta:true}),'PLANNING|SAYO>NurseT|s|cta');
 assert.notEqual(structureKey({mode:'CASUAL',order:['SAYO','NurseT'],question:false,cta:false}),structureKey({mode:'CASUAL',order:['SAYO'],question:false,cta:false}));
});

test('only persisted companion structures are remembered, bounded',()=>{
 const s=fresh();
 s.messages=[message('user',null,T),{id:'u2',speaker:'user',text:'x',at:T},...Array.from({length:12},(_,i)=>message(i%2?'NurseT':'SAYO','CASUAL|SAYO|s|nocta',T+i+1))];
 const recent=recentStructures(s);
 assert.equal(recent.length,STRUCTURE_LIMIT);
 assert.ok(recent.every(x=>x.speaker==='SAYO'||x.speaker==='NurseT'));
});

test('a repeated shape changes the interaction structure instead of swapping words',()=>{
 const s=fresh();
 s.messages=[message('SAYO','PLANNING|SAYO>NurseT>SAYO|s|cta',T)];
 const same=guardStructure(s,{mode:'PLANNING',order:['SAYO','NurseT','SAYO'],question:false,cta:true});
 assert.equal(same.adjusted,true);
 assert.equal(same.reason,'changed-speaker-sequence');
 assert.notEqual(same.key,'PLANNING|SAYO>NurseT>SAYO|s|cta');
 assert.ok(same.order.length<3,'a group turn gets shorter');
 const pair=guardStructure({messages:[message('SAYO','CASUAL|SAYO>NurseT|s|nocta',T)]},{mode:'CASUAL',order:['SAYO','NurseT'],question:false,cta:false});
 assert.deepEqual(pair.order,['SAYO']);
 const solo=guardStructure({messages:[message('SAYO','CASUAL|SAYO|s|nocta',T)]},{mode:'CASUAL',order:['SAYO'],question:false,cta:false});
 assert.deepEqual(solo.order,['SAYO','NurseT'],'a lonely turn invites the other companion once');
});

test('an unseen shape is left alone',()=>{
 const s=fresh();
 s.messages=[message('SAYO','CASUAL|SAYO|s|nocta',T)];
 const result=guardStructure(s,{mode:'PLANNING',order:['SAYO','NurseT','SAYO'],question:false,cta:true});
 assert.equal(result.adjusted,false);
 assert.deepEqual(result.order,['SAYO','NurseT','SAYO']);
});

test('end to end: the same request twice does not produce the same pattern twice',()=>{
 const host=new Host();let now=T;const app=new StudyApplication(host,()=>now);app.load();app.clock=()=>now;
 const seen=[];
 for(let i=0;i<4;i++){
  app.command('chat',{text:'今日3時間やろうかな'});
  seen.push(app.lastVoiceMessages.map(m=>m.speaker).join('>'));
  now+=3600000;app.clock=()=>now;
 }
 assert.notEqual(seen[0],seen[1],'the second identical request is answered with a different structure');
 assert.ok(new Set(seen).size>=2);
 for(const key of seen)assert.ok(key.split('>').length<=3,'the bound is never exceeded');
 // The change is structural, and it is derived from persisted history rather than chance.
 assert.ok(app.state.messages.filter(m=>m.structure).length>0);
});
