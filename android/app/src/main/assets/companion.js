import {isWeeklyQuestion,weeklyContext,weekStart} from './life-balance-analytics.js';
import {stateOf,relevantRecall} from './conversation.js';
import {active,entity,metrics,report,dateKey,shiftDate} from './domain.js';
import {LocalRulesProvider} from './reactions.js';
import {CharacterProfiles,profileFor} from './templates.js';
import {entertainmentBudget} from './life-balance.js';
import {CharacterMemoryRouter} from './character-memory.js';
import {selectThread} from './continuity.js';
import {dueReturn} from './return-queue.js';
import {relationshipStage,relationshipVoice} from './relationship.js';
import {buildCharacterRuntime} from './character-engine.js';
export {voiceSettings,voiceDefaults} from './voice-settings.js';
import {voiceSettings} from './voice-settings.js';
export function inQuietHours(v,now,offset){const h=new Date(now+offset*60000).getUTCHours();return v.quietHours&&(v.quietStart===v.quietEnd|| (v.quietStart<v.quietEnd?h>=v.quietStart&&h<v.quietEnd:h>=v.quietStart||h<v.quietEnd))}
export function previousStudy(s){for(const x of [...s.sessions].filter(x=>x.endTimestamp!==null).sort((a,b)=>b.endTimestamp-a.endTimestamp)){const task=entity(s,'tasks',x.relatedTaskId),material=entity(s,'materials',x.relatedMaterialId);const target=task&&!task.archived&&!task.done?{kind:'tasks',item:task}:material&&!material.archived?{kind:'materials',item:material}:null;if(target)return {...target,material,lastStudied:x.endTimestamp}}return null}
/**
 * Bounded continuity + separated-memory slice for one speaker.
 *
 * The remote model only ever sees the thread, the deferred return and the memory
 * records the local ContinuityEngine already chose to bring forward — never the
 * full history, and never a topic it decided on its own.
 */
export function companionContinuity(s,now,speaker='SAYO'){
 const proposal=s.initiative?.activeProposal??null;
 const live=proposal?.threadId?(s.openThreads??[]).find(x=>x.id===proposal.threadId)??null:null;
 const thread=live??selectThread(structuredClone(s),now);
 const commitment=proposal?.commitmentId?(s.commitments??[]).find(c=>c.commitmentId===proposal.commitmentId)??null:null;
 const deferred=dueReturn(s,now);
 const stage=relationshipStage(metrics(s,now));
 const memory=new CharacterMemoryRouter().route(s,{speaker,topic:thread?.topic??'',relatedId:thread?.relatedMaterialId??null,limit:2});
 return {speaker,mode:s.conversation?.mode??null,memory,
  openThread:thread?{id:thread.id,topic:thread.topic,summary:thread.summary,status:thread.status,source:thread.source,owner:thread.owner}:null,
  deferredReturn:deferred?{id:deferred.id,kind:deferred.kind,summary:deferred.summary,speakerPreference:deferred.speakerPreference}:null,
  activeCommitment:commitment?{commitmentId:commitment.commitmentId,title:commitment.title,minutes:commitment.minutes??null,owner:commitment.owner}:null,
  relationship:{stage,voice:relationshipVoice(stage)}};
}
export class ContextAssembler {
 assemble(s,now,userMessage='',{speaker='SAYO',speakers=[speaker]}={}){const current=active(s),d=dateKey(now,s.settings.utcOffsetMinutes),lb=s.settings.lifeBalance||{},mode=lb.dailyMode||'NORMAL';const used=Number(lb.entertainmentUsedMinutes||0),ids=[...new Set((Array.isArray(speakers)?speakers:[speaker]).filter(id=>id==='SAYO'||id==='NurseT'))],characterEngines=Object.fromEntries(ids.map(id=>[id,buildCharacterRuntime(structuredClone(s),CharacterProfiles,id,userMessage,now,{userAskedDeep:/詳しく|深く|掘り下げ/.test(userMessage)})]));return structuredClone({weeklyUsage:weeklyContext(s.lifeBalanceAnalytics,weekStart(now,userMessage.startsWith('先週')),{enabled:lb.usageInConversation!==false,relevant:isWeeklyQuestion(userMessage)}),conversation:stateOf(s,now),characters:CharacterProfiles,currentStudy:current,material:entity(s,'materials',current?.relatedMaterialId),goal:entity(s,'goals',current?.relatedGoalId),task:entity(s,'tasks',current?.relatedTaskId),today:report(s,now,d,d),week:report(s,now,shiftDate(d,-6),d),recentSessions:s.sessions.slice(-3),selectedMemory:[...s.memories].sort((a,b)=>b.importance-a.importance).slice(0,3),relationship:metrics(s,now),characterEngine:characterEngines[speaker]??characterEngines.SAYO,characterEngines,companion:companionContinuity(s,now,speaker),dailyUsage:lb.usageInConversation===false?null:{mode,budget:entertainmentBudget(mode,used,lb.budgetMinutes),studyGoalMinutes:Number(lb.studyGoalMinutes||0),studyCompletedMinutes:Math.floor(report(s,now,d,d).seconds/60)}})}
}
/** Future providers generate intent only; never receive writable domain state. */
export class DialogueProvider {async generate(context){throw Error('Provider unavailable')}}
export class FallbackDialogueProvider extends DialogueProvider {
 constructor(remote,local,timeoutMs=3000){super();this.remote=remote;this.local=local;this.timeoutMs=timeoutMs}
 async generate(context){let timer;const controller=new AbortController();try{return await Promise.race([this.remote.generate(structuredClone(context),controller.signal),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('timeout'))},this.timeoutMs)})])}catch{return this.local.generate(structuredClone(context))}finally{clearTimeout(timer)}}
}
export class SpeakerSelector {
 select(s,event,now,context={}){if(s.settings.quiet||!event)return null;const previous=s.reaction,c=stateOf(s,now),critical=['finish','goal','break','start'].includes(event);if(previous&&now-previous.timestamp<20000&&!critical)return null;const preferred=['break','dailyReview','weeklyReview','long','statistics'].includes(event)?'NurseT':'SAYO';if(event==='recall'||context.memory)return 'SAYO';if(['hello','interact'].includes(event)&&c.lastSpeaker&&now-c.lastInteractionAt<120000)return c.lastSpeaker;return preferred}
}
const nurse={break:['ひと息つきましょう。準備ができたら、続きを。','休憩の時間です。目や肩を少し休めてくださいね。'],dailyReview:['今日の積み重ねを、一緒に振り返りましょう。','今日取り組んだことが、ここに残っています。'],weeklyReview:['一週間の記録を整理しました。あなたのペースが見えてきますね。','学習した日も、休んだ日も含めて、一週間です。']};
export class ReactionDirector {
 constructor(){this.local=new LocalRulesProvider();this.selector=new SpeakerSelector()}
 react(s,event,context,now){let recalled=null;if(['hello','return','interact','finish','goal'].includes(event)&&!active(s)){const c=stateOf(s,now),memory=relevantRecall(s,c,now,{event,text:c.topic});if(memory){context={...context,memory:memory.text};event='recall';recalled={c,memory}}}const speaker=this.selector.select(s,event,now,context);if(!speaker)return;const old=s.reaction;if(speaker==='NurseT'&&nurse[event]){const list=nurse[event],choices=list.map((text,i)=>({text,id:`NurseT:${event}:${i}`})).filter(x=>x.id!==old?.templateId);choices.sort((a,b)=>(s.dialogueHistory[a.id]?.count??0)-(s.dialogueHistory[b.id]?.count??0));const x=choices[0];s.dialogueHistory[x.id]={count:(s.dialogueHistory[x.id]?.count??0)+1,last:now};s.reaction={text:x.text,templateId:x.id,event,emotion:'Relaxed',gesture:'None',timestamp:now,speaker}}else{this.local.react(s,event,context,now);if(s.reaction!==old)s.reaction.speaker=speaker}if(recalled&&s.reaction!==old){recalled.c.lastRecallId=recalled.memory.id;recalled.c.recentRelevantMemoryId=recalled.memory.id;recalled.c.lastRecallAt=now;s.conversation=recalled.c;const id=`recall:${recalled.memory.id}`,oldUse=s.dialogueHistory[id];s.dialogueHistory[id]={count:(oldUse?.count??0)+1,last:now}}}
}
export function speechRequest(s,previous,now,lastSpoken=0){const r=s.reaction,v=voiceSettings(s.settings.voice);if(!r||r===previous||r.timestamp===previous?.timestamp&&r.templateId===previous?.templateId||!r.text||!v.enabled||s.settings.quiet||inQuietHours(v,now,s.settings.utcOffsetMinutes))return null;const speaker=r.speaker||'SAYO';if(speaker==='SAYO'&&!v.sayo||speaker==='NurseT'&&!v.nurse)return null;const important=['start','finish','goal','material','break'].includes(r.event);if(now-lastSpoken<({low:180000,normal:60000,high:20000}[v.frequency])&&!important)return null;if(active(s)&&!['start','break'].includes(r.event))return null;return {speaker,text:r.text,volume:v.volume,priority:important?2:1,voiceStyle:profileFor(speaker).voice.styleTendency??'normal'}}

export class LocalDialogueProvider extends DialogueProvider {async generate(context){const minutes=Math.floor((context.today?.seconds??0)/60);const material=context.material;return {text:material?`${material.title}、${material.progress} ${material.unit}まで進んでいますね。`:`今日は${minutes}分、学習を積み重ねています。`,emotion:context.conversation?.emotionalState??'calm',event:'review'}}}
