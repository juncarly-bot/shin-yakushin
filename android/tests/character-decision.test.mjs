import test from 'node:test';import assert from 'node:assert/strict';
import {CharacterProfiles,CHARACTER_IDS,profileFor,displayName} from '../app/src/main/assets/characters.js';
import {ConversationMode,conversationMode,perceive,decide,decideBoth,decisionsDiffer} from '../app/src/main/assets/character-decision.js';
import {StudyApplication} from '../app/src/main/assets/platform.js';
const T=Date.parse('2026-09-11T03:00:00Z'),DAY=86400000;
class Host{raw=null;read(){return JSON.stringify({ok:true,raw:this.raw})}commit(rev,raw){this.raw=raw;return this.read()}}
const base={text:'',event:null,mode:'CASUAL',activeStudy:false,activeMinutes:0,studyMinutes:0,goalMinutes:0,goalNear:false,goalReached:false,lastMinutes:0,last:null,lateNight:false,fatigue:false,sleepy:false,planning:false,review:false,stuck:false,postpone:false,studyDays:0,offset:540,now:T,thread:null,commitment:null,topic:''};

test('a profile is a decision model, not a tone preset',()=>{
 const fields=['values','attentionBias','decisionStyle','emotionalExpression','humorStyle','initiativeStyle','studyPhilosophy','userDistance','praiseStyle','failureReaction','careStyle','conflictStyle','silencePreference','viewOfOtherCharacter','memoryInterpretationStyle'];
 assert.deepEqual([...CHARACTER_IDS],['SAYO','NurseT']);
 for(const id of CHARACTER_IDS){
  const profile=profileFor(id);
  assert.equal(profile.id,id);
  for(const field of fields)assert.ok(profile[field],`${id} is missing ${field}`);
  assert.ok(profile.attentionBias.length>0,`${id} notices nothing in particular`);
 }
 assert.equal(displayName('SAYO'),'小夜');
 assert.equal(displayName('NurseT'),'TTちゃん');
 assert.notDeepEqual(CharacterProfiles.SAYO.attentionBias,CharacterProfiles.NurseT.attentionBias);
 assert.notEqual(CharacterProfiles.SAYO.decisionStyle,CharacterProfiles.NurseT.decisionStyle);
 assert.notEqual(CharacterProfiles.SAYO.studyPhilosophy,CharacterProfiles.NurseT.studyPhilosophy);
});

test('the same late evening leads SAYO and TT to different, individually valid conclusions',()=>{
 const situation={...base,lateNight:true,studyMinutes:165,goalMinutes:240,goalNear:true};
 const {SAYO,NurseT}=decideBoth(situation);
 assert.equal(SAYO.stance,'wind-down');
 assert.equal(SAYO.recommendation.kind,'STOP');
 assert.equal(NurseT.stance,'plan-next');
 assert.equal(NurseT.recommendation.kind,'PLAN_NEXT');
 assert.ok(NurseT.recommendation.minutes>0,'TT proposes a concrete next step');
 assert.ok(decisionsDiffer(SAYO,NurseT),'the difference exists before any wording');
});

test('perception differs before wording',()=>{
 const situation={...base,lateNight:true,studyMinutes:165,goalMinutes:240,goalNear:true};
 const sayo=perceive(situation,'SAYO'),nurse=perceive(situation,'NurseT');
 assert.ok(sayo.notices.includes('あと少しで届きそうなこと'));
 assert.ok(nurse.notices.includes('もう遅い時間であること'));
 assert.ok(nurse.notices.includes('目標までの残り'));
 assert.notDeepEqual(sayo.notices,nurse.notices);
});

test('TT is useful outside warnings: review, feasibility and concrete praise',()=>{
 const review={...base,mode:ConversationMode.REVIEW};
 assert.equal(decide(review,'NurseT').stance,'structured-review');
 assert.equal(decide(review,'NurseT').recommendation.kind,'REVIEW');
 const plan={...base,mode:ConversationMode.PLANNING,planning:true};
 assert.equal(decide(plan,'NurseT').stance,'feasibility-check');
 assert.equal(decide(plan,'NurseT').recommendation.kind,'PLAN_NEXT');
 const achieved={...base,studyMinutes:90,goalMinutes:90,goalReached:true};
 const praise=decide(achieved,'NurseT');
 assert.equal(praise.stance,'acknowledge');
 assert.equal(praise.recommendation.kind,'CELEBRATE');
 assert.equal(praise.emotion,'pleased');
});

test('SAYO does not always recommend study',()=>{
 const sleepy={...base,text:'眠い',sleepy:true};
 assert.equal(decide(sleepy,'SAYO').recommendation.kind,'REST');
 assert.equal(decide(sleepy,'SAYO').stance,'sleep');
 const casual={...base,mode:ConversationMode.CASUAL};
 assert.equal(decide(casual,'SAYO').recommendation.kind,'CHAT');
 for(const situation of [sleepy,casual])assert.notEqual(decide(situation,'SAYO').recommendation.kind,'START');
});

test('a real 2h45m late-night session produces the personality split end to end',()=>{
 const host=new Host();let now=T;const app=new StudyApplication(host,()=>now);app.load();
 app.clock=()=>T;app.command('start',{sessionId:'long',title:'グリフィス電磁気学'});
 app.clock=()=>T+165*60000;app.command('finish',{sessionId:'long'});
 now=T+DAY+(22*3600000);
 app.clock=()=>now;
 const day=app.command('conversation',{text:'続きやる'});
 assert.ok(day);
 const {SAYO,NurseT}=decideBoth({...base,lateNight:true,studyMinutes:165,goalMinutes:240,goalNear:true});
 assert.ok(decisionsDiffer(SAYO,NurseT));
 assert.equal(SAYO.recommendation.kind,'STOP');
 assert.equal(NurseT.recommendation.kind,'PLAN_NEXT');
});

test('conversation modes cover casual turns without forcing a Study CTA',()=>{
 assert.equal(conversationMode({...base,text:'眠い',sleepy:true}),ConversationMode.CASUAL);
 assert.equal(conversationMode({...base,text:'今日はもう疲れた',fatigue:true}),ConversationMode.RECOVERY);
 assert.equal(conversationMode({...base,text:'今日3時間やろうかな',planning:true}),ConversationMode.PLANNING);
 assert.equal(conversationMode({...base,thread:{id:'t'}}),ConversationMode.OPEN_THREAD_FOLLOWUP);
 assert.equal(conversationMode({...base,commitment:{commitmentId:'c'}}),ConversationMode.COMMITMENT_FOLLOWUP);
 assert.equal(conversationMode({...base,activeStudy:true}),ConversationMode.STUDY_CONTINUATION);
 assert.equal(conversationMode({...base,event:'finish'}),ConversationMode.POST_STUDY);
});
