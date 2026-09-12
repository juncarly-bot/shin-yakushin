import test from 'node:test';import assert from 'node:assert/strict';
import {StudyApplication} from '../app/src/main/assets/platform.js';
import {composeDialogue,reaction,phrase} from '../app/src/main/assets/dialogue.js';
import {decide,decideBoth} from '../app/src/main/assets/character-decision.js';
import {castPlan,ConversationPlan} from '../app/src/main/assets/cast-director.js';
import {validateTurn} from '../app/src/main/assets/remote-ai.js';
const T=Date.parse('2026-09-11T03:00:00Z');
class Host{raw=null;read(){return JSON.stringify({ok:true,raw:this.raw})}commit(rev,raw){this.raw=raw;return this.read()}}
const base={text:'',event:null,mode:'CASUAL',activeStudy:false,activeMinutes:0,studyMinutes:0,goalMinutes:0,goalNear:false,goalReached:false,lastMinutes:0,last:null,lateNight:false,fatigue:false,sleepy:false,planning:false,review:false,stuck:false,postpone:false,studyDays:0,offset:540,now:T,thread:null,commitment:null,topic:''};
function turn(text,{setup}={}){
 const host=new Host();let now=T;const app=new StudyApplication(host,()=>now);app.load();
 if(setup)setup(app,t=>{now=t});
 app.clock=()=>now;app.command('chat',{text});
 return app.lastVoiceMessages.map(m=>({speaker:m.speaker,text:m.text}));
}

test('the second line is written from the first decision, not in parallel',()=>{
 const situation={...base};
 const own=decide({...base,planning:true,mode:'PLANNING',text:'今日3時間やろうかな'},'NurseT');
 assert.equal(own.recommendation.kind,'PLAN_NEXT');
 // Two real, different SAYO conclusions about the same moment.
 const afterContinue=decide({...base,stuck:true},'SAYO');
 const afterChat=decide({...base},'SAYO');
 assert.notEqual(afterContinue.recommendation.kind,afterChat.recommendation.kind);
 const withContinue=reaction({},'NurseT',own,afterContinue,situation,T);
 const withChat=reaction({},'NurseT',own,afterChat,situation,T);
 assert.notEqual(withContinue,withChat,'the wording is derived from what the other companion actually decided');
 assert.match(withContinue,/一度に、ですか/);
 assert.match(withChat,/たしかに/);
});

test('USER -> SAYO -> TT -> SAYO is one causal exchange (acceptance A)',()=>{
 const messages=turn('今日はもう疲れた',{setup:(app,set)=>{set(T);app.command('start',{sessionId:'s',title:'グリフィス'});set(T+45*60000);app.command('finish',{sessionId:'s'});set(T+86400000+22*3600000)}});
 assert.deepEqual(messages.map(m=>m.speaker),['SAYO','NurseT','SAYO']);
 assert.match(messages[0].text,/終わろ/);
 assert.match(messages[1].text,/賛成です/);
 assert.match(messages[1].text,/明日の開始位置/);
 assert.match(messages[2].text,/それならあり/);
 assert.notEqual(messages[1].text,messages[0].text);
 assert.notEqual(messages[2].text,messages[1].text);
});

test('a shouted plan gets a distinct TT check and a SAYO reaction (acceptance C)',()=>{
 const messages=turn('今日3時間やろうかな');
 assert.deepEqual(messages.map(m=>m.speaker),['SAYO','NurseT','SAYO']);
 assert.match(messages[0].text,/やる気あるね/);
 assert.match(messages[1].text,/3時間を一度に/);
 assert.match(messages[2].text,/あっ/);
});

test('every plan stays within the three-message bound',()=>{
 const situations=[{...base},{...base,sleepy:true,text:'眠い'},{...base,planning:true,text:'3時間やろうかな'},{...base,mode:'PLANNING'},{...base,event:'finish',lastMinutes:130},{...base,mode:'RECOVERY',text:'へとへと',fatigue:true},{...base,thread:{id:'t',owner:'SAYO'}},{...base,commitment:{commitmentId:'c',owner:'NurseT'}}];
 for(const situation of situations){
  const plan=castPlan(situation,{});
  assert.ok(plan.order.length>=1&&plan.order.length<=3,`bounded order for ${situation.mode}`);
  assert.ok(plan.maxMessages<=3);
  assert.deepEqual(plan.order,plan.order.filter(x=>['SAYO','NurseT'].includes(x)));
 }
 assert.equal(castPlan({...base},{address:'BOTH'}).order.length,3);
});

test('composeDialogue keeps the planned order and reacts pair by pair',()=>{
 const situation={...base,planning:true,text:'今日3時間やろうかな'};
 const decisions=decideBoth(situation);
 const messages=composeDialogue({}, {order:['SAYO','NurseT','SAYO'],situation,decisions,now:T});
 assert.deepEqual(messages.map(m=>m.speaker),['SAYO','NurseT','SAYO']);
 assert.equal(messages[0].text,phrase({},'SAYO',decisions.SAYO,situation,T));
 assert.equal(messages[1].text,reaction({},'NurseT',decisions.NurseT,decisions.SAYO,situation,T));
 assert.equal(messages[2].text,reaction({},'SAYO',decisions.SAYO,decisions.NurseT,situation,T));
});

test('direct invocation is honoured and never exceeds the bound',()=>{
 const sayo=castPlan({...base},{address:'SAYO'});
 assert.deepEqual(sayo.order,['SAYO']);
 const tt=castPlan({...base},{address:'NurseT'});
 assert.deepEqual(tt.order,['NurseT','SAYO']);
 const both=castPlan({...base},{address:'BOTH'});
 assert.equal(both.plan,ConversationPlan.SHORT_GROUP_EXCHANGE);
 assert.deepEqual(both.order,['SAYO','NurseT','SAYO']);
});

test('the remote turn is validated locally: allowed speakers, exact order, bounded length',()=>{
 const plan={order:['NurseT','SAYO'],maxMessages:2};
 assert.deepEqual(validateTurn({messages:[{speaker:'NurseT',text:'a'},{speaker:'SAYO',text:'b'}]},plan).map(m=>m.speaker),['NurseT','SAYO']);
 assert.throws(()=>validateTurn({messages:[{speaker:'SAYO',text:'a'},{speaker:'NurseT',text:'b'}]},plan),/order/);
 assert.throws(()=>validateTurn({messages:[{speaker:'UNKNOWN',text:'a'}]},plan),/speaker/);
 assert.throws(()=>validateTurn({messages:[{speaker:'NurseT',text:'a'},{speaker:'SAYO',text:'b'},{speaker:'NurseT',text:'c'}]},plan),/invalid/);
 assert.throws(()=>validateTurn({messages:[{speaker:'NurseT',text:'   '}]},plan),/invalid/);
 assert.deepEqual(validateTurn({text:'legacy'},plan),[{speaker:'NurseT',text:'legacy',emotion:'calm'}]);
});

test('the second companion is not a paraphrase of the first',()=>{
 const situation={...base,lateNight:true,studyMinutes:165,goalMinutes:240,goalNear:true};
 const decisions=decideBoth(situation);
 const messages=composeDialogue({}, {order:['SAYO','NurseT'],situation,decisions,now:T});
 assert.notEqual(messages[0].stance,messages[1].stance);
 assert.notEqual(messages[0].text,messages[1].text);
 const first=messages[0].text.replace(/[。、！？\s]/g,''),second=messages[1].text.replace(/[。、！？\s]/g,'');
 assert.equal(second.includes(first),false);
});
