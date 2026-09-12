import test from 'node:test';import assert from 'node:assert/strict';
import {StudyApplication} from '../app/src/main/assets/platform.js';
import {RelationshipStage,relationshipStage,relationshipVoice,referenceLine,explanationBudget} from '../app/src/main/assets/relationship.js';
import {metrics} from '../app/src/main/assets/domain.js';
const T=Date.parse('2026-09-11T03:00:00Z');
const DAY=86400000;
class Host{raw=null;read(){return JSON.stringify({ok:true,raw:this.raw})}commit(rev,raw){this.raw=raw;return this.read()}}

test('stages progress gradually and only from authoritative metrics',()=>{
 assert.equal(relationshipStage({studyDays:0,seconds:0}),'new');
 assert.equal(relationshipStage({studyDays:2,seconds:0}),'acquainted');
 assert.equal(relationshipStage({studyDays:7,seconds:0}),'familiar');
 assert.equal(relationshipStage({studyDays:21,seconds:0}),'close');
 assert.equal(relationshipStage({studyDays:1,seconds:2*3600}),'acquainted','two hours on one day is not intimacy');
 assert.equal(relationshipStage({studyDays:1,seconds:3*3600}),'acquainted');
 assert.deepEqual([...RelationshipStage],['new','acquainted','familiar','close']);
});

test('a single long session can never jump to the closest stage',()=>{
 const host=new Host();let now=T;const app=new StudyApplication(host,()=>now);app.load();
 app.clock=()=>T;app.command('start',{sessionId:'one',title:'集中'});
 app.clock=()=>T+6*3600000;app.command('finish',{sessionId:'one'});
 const stage=relationshipStage(metrics(app.state,now));
 assert.equal(stage,'acquainted');
 assert.notEqual(stage,'close');
});

test('familiarity changes how a known material is referred to',()=>{
 const early=referenceLine('new','グリフィス電磁気学');
 const later=referenceLine('familiar','グリフィス電磁気学');
 const closest=referenceLine('close','グリフィス電磁気学');
 assert.match(early,/以前グリフィス電磁気学を勉強していましたね/);
 assert.match(later,/またグリフィス電磁気学ですね/);
 assert.match(closest,/結局グリフィス電磁気学に戻ってくるんですよね/);
 assert.equal(new Set([early,later,closest]).size,3);
 assert.equal(referenceLine('familiar',''),'');
});

test('behavioural voice only ever moves forward',()=>{
 const stages=[...RelationshipStage].map(relationshipVoice);
 for(let i=1;i<stages.length;i++){
  for(const key of ['directness','shorthand','canDisagree','banter'])assert.ok(stages[i][key]>=stages[i-1][key],`${key} must not regress`);
 }
 assert.ok(stages.at(-1).banter>stages[0].banter);
 assert.ok(explanationBudget('close')<=explanationBudget('new'),'closer companions explain less');
});

test('the same message carries the current relationship stage, and it persists',()=>{
 const host=new Host();let now=T;const app=new StudyApplication(host,()=>now);app.load();
 app.clock=()=>now;app.command('chat',{text:'ただいま'});
 assert.equal(app.lastVoiceMessages[0].relationshipStage,'new');
 const persisted=app.state.messages.filter(m=>m.relationshipStage).at(-1);
 assert.equal(persisted.relationshipStage,'new');
 const reloaded=new StudyApplication(host,()=>now).load();
 assert.equal(reloaded.messages.filter(m=>m.relationshipStage).at(-1).relationshipStage,'new');
});

test('no relationship punishment for not studying: silence keeps the stage',()=>{
 const host=new Host();let now=T;const app=new StudyApplication(host,()=>now);app.load();
 app.clock=()=>T;app.command('start',{sessionId:'a',title:'本'});
 app.clock=()=>T+3*3600000;app.command('finish',{sessionId:'a'});
 const before=relationshipStage(metrics(app.state,now));
 now=T+30*DAY;
 assert.equal(relationshipStage(metrics(app.state,now)),before,'time alone never demotes the bond');
});
