import {totals} from './domain.js';

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

export const ConversationPlan=Object.freeze({
 NONE:'NONE',SAYO_ONLY:'SAYO_ONLY',T_ONLY:'T_ONLY',SAYO_THEN_T:'SAYO_THEN_T',
 T_THEN_SAYO:'T_THEN_SAYO',SHORT_GROUP_EXCHANGE:'SHORT_GROUP_EXCHANGE'
});

/* Display names stay out of state: ids are SAYO / NurseT forever. */
const SAYO_ALIASES=['小夜','さよ','SAYO'];
const NURSE_ALIASES=['TTちゃん','ＴＴちゃん','Tちゃん','Ｔちゃん','ナースロボ＿タイプＴ','ナースロボ','タイプT','タイプＴ','タイプＴ','NurseT'];
const BOTH_ALIASES=['二人','ふたり','2人','両方','みんな'];
const PLANNING=/計画|予定|スケジュール|何時|時間割|見積|何分|何時間|ペース|間に合|配分|組み方/;
const FATIGUE=/へとへと|しんど|限界|眠れない|眠たい|もう無理/;
const REVIEW=/振り返|レビュー|今週|先週|まとめ|記録の整理/;

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

function assistantHistory(s){
 const ids=['SAYO','NurseT'];
 return (s.messages??[]).filter(m=>ids.includes(m.speaker)).slice(-6).map(m=>m.speaker);
}
/** Recent balance only — never a mechanical alternation. */
function participation(s){
 const history=assistantHistory(s),tail=history.slice(-4),reversed=[...history].reverse(),index=reversed.indexOf('NurseT');
 return {history,sayoRun:tail.length===4&&tail.every(x=>x==='SAYO'),nurseTalks:tail.filter(x=>x==='NurseT').length,sinceNurse:index<0?99:index,last:history.at(-1)??null};
}

/** Chooses participation only. Study and memory remain authoritative elsewhere. */
export function conversationPlan(s,event,resolution,now){
 if(!s.reaction?.text)return ConversationPlan.NONE;
 const text=resolution?.text??'',address=directAddress(text),depth=s.conversation?.depthContext?.depth,speaker=s.reaction.speaker||'SAYO',who=participation(s);
 if(address==='BOTH')return ConversationPlan.SHORT_GROUP_EXCHANGE;
 if(address==='NurseT')return ConversationPlan.T_THEN_SAYO;
 if(address==='SAYO')return ConversationPlan.SAYO_ONLY;
 if(['break','dailyReview','weeklyReview'].includes(event)||resolution?.intent==='review')return ConversationPlan.T_ONLY;
 if(resolution?.intent==='tired'&&FATIGUE.test(text))return ConversationPlan.SAYO_THEN_T;
 if(event==='finish'){
  const session=s.sessions.find(x=>x.endTimestamp===now);
  if(session&&totals(session,now).study>=2*3600)return ConversationPlan.SHORT_GROUP_EXCHANGE;
  return speaker==='NurseT'?ConversationPlan.T_ONLY:ConversationPlan.SAYO_ONLY;
 }
 if(PLANNING.test(text))return who.nurseTalks>=2?ConversationPlan.T_ONLY:ConversationPlan.T_THEN_SAYO;
 if(REVIEW.test(text)||event==='recall')return ConversationPlan.T_ONLY;
 if(depth==='DEEP')return who.sinceNurse>=3?ConversationPlan.SHORT_GROUP_EXCHANGE:ConversationPlan.SAYO_ONLY;
 if(depth==='ENGAGED'&&who.sayoRun&&who.history.length>=4)return ConversationPlan.T_THEN_SAYO;
 return speaker==='NurseT'?ConversationPlan.T_ONLY:ConversationPlan.SAYO_ONLY;
}

/* Local voice stays casual; the companion never lectures by default. */
const sayoLines={
 quick:['うん。','おー。','そっか。'],
 casual:['お、今日は早いじゃん。','昨日の続きやる？','んー、今日はもう切ってもよさそう。','やるなら15分だけやろー。'],
 planning:['おー、やる気あるね。','じゃ、それでいこー。','そのペースだと、後半きつそうじゃない？'],
 fatigue:['じゃ終わろ終わろ。','おつかれ。今日はゆっくりしよ。','今日はここまででいっか。'],
 finish:['お、ちゃんと戻ってきた。','おつかれー。','もう15分いく？'],
 review:['今日も、ちゃんと積み上がってるね。','ここまで、ちゃんと残ってるよ。']
};
const nurseLines={
 planning:['3時間を一度に、ですか？','90分を2回に分ける方が現実的だと思います。','一度に詰め込むより、区切りを入れた方が続きます。','後半が重くなりそうなら、前半を軽くしておきましょう。'],
 fatigue:['珍しく判断が早いですね。','今日はここまででも十分だと思います。','休む判断も、記録のうちです。'],
 finish:['予定の時間は達成しています。','この調子なら、次も無理なく続けられます。','まだ集中できそうですか？'],
 review:['今日の積み重ねを、一緒に振り返りましょう。','学習した日も、休んだ日も含めて一週間です。'],
 quick:['記録を見る限り、無理のない範囲です。','続けるなら、時間を決めてからにしましょう。'],
 break:['休憩の長さを決めて、いったん手を止めましょう。','まずは少し肩の力を抜いてください。']
};

function subject(event,resolution,depth){
 const text=resolution?.text??'';
 if(event==='break')return 'break';
 if(event==='finish')return 'finish';
 if(resolution?.intent==='tired'||FATIGUE.test(text))return 'fatigue';
 if(PLANNING.test(text))return 'planning';
 if(REVIEW.test(text)||['dailyReview','weeklyReview'].includes(event))return 'review';
 return depth==='QUICK_REACTION'||depth===undefined?'quick':'casual';
}
/** Deterministic, bounded variation via dialogueHistory — never Math.random. */
function pick(s,list,key,now){
 const history=s.dialogueHistory??(s.dialogueHistory={});
 let best=null;
 list.forEach((text,index)=>{
  const id=`local:${key}:${index}`,count=history[id]?.count??0,last=history[id]?.last??0;
  if(!best||count<best.count||(count===best.count&&last<best.last))best={text,id,count,last};
 });
 history[best.id]={count:best.count+1,last:now};
 return best.text;
}
function sayoLine(s,kind,now,lead,speakerOfLead){
 if(lead&&speakerOfLead==='SAYO')return lead;
 return pick(s,sayoLines[kind]??sayoLines.casual,'sayo:'+kind,now);
}
function nurseLine(s,kind,now,lead,speakerOfLead){
 if(lead&&speakerOfLead==='NurseT')return lead;
 return pick(s,nurseLines[kind]??nurseLines.quick,'nurse:'+kind,now);
}

export function orchestrateConversation(s,event,resolution,now){
 const plan=conversationPlan(s,event,resolution,now);
 if(plan===ConversationPlan.NONE)return [];
 const lead=s.reaction?.text||'',speakerOfLead=s.reaction?.speaker||'SAYO',kind=subject(event,resolution,s.conversation?.depthContext?.depth);
 const sayo=()=>sayoLine(s,kind,now,lead,speakerOfLead),nurse=()=>nurseLine(s,kind,now,lead,speakerOfLead);
 if(plan===ConversationPlan.T_ONLY)return [{speaker:'NurseT',text:nurse()}];
 if(plan===ConversationPlan.SAYO_ONLY)return [{speaker:'SAYO',text:sayo()}];
 if(plan===ConversationPlan.SAYO_THEN_T)return [{speaker:'SAYO',text:sayo()},{speaker:'NurseT',text:nurse()}];
 if(plan===ConversationPlan.T_THEN_SAYO)return [{speaker:'NurseT',text:nurse()},{speaker:'SAYO',text:sayo()}];
 return [{speaker:'SAYO',text:sayo()},{speaker:'NurseT',text:nurse()},{speaker:'SAYO',text:pick(s,sayoLines[kind==='quick'?'casual':kind]??sayoLines.casual,'sayo-close:'+kind,now)}];
}
