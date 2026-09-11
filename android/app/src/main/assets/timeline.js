import {resolveConversation,continuation,stateOf} from './conversation.js';
import {orchestrateConversation,depthContext} from './orchestrator.js';
export function chatResolution(s,text,now){
 const r=resolveConversation(s,text,now),c=stateOf(s,now);
 r.depthContext=depthContext(s,text,now);
 if(r.commitment)return r;
 const choose=(intent,lines)=>{r.intent=intent;r.reply=lines[(s.messages?.filter(m=>m.intent===intent&&m.speaker==='SAYO').length??0)%lines.length];r.action=null;r.route=null;return r};
 if(['discuss','followup'].includes(r.depthContext.recentUserIntent)){
  const topic=r.depthContext.topic;
  if(r.depthContext.recentUserIntent==='followup'&&topic)return choose('followup',[`「${topic}」の話の続きだね。今気になっている式や箇所を見せてもらえる？`,`「${topic}」について、どの説明から引っかかったか、一緒に整理しよう。`]);
  return choose('discuss',[`「${topic}」について話したいんだね。まず、今どう考えているか聞かせて。`,`うん、「${topic}」の話を続けよう。具体的に気になったところはどこ？`]);
 }
 if(/ただいま|帰った|帰ってきた/.test(text))return choose('welcome',['おかえりー。ひと息つけた？','おかえり。今日もここで会えたね。']);
 if(/疲れ|つかれ|しんど|へとへと/.test(text))return choose('tired',['今日はちょっと大変だった？ 無理に急がなくていいよ。','お疲れさま。話したくなったら、聞いているね。']);
 if(/ありがとう|ありがと/.test(text))return choose('thanks',['うん。今日も一緒にいられてうれしいよ。','どういたしまして。また少しずつ、ね。']);
 if(/おはよう|こんにちは|こんばんは/.test(text))return choose('greeting',['会えてうれしい。今日はどんな感じ？','うん、ここにいるよ。ゆっくり話そう。']);
 if(!r.topic){const clean=text.replace(/今日は|でも|ちょっと|進めたい|やるかー|やろう|やりたい|を|ね|。/g,'').trim();const matches=s.materials.filter(m=>!m.archived&&clean.length>=2&&m.title.includes(clean));if(matches.length===1)r.topic={kind:'materials',item:matches[0]};}
 if(r.topic||r.action==='start'){r.action=null;r.route=null;r.intent='suggest';r.reply=`${r.topic?.item.title??continuation(s,now)?.item.title}の続き${c.intent==='tired'?'、少しだけにする？':'からにする？'}`;return r;}
 if(r.intent==='clarify')return choose('listen',c.intent==='tired'?['うん。今日はどんなことがあった？','そうだったんだ。今は少し休めそう？']:['うん、聞いているよ。もう少し聞かせて。','それ、どんな感じだった？']);
 return r;
}
export function appendTimeline(s,previous,event,now,resolution){
 s.messages??=[];
 const push=m=>{if(!s.messages.some(x=>x.id===m.id))s.messages.push(m)};
 if(resolution)push({id:crypto.randomUUID(),speaker:'user',text:resolution.text,at:now,intent:resolution.intent});
 if(event==='finish'){const x=s.sessions.find(x=>x.endTimestamp===now);if(x)push({id:'study:'+x.sessionId,speaker:'event',sessionId:x.sessionId,text:'',at:now});}
 const added=[];
 if(s.reaction&&s.reaction.timestamp===now&&(s.reaction.timestamp!==previous.reaction?.timestamp||resolution))for(const [index,message] of orchestrateConversation(s,event,resolution,now).entries()){
  const item={id:crypto.randomUUID(),speaker:message.speaker,text:message.text,at:now+index,intent:resolution?.intent||event||'reaction',target:index===0&&resolution?.topic?{kind:resolution.topic.kind,id:resolution.topic.item.id}:null};
  push(item);added.push(item);
 }
 if(added.length){const c=stateOf(s,now),last=added.at(-1);for(const m of added.slice(1))c.turns.push({speaker:m.speaker,text:m.text,at:m.at});c.turns=c.turns.slice(-6);c.lastSpeaker=last.speaker;c.recentReaction=last.text.slice(0,300);c.lastInteractionAt=now;s.conversation=c;}
 // Bounded chat storage, never prune StudySession or important Memory.
 s.messages=s.messages.slice(-1000);
 if(resolution?.depthContext)s.conversation.depthContext=resolution.depthContext;
 return added;
}
export function validateMessages(s){if(s.messages===undefined)return;const ids=new Set();if(!Array.isArray(s.messages)||s.messages.length>1000)throw Error('会話履歴が不正です');for(const m of s.messages){if(typeof m.id!=='string'||ids.has(m.id)||!['user','SAYO','NurseT','event'].includes(m.speaker)||typeof m.text!=='string'||m.text.length>2000||!Number.isFinite(m.at)||m.at<0)throw Error('会話メッセージが不正です');ids.add(m.id);if(m.sessionId&&!s.sessions.some(x=>x.sessionId===m.sessionId))throw Error('学習記録の参照が不正です');}}
