import {totals,metrics} from './domain.js';
import {buildSituation,decideBoth,ConversationMode} from './character-decision.js';
import {castPlan,ConversationPlan} from './cast-director.js';
import {composeDialogue} from './dialogue.js';
import {relationshipStage,relationshipVoice} from './relationship.js';
import {guardStructure,structureKey} from './repetition.js';
import {selectThread} from './continuity.js';
import {CharacterProfiles} from './characters.js';
import {directorPlan} from './character-engine.js';

export {ConversationPlan,CastPlan} from './cast-director.js';
export {ConversationMode} from './character-decision.js';

export const ConversationDepth=Object.freeze(['QUICK_REACTION','NORMAL','ENGAGED','DEEP']);
/** Depth describes user-led continuity, never an autonomous message count. */
export function depthContext(s,text,now){
 const old=s.conversation?.depthContext;
 const previous=old&&ConversationDepth.includes(old.depth)&&typeof old.topic==='string'&&typeof old.recentQuestion==='string'&&now>=old.at&&now-old.at<86400000?old:null;
 const follow=/それって|それは|なんで|なぜ|じゃあ|こっちは|前のやつ|その違い|もう少し/.test(text);
 const question=/[？?]|なぜ|なんで|どうして|教えて|違い|相談|話したい|について/.test(text);
 const end=/^(またね|おやすみ|今日はここまで|話はここまで)[。！!]*$/.test(text.trim());
 let depth=end?'QUICK_REACTION':/詳しく|深く|じっくり|一緒に考え|掘り下げ/.test(text)?'DEEP':question?'ENGAGED':/今日やる|予定|進捗/.test(text)?'NORMAL':previous?.depth??'QUICK_REACTION';
 const topic=follow&&previous?previous.topic:question?text.slice(0,200):previous?.topic||s.conversation?.topic||'';
 if(!end&&previous?.depth==='DEEP'&&(follow||question))depth='DEEP';
 return {depth,topic,recentQuestion:question?text.slice(0,300):previous?.recentQuestion||'',recentUserIntent:end?'close':follow?'followup':question?'discuss':'chat',at:now};
}

/* Display names stay out of state: ids are SAYO / NurseT forever. */
const SAYO_ALIASES=['小夜','さよ','SAYO'];
const NURSE_ALIASES=['TTちゃん','ＴＴちゃん','Tちゃん','Ｔちゃん','ナースロボ＿タイプＴ','ナースロボ','タイプT','タイプＴ','NurseT'];
const BOTH_ALIASES=['二人','ふたり','2人','両方','みんな'];

/**
 * Direct address is a hard contract, not a hint: asking for a companion by name
 * guarantees that companion speaks. Pure function, no randomness.
 */
export function directAddress(text){
 const value=String(text??'');
 if(!value)return null;
 const both=BOTH_ALIASES.some(alias=>value.includes(alias));
 const nurse=NURSE_ALIASES.some(alias=>value.includes(alias));
 const sayo=SAYO_ALIASES.some(alias=>value.includes(alias));
 if(both||(nurse&&sayo))return 'BOTH';
 if(nurse)return 'NurseT';
 if(sayo)return 'SAYO';
 return null;
}

/** Recommendation kinds that turn a turn into an action-oriented interaction. */
const CTA_KINDS=['START','CONTINUE','PLAN_NEXT','BREAK','REVIEW'];
const isQuestion=text=>/[？?]\s*$/.test(String(text??'').trim());

function recentSpeakers(s,limit=8){
 return (s.messages??[]).filter(m=>m.speaker==='SAYO'||m.speaker==='NurseT').slice(-limit).map(m=>m.speaker);
}
function liveProposalParts(s){
 const p=s.initiative?.activeProposal;
 if(!p)return {thread:null,commitment:null};
 return {
  thread:p.threadId?(s.openThreads??[]).find(t=>t.id===p.threadId)??null:null,
  commitment:p.commitmentId?(s.commitments??[]).find(c=>c.commitmentId===p.commitmentId)??null:null
 };
}
/** Lead text is reused from the reaction layer for event-driven or neutral turns. */
function useLead(situation,decision,reaction){
 if(!reaction?.text)return false;
 const explicit=['finish','start','resume','break','goal','progress','material','dailyReview','weeklyReview','recall','milestone','exceeded','half','commitment','initiative'].includes(reaction.event);
 // A rest/sleep decision has its own character line: never let a generic
 // reply stand in for what the character actually decided.
 const neutral=['CHAT','NONE'].includes(decision?.recommendation?.kind);
 return explicit||neutral;
}

function planForOrder(order){
 if(!order.length)return ConversationPlan.NONE;
 if(order.length===1)return order[0]==='SAYO'?ConversationPlan.SAYO_ONLY:ConversationPlan.T_ONLY;
 if(order.length===2)return order[0]==='SAYO'?ConversationPlan.SAYO_THEN_T:ConversationPlan.T_THEN_SAYO;
 return ConversationPlan.SHORT_GROUP_EXCHANGE;
}
function roomAwareCast(s,cast,text){
 const engine=s.characterEngine;if(!engine?.characters)return cast;
 const available=id=>engine.characters?.[id]?.life?.state!=='SLEEP'&&engine.characters?.[id]?.presence?.roomState!=='OUT';
 let order=cast.order.filter(available).filter((id,index,list)=>index===0||id!==list[index-1]);
 if(cast.reason==='default'){
  const hint=directorPlan(engine,CharacterProfiles,{userMessage:text,directAddress:directAddress(text),userAskedDeep:/詳しく|深く|掘り下げ/.test(text)});
  const hinted=hint.order.filter(available);if(hinted.length)order=hinted;
 }
 return {...cast,order,maxMessages:order.length,plan:planForOrder(order),reason:cast.reason==='default'?'character-engine':cast.reason};
}

/** Chooses participation only. Study and memory remain authoritative elsewhere. */
export function conversationPlan(s,event,resolution,now){
 if(!s.reaction?.text)return ConversationPlan.NONE;
 const situation=buildSituation(s,now,{text:resolution?.text??'',event});
 const {thread,commitment}=liveProposalParts(s);
 const depth=s.conversation?.depthContext?.depth;
 const cast=roomAwareCast(s,castPlan(situation,{address:directAddress(resolution?.text??''),event,depth,thread,commitment,recent:recentSpeakers(s),speaker:s.reaction?.speaker}),resolution?.text??'');
 return cast.plan;
}

export function orchestrateConversation(s,event,resolution,now){
 if(!s.reaction?.text)return [];
 const text=resolution?.text??'';
 const situation=buildSituation(s,now,{text,event});
 const {thread,commitment}=liveProposalParts(s);
 const depth=s.conversation?.depthContext?.depth;
 const cast=roomAwareCast(s,castPlan(situation,{address:directAddress(text),event,depth,thread,commitment,recent:recentSpeakers(s),speaker:s.reaction?.speaker}),text);
 if(cast.plan===ConversationPlan.NONE)return [];
 const decisions=decideBoth(situation);
 let order=cast.order;
 // The structure is derived from the decisions, not from the incidental wording,
 // so the guard compares real interaction shapes across turns and restarts.
 const question=isQuestion(s.reaction.text);
 const cta=order=>order.some(id=>CTA_KINDS.includes(decisions[id].recommendation.kind));
 const guarded=guardStructure(s,{mode:situation.mode,order,question,cta:cta(order)});
 if(!directAddress(text)&&guarded.adjusted&&guarded.order.length>=1&&guarded.order.length<=3)order=guarded.order;
 const relationship={stage:relationshipStage(metrics(s,now)),voice:relationshipVoice(relationshipStage(metrics(s,now)))};
 const lead=s.reaction.speaker===order[0]&&useLead(situation,decisions[order[0]],s.reaction)?{speaker:order[0],text:s.reaction.text}:null;
 const messages=composeDialogue(s,{order,situation,decisions,now,lead,relationship});
 const structure=structureKey({mode:situation.mode,order,question,cta:cta(order)});
 return messages.map(message=>({speaker:message.speaker,text:message.text,emotion:message.emotion,structure,relationshipStage:relationship.stage}));
}

export {ConversationMode as Mode};
