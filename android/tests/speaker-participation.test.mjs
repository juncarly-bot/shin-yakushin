import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {StudyApplication} from '../app/src/main/assets/platform.js';
import {directAddress,conversationPlan,ConversationPlan} from '../app/src/main/assets/orchestrator.js';
class Host{raw=null;read(){return JSON.stringify({ok:true,raw:this.raw})}commit(rev,raw){this.raw=raw;return this.read()}}
function setup(){let time=1900000000000;const app=new StudyApplication(new Host(),()=>time);app.load();return {app,advance:ms=>time+=ms,now:()=>time}}
const speakers=app=>app.lastVoiceMessages.map(x=>x.speaker);
const texts=app=>app.lastVoiceMessages.map(x=>x.text);

test('direct address is detected for every documented alias',()=>{
 for(const alias of ['TTちゃん','Tちゃん','Ｔちゃん','ＴＴちゃん','ナースロボ','ナースロボ＿タイプＴ','タイプT','タイプＴ','NurseT'])assert.equal(directAddress(`${alias}どう思う？`),'NurseT',alias);
 for(const alias of ['小夜','さよ','SAYO'])assert.equal(directAddress(`${alias}どう思う？`),'SAYO',alias);
 assert.equal(directAddress('二人はどう思う？'),'BOTH');assert.equal(directAddress('ふたりに聞きたい'),'BOTH');
 assert.equal(directAddress('今日は疲れた'),null);
});

test('casual chat stays SAYO_ONLY without forced group chatter',()=>{
 const {app}=setup();app.command('chat',{text:'ただいま'});assert.deepEqual(speakers(app),['SAYO']);
});

test('direct address forces the requested companion to participate',()=>{
 const {app}=setup();app.command('chat',{text:'TTちゃんどう思う？'});assert.ok(speakers(app).includes('NurseT'));
 const {app:app2}=setup();app2.command('chat',{text:'小夜どう思う？'});assert.ok(speakers(app2).includes('SAYO'));
 const {app:app3}=setup();app3.command('chat',{text:'二人はどう思う？'});assert.ok(speakers(app3).includes('SAYO')&&speakers(app3).includes('NurseT'));
});

test('study planning reliably brings in the practical companion',()=>{
 const {app}=setup();app.command('chat',{text:'今日の予定どう組もう？'});assert.ok(speakers(app).includes('NurseT'));
});

test('group exchanges stay bounded to three companion messages',()=>{
 const {app,advance}=setup();app.command('start',{sessionId:'long',title:'グリフィス電磁気学'});advance(3*3600*1000);app.command('finish',{sessionId:'long'});
 assert.deepEqual(speakers(app),['SAYO','NurseT','SAYO']);assert.ok(app.lastVoiceMessages.length<=3);
});

test('group exchanges return control instead of talking forever',()=>{
 const {app}=setup();app.command('chat',{text:'二人はどう思う？'});
 assert.equal(app.lastVoiceMessages.length,3);
 assert.equal(app.lastVoiceMessages.at(-1).speaker,'SAYO');
});

test('the practical companion does not appear every turn',()=>{
 const {app}=setup();app.command('chat',{text:'ただいま'});assert.deepEqual(speakers(app),['SAYO']);
 app.command('chat',{text:'今日はいい天気だね'});assert.deepEqual(speakers(app),['SAYO']);
});

test('the practical companion is allowed to say helpful positive things',()=>{
 const {app,advance}=setup();app.command('start',{sessionId:'s',title:'積分'});advance(2*3600*1000+60000);app.command('finish',{sessionId:'s'});
 const nurse=texts(app)[1];assert.match(nurse,/達成|無理なく|十分|現実的|区切り|記録|集中/);
});

test('a long reasoned exchange alternates instead of letting SAYO monopolize',()=>{
 const {app,advance}=setup();app.command('chat',{text:'電場のエネルギーについて詳しく話したい'});
 const plans=[];for(let i=0;i<6;i++){advance(60000);app.command('chat',{text:'それってなんで？'});plans.push(speakers(app).join('+'))}
 assert.ok(plans.some(p=>p.includes('NurseT')),'NurseT participates during a deep discussion');
 assert.ok(plans.some(p=>p==='SAYO'),'not every deep turn becomes a group exchange');
});

test('local SAYO lines stay casual rather than coach-like',()=>{
 const source=readFileSync(new URL('../app/src/main/assets/orchestrator.js',import.meta.url),'utf8');
 for(const casual of ['じゃ終わろ終わろ','やるなら15分だけやろー','お、今日は早いじゃん'])assert.ok(source.includes(casual),casual);
});

test('core conversation and initiative decisions stay deterministic',()=>{
 for(const file of ['orchestrator.js','initiative.js','commitments.js','conversation.js','timeline.js']){
  const source=readFileSync(new URL('../app/src/main/assets/'+file,import.meta.url),'utf8').replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'');
  assert.doesNotMatch(source,/Math\.random/,`${file} must not use randomness`);
 }
});

test('conversationPlan never returns an unbounded plan',()=>{
 const allowed=new Set(Object.values(ConversationPlan));
 const {app}=setup();
 for(const text of ['ただいま','TTちゃんどう思う？','二人はどう思う？','今日の予定どう組もう？','今日はここまで']){app.command('chat',{text});assert.ok(allowed.has(conversationPlan(app.state,'conversation',{text},Date.now())))}
});
