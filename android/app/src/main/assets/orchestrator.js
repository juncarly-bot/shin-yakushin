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

const nurseText={
 tired:'お疲れのようですね。まずは少し肩の力を抜いてください。',
 finish:'お疲れさまでした。水分をとって、目も休めてくださいね。',
 break:'休憩の長さを決めて、いったん手を止めましょう。',
 review:'記録を整理しました。今日進んだことをゆっくり見てみましょう。'
};

/** Chooses participation only. Study and memory remain authoritative elsewhere. */
export function conversationPlan(s,event,resolution,now){
 if(!s.reaction?.text)return ConversationPlan.NONE;
 if(resolution?.intent==='tired'&&/へとへと|しんど|限界|眠れない/.test(resolution.text))return ConversationPlan.SAYO_THEN_T;
 if(['break','dailyReview','weeklyReview'].includes(event)||resolution?.intent==='review')return ConversationPlan.T_ONLY;
 if(event==='finish'){
  const session=s.sessions.find(x=>x.endTimestamp===now);
  if(session&&totals(session,now).study>=2*3600)return ConversationPlan.SHORT_GROUP_EXCHANGE;
 }
 return s.reaction.speaker==='NurseT'?ConversationPlan.T_ONLY:ConversationPlan.SAYO_ONLY;
}

export function orchestrateConversation(s,event,resolution,now){
 const plan=conversationPlan(s,event,resolution,now),base={speaker:s.reaction?.speaker||'SAYO',text:s.reaction?.text||''};
 if(plan===ConversationPlan.NONE)return [];
 if(plan===ConversationPlan.T_ONLY)return [{...base,speaker:'NurseT'}];
 if(plan===ConversationPlan.SAYO_ONLY)return [{...base,speaker:'SAYO'}];
 if(plan===ConversationPlan.SAYO_THEN_T)return [{...base,speaker:'SAYO'},{speaker:'NurseT',text:nurseText[resolution?.intent]||nurseText.finish}];
 if(plan===ConversationPlan.T_THEN_SAYO)return [{...base,speaker:'NurseT'},{speaker:'SAYO',text:'うん。落ち着いたら、またここからにしよう。'}];
 return [{...base,speaker:'SAYO'},{speaker:'NurseT',text:nurseText.finish},{speaker:'SAYO',text:'うん。今日やってみて、どんな感じだった？'}];
}
