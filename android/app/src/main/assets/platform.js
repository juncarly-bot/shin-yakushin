import {upsertDaily} from './life-balance-analytics.js';
import {chatResolution,appendTimeline,validateMessages} from './timeline.js';
import {resolveConversation,updateConversation} from './conversation.js';
import {fresh,validate,migrate,apply,metrics} from './domain.js';
import {ReactionDirector} from './companion.js';
/** Native store is authoritative. No localStorage/IndexedDB silent fallback. */
export class StudyApplication {
 constructor(host,clock=()=>Date.now()){this.host=host;this.clock=clock;this.provider=new ReactionDirector();this.state=null;this.warning='';}
 parse(raw){const reply=JSON.parse(raw);if(!reply.ok)throw Error(reply.error||'保存できませんでした');this.warning=reply.warning||'';return reply.raw;}
 load(){let raw=this.parse(this.host.read());if(raw===null)raw=this.parse(this.host.commit(-1,JSON.stringify(fresh()),false));const next=migrate(JSON.parse(raw));validateMessages(next);this.state=next;return this.state;}
 command(action,payload={}){if(!this.state)this.load();const previous=this.state;const now=this.clock();const resolution=action==='chat'?chatResolution(previous,payload.text,now):action==='conversation'?resolveConversation(previous,payload.text,now,payload.selection):null;const {state,event,context}=apply(previous,resolution?.action??(resolution?'interact':action),resolution?.action?resolution.payload:payload,now);if(resolution&&!resolution.action){state.reaction={text:resolution.reply,templateId:'conversation:'+resolution.intent,event:'conversation',emotion:'Neutral',gesture:'None',timestamp:now,speaker:['review','break'].includes(resolution.intent)?'NurseT':'SAYO'}}else this.provider.react(state,event,context,now);updateConversation(state,event,now,resolution);if(resolution?.intent==='tired'){state.conversation.characters.SAYO={mood:'concerned',since:now,until:now+180000};state.conversation.emotionalState='concerned';state.conversation.emotionalStateSince=now;}const voiceMessages=appendTimeline(state,previous,event,now,resolution);state.revision=previous.revision+1;validate(state);validateMessages(state);try{const raw=this.parse(this.host.commit(previous.revision,JSON.stringify(state),false));this.state=validate(JSON.parse(raw));this.lastConversationResult=resolution;this.lastVoiceMessages=voiceMessages;return this.state}catch(error){this.load();throw error;}}
 acceptRemoteReaction(messageId,result){return this.acceptRemoteTurn([messageId],[result])}
 /* A group turn replaces the planned companion bubbles in order; the plan stays local. */
 acceptRemoteTurn(ids,results){
  if(!this.state)throw Error('state unavailable');
  if(!Array.isArray(ids)||!ids.length||!Array.isArray(results)||ids.length!==results.length)throw Error('stale remote response');
  const previous=this.state,state=structuredClone(previous),lastUser=state.messages.map(x=>x.speaker).lastIndexOf('user'),updated=[],replaced=[];
  ids.forEach((id,position)=>{
   const index=state.messages.findIndex(x=>x.id===id&&['SAYO','NurseT'].includes(x.speaker));
   if(index<0||index<lastUser)throw Error('stale remote response');
   const message=state.messages[index],before=message.text,text=String(results[position]?.text??'').trim().slice(0,800);
   if(!text)throw Error('invalid remote response');
   const emotion=['calm','pleased','focused','concerned','relaxed','proud','tired_context'].includes(results[position]?.emotion)?results[position].emotion:'calm';
   message.text=text;message.emotion=emotion;
   const c=state.conversation;
   if(c){if(c.recentReaction===before)c.recentReaction=text;for(let i=c.turns.length-1;i>=0;i--){if(c.turns[i].speaker===message.speaker&&c.turns[i].text===before){c.turns[i].text=text;break}}c.emotionalState=emotion;c.emotionalStateSince=this.clock();if(c.characters?.[message.speaker]){c.characters[message.speaker].mood=emotion;c.characters[message.speaker].since=this.clock();c.characters[message.speaker].until=this.clock()+180000}}
   if(state.reaction&&state.reaction.speaker===message.speaker){if(state.reaction.text===before){state.reaction.text=text;state.reaction.templateId='remote:'+message.id}state.reaction.emotion=emotion}
   updated.push(structuredClone(message));replaced.push(message.id);
  });
  state.revision=previous.revision+1;validate(state);validateMessages(state);
  const raw=this.parse(this.host.commit(previous.revision,JSON.stringify(state),false));
  this.state=validate(JSON.parse(raw));this.lastVoiceMessages=updated;return this.state;
 }
 recordDailyAggregate(input){if(!this.state)this.load();const previous=this.state,next=structuredClone(previous);if(next.lifeBalanceAnalytics!==undefined&&(next.lifeBalanceAnalytics.version!==1||!Array.isArray(next.lifeBalanceAnalytics.days)))throw Error('既存の分析履歴を確認してください。元データは変更しません');next.lifeBalanceAnalytics=upsertDaily(next.lifeBalanceAnalytics,input);if(JSON.stringify(previous.lifeBalanceAnalytics)===JSON.stringify(next.lifeBalanceAnalytics))return previous;next.revision=previous.revision+1;validate(next);validateMessages(next);const raw=this.parse(this.host.commit(previous.revision,JSON.stringify(next),false));const committed=JSON.parse(raw);validate(committed);validateMessages(committed);this.state=committed;return committed;}
 previewImport(raw){if(raw.length>25_000_000)throw Error('読み込むファイルが大きすぎます');const parsed=JSON.parse(raw);const next=migrate(parsed);validateMessages(next);return {state:next,fromVersion:parsed.schemaVersion,sessions:next.sessions.length,materials:next.materials.length,memories:next.memories.length,metrics:metrics(next,this.clock())};}
 restore(preview){if(this.state.sessions.some(x=>x.endTimestamp===null))throw Error('学習を終了してから復元してください');const next=migrate(preview.state);next.revision=this.state.revision+1;const raw=this.parse(this.host.commit(this.state.revision,JSON.stringify(next),true));this.state=validate(JSON.parse(raw));return this.state;}
}
