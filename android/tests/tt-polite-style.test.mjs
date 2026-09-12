import test from 'node:test';
import assert from 'node:assert/strict';
import {CharacterProfiles} from '../app/src/main/assets/characters.js';
import {phrase,reaction} from '../app/src/main/assets/dialogue.js';

const T=Date.parse('2026-09-12T12:00:00Z');
const base={text:'',planning:false};
const rec=kind=>({kind});
const politeEnd=/(?:です|ます|ません|ましょう|ですか|ますか|ませんか)[。？！?]?$/;

test('TT profile declares a desu-masu register',()=>{
 assert.equal(CharacterProfiles.NurseT.shortName,'TTちゃん');
 assert.equal(CharacterProfiles.NurseT.speechRegister,'desu-masu');
 assert.ok(CharacterProfiles.NurseT.speechRules.includes('use-desu-masu-by-default'));
 assert.equal(CharacterProfiles.SAYO.speechRegister,'casual');
});

test('TT local fallback lines stay in polite Japanese',()=>{
 const stances=['plan-next','feasibility-check','agree-and-plan','structured-review','observe','suggest-break','acknowledge','unknown'];
 for(const stance of stances){
  const text=phrase({},'NurseT',{stance,recommendation:rec('CHAT')},base,T);
  assert.match(text,politeEnd,`${stance}: ${text}`);
 }
 const agree=reaction({},'NurseT',{stance:'agree-and-plan',recommendation:rec('PLAN_NEXT')},{stance:'wind-down',recommendation:rec('PLAN_NEXT')},base,T);
 const feasibility=reaction({},'NurseT',{stance:'plan-next',recommendation:rec('PLAN_NEXT')},{stance:'enthuse',recommendation:rec('START')},{...base,planning:true,text:'3時間やろうかな'},T);
 const disagree=reaction({},'NurseT',{stance:'plan-next',recommendation:rec('PLAN_NEXT')},{stance:'chat',recommendation:rec('CHAT')},base,T);
 for(const text of [agree,feasibility,disagree])assert.match(text,politeEnd,text);
});
