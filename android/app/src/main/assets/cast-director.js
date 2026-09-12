/**
 * CastDirector: who speaks, in what order, and whether a second companion has
 * unique value. Deterministic — no randomness, no mechanical alternation.
 */
import {ConversationMode} from './character-decision.js';

export const ConversationPlan=Object.freeze({
 NONE:'NONE',SAYO_ONLY:'SAYO_ONLY',T_ONLY:'T_ONLY',TT_ONLY:'T_ONLY',
 SAYO_THEN_T:'SAYO_THEN_T',SAYO_THEN_TT:'SAYO_THEN_T',T_THEN_SAYO:'T_THEN_SAYO',SHORT_GROUP_EXCHANGE:'SHORT_GROUP_EXCHANGE'
});
export const CastPlan=ConversationPlan;

const group=(order,reason)=>({plan:ConversationPlan.SHORT_GROUP_EXCHANGE,order,maxMessages:order.length,reason});
const pair=(order,reason)=>({plan:order[0]==='SAYO'?ConversationPlan.SAYO_THEN_T:ConversationPlan.T_THEN_SAYO,order,maxMessages:2,reason});
const solo=(who,reason)=>({plan:who==='SAYO'?ConversationPlan.SAYO_ONLY:ConversationPlan.T_ONLY,order:[who],maxMessages:1,reason});

function sayoRun(recent=[]){const tail=recent.slice(-4);return tail.length===4&&tail.every(x=>x==='SAYO')}
function recentNurse(recent=[]){return recent.slice(-4).filter(x=>x==='NurseT').length}

/**
 * situation + context -> ordered cast plan.
 * `recent` is the bounded recent companion speaker sequence (oldest first).
 */
export function castPlan(situation,{address=null,event=null,depth=null,thread=null,commitment=null,recent=[],speaker='SAYO'}={}){
 if(address==='BOTH')return group(['SAYO','NurseT','SAYO'],'direct-both');
 if(address==='NurseT')return pair(['NurseT','SAYO'],'direct-tt');
 if(address==='SAYO')return solo('SAYO','direct-sayo');
 if(commitment)return solo(commitment.owner==='NurseT'?'NurseT':'SAYO','commitment');
 if(thread)return solo(thread.owner==='NurseT'?'NurseT':'SAYO','open-thread');
 if(Array.isArray(event)&&['break','dailyReview','weeklyReview'].includes(event[0]))return solo('NurseT','care');
 if(['break','dailyReview','weeklyReview'].includes(event))return solo('NurseT','care');
 if(situation.mode===ConversationMode.REVIEW)return solo('NurseT','review');
 if(situation.activeStudy&&situation.activeMinutes>=90)return solo('NurseT','long-session');
 if(event==='finish'||situation.mode===ConversationMode.POST_STUDY)return situation.lastMinutes>=120?group(['SAYO','NurseT','SAYO'],'post-study-long'):solo('SAYO','post-study');
 if(situation.mode===ConversationMode.PLANNING)return group(['SAYO','NurseT','SAYO'],'planning');
 if(situation.mode===ConversationMode.RECOVERY){
  const carryover=Boolean(situation.topic)||(situation.lastMinutes>0&&Boolean(situation.last));
  return carryover?group(['SAYO','NurseT','SAYO'],'recovery-carryover'):pair(['SAYO','NurseT'],'recovery');
 }
 if(situation.sleepy)return solo('SAYO','sleepy-casual');
 if(situation.stuck)return solo('SAYO','unresolved-topic');
 if((depth==='DEEP'||depth==='ENGAGED')&&sayoRun(recent))return pair(['NurseT','SAYO'],'balance-nurse');
 if(depth==='DEEP'&&recent.length>=4&&recentNurse(recent)===0)return group(['SAYO','NurseT','SAYO'],'deep-group');
 return solo(speaker==='NurseT'?'NurseT':'SAYO','default');
}
