import {compatibleLifeBalance} from './life-balance-compat.js';
import {validateConversation} from './conversation-shape.js';
import {voiceSettings} from './voice-settings.js';
import {CommitmentStatus,COMMITMENT_KINDS,COMMITMENT_STATUSES,PROACTIVITY_LEVELS,DEFAULT_MINUTES,MAX_OPEN,isOpen,isMeaningful,matchesStudy} from './commitments.js';
import {addShared,addCharacterMemory,noteFinishedSession} from './character-memory.js';
import {detectThread,resolveThreads,resolveThreadsForStudy,markThreadResurfaced,abandonThread} from './continuity.js';
import {enqueueReturn,markReturnDelivered,pruneReturns} from './return-queue.js';
/** Android-independent domain. v0.1 segment and identity contracts retained. */
export const VERSION=2;
export const kinds=['materials','goals','tasks','plans'];
export const refs={relatedPlanId:'plans',relatedTaskId:'tasks',relatedMaterialId:'materials',relatedGoalId:'goals'};
const clone=x=>JSON.parse(JSON.stringify(x));
const fail=m=>{throw new Error(m)};
const str=(x,max=2000)=>{if(typeof x!=='string'||x.length>max)fail('文字数・形式を確認してください');return x.trim()};
const num=(x,min=0,max=253402214400000)=>{if(typeof x!=='number'||!Number.isFinite(x)||x<min||x>max)fail('数値が範囲外です');return x};
const arr=x=>{if(!Array.isArray(x))fail('配列形式が不正です');return x};
const object=x=>{if(!x||typeof x!=='object'||Array.isArray(x))fail('データ形式が不正です');return x};
const bool=x=>{if(typeof x!=='boolean')fail('状態の形式が不正です');return x};
const uuid=()=>crypto.randomUUID();
export const dateKey=(t,offset=540)=>new Date(t+offset*60000).toISOString().slice(0,10);
export const dateMs=(d,offset=540)=>{if(typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d))fail('日付が不正です');const t=Date.parse(d+'T00:00:00Z');if(!Number.isFinite(t)||new Date(t).toISOString().slice(0,10)!==d)fail('日付が不正です');return t-offset*60000};
export const shiftDate=(d,n)=>dateKey(dateMs(d,0)+n*86400000,0);
export const fresh=()=>({schemaVersion:VERSION,revision:0,sessions:[],materials:[],goals:[],tasks:[],plans:[],memories:[],visits:[],progressEvents:[],dialogueHistory:{},reaction:null,commitments:[],sharedMemories:[],characterMemories:{SAYO:[],NurseT:[]},openThreads:[],returnQueue:[],initiativeStats:{shown:0,accepted:0,declined:0,snoozed:0,completed:0},initiative:{lastPromptAt:0,lastKind:null,lastRelatedId:null,lastDeclinedAt:0,lastDeclinedKind:null,shownDay:null,shownCount:0,snoozeUntil:0,activeProposal:null},settings:{name:'',utcOffsetMinutes:540,breakMinutes:5,quiet:false,notifications:false,remoteAI:false,companion:{proactivity:'NORMAL',quietDay:null},lifeBalance:{dailyMode:'NORMAL',budgetMinutes:{NORMAL:90,HOLIDAY:180,FOCUS:60},interventionLevel:'NORMAL',cooldownMinutes:120,usageInConversation:true,usageNotifications:true,appCategories:{}}},lastSeen:null});
export const active=s=>s.sessions.find(x=>x.endTimestamp===null);
export const entity=(s,k,id)=>s[k].find(x=>x.id===id);
export function totals(x,now){const r={study:0,break:0,pause:0};for(const p of x.segments)r[p.kind]+=Math.max(0,(p.end??now)-p.start)/1000;return r}
function relations(s,p){const r={};for(const f of Object.keys(refs))r[f]=p[f]||null;for(const [f,k] of Object.entries(refs)){if(!r[f])continue;const o=entity(s,k,r[f]);if(!o)fail('関連先が見つかりません');for(const field of Object.keys(refs))if(field!==f&&!r[field]&&o[field])r[field]=o[field]}return r}
function remember(s,category,text,now,related=null,importance=1){const id=related?`${category}:${related}`:uuid();if(s.memories.some(m=>m.id===id))return;s.memories.push({id,category,text,timestamp:now,relatedId:related,importance});const manual=s.memories.filter(m=>m.category==='manual');const auto=s.memories.filter(m=>m.category!=='manual').sort((a,b)=>b.importance-a.importance||b.timestamp-a.timestamp).slice(0,300);s.memories=manual.concat(auto).sort((a,b)=>a.timestamp-b.timestamp)}
export function report(s,now,start,end,filter={}){
 const offset=s.settings.utcOffsetMinutes,lo=dateMs(start,offset),hi=dateMs(end,offset)+86400000;if(hi<=lo||hi-lo>36600*86400000)fail('日付範囲を確認してください');
 const daily={},materials={},goals={},ids=new Set();for(let t=lo;t<hi;t+=86400000)daily[dateKey(t,offset)]=0;
 for(const x of s.sessions){if(filter.material&&x.relatedMaterialId!==filter.material||filter.goal&&x.relatedGoalId!==filter.goal)continue;
  for(const p of x.segments){if(p.kind!=='study')continue;let a=Math.max(p.start,lo),b=Math.min(p.end??now,hi);while(a<b){const d=dateKey(a,offset),next=Math.min(dateMs(d,offset)+86400000,b),seconds=(next-a)/1000;daily[d]+=seconds;ids.add(x.sessionId);const m=x.relatedMaterialId||'free';materials[m]=(materials[m]||0)+seconds;if(x.relatedGoalId)goals[x.relatedGoalId]=(goals[x.relatedGoalId]||0)+seconds;a=next}}
 }
 const progress=s.progressEvents.filter(e=>e.timestamp>=lo&&e.timestamp<hi&&(!filter.material||e.kind==='materials'&&e.relatedId===filter.material)&&(!filter.goal||e.kind==='goals'&&e.relatedId===filter.goal));
 return {daily,seconds:Object.values(daily).reduce((a,b)=>a+b,0),sessions:[...ids],materials,goals,completedTasks:s.tasks.filter(x=>x.completedAt>=lo&&x.completedAt<hi&&(!filter.material||x.relatedMaterialId===filter.material)&&(!filter.goal||x.relatedGoalId===filter.goal)),goalProgress:progress.filter(e=>e.kind==='goals'),materialProgress:progress.filter(e=>e.kind==='materials'),studyDays:Object.values(daily).filter(x=>x>0).length};
}
export function metrics(s,now){let seconds=0,reward=0;const days=new Set();for(const x of s.sessions){if(x.endTimestamp===null)continue;const v=totals(x,now).study;seconds+=v;reward+=Math.floor(v/60);for(const p of x.segments){if(p.kind!=='study'||p.end<=p.start)continue;let a=dateKey(p.start,s.settings.utcOffsetMinutes),b=dateKey(p.end-1,s.settings.utcOffsetMinutes);while(a<=b){days.add(a);a=shiftDate(a,1)}}}let streak=0,c=dateKey(now,s.settings.utcOffsetMinutes);if(!days.has(c))c=shiftDate(c,-1);while(days.has(c)){streak++;c=shiftDate(c,-1)}return {seconds,reward,studyBond:Math.round(seconds/36)/100,studyDays:days.size,streak,familiarity:s.visits.length,sharedMemories:s.memories.length}}
export function validate(s,allowedVersion=VERSION){
 validateConversation(s.conversation,s);
 // Additive companion-continuity fields: old saves load with safe defaults.
 for(const key of ['sharedMemories','openThreads','returnQueue'])if(s[key]===undefined)s[key]=[];
 if(s.characterMemories===undefined||typeof s.characterMemories!=='object'||Array.isArray(s.characterMemories))s.characterMemories={SAYO:[],NurseT:[]};
 else{for(const who of ['SAYO','NurseT'])if(!Array.isArray(s.characterMemories[who]))s.characterMemories[who]=[];}
 for(const key of ['sharedMemories','openThreads','returnQueue'])for(const item of s[key]){object(item);str(item.id,200);num(item.createdAt??item.timestamp??0)}
 for(const who of ['SAYO','NurseT'])for(const item of s.characterMemories[who]){object(item);str(item.id,200);str(item.text,200);num(item.timestamp??0)}
 object(s);if(s.schemaVersion!==allowedVersion)fail('対応していない保存バージョンです。元データは変更しません');num(s.revision);if(!Number.isSafeInteger(s.revision))fail('revisionが不正です');
 for(const key of [...kinds,'sessions','memories','visits','progressEvents'])arr(s[key]);const ids={};
 for(const k of kinds){ids[k]=new Set();for(const o of s[k]){object(o);const id=str(o.id,100);if(!id||ids[k].has(id))fail('IDが空または重複しています');ids[k].add(id);if(!str(o.title,200))fail('名前がありません');str(o.memo);num(o.createdAt);if(o.completedAt!==null)num(o.completedAt);bool(o.archived);if(k==='materials'||k==='goals'){num(o.target,1);num(o.progress,0,o.target);str(o.unit,30)}else{bool(o.done);if(k==='plans')dateMs(o.date)}}}
 const checkRefs=o=>{for(const [f,k] of Object.entries(refs)){if(o[f]!==null&&o[f]!==undefined&&(!ids[k].has(o[f])||typeof o[f]!=='string'))fail('関連先がありません')}};
 for(const k of ['tasks','plans'])for(const o of s[k])checkRefs(o);
 const seen=new Set();let countActive=0;
 for(const x of s.sessions){object(x);const id=str(x.sessionId,100);if(!id||seen.has(id))fail('StudySessionが重複しています');seen.add(id);num(x.startTimestamp);if(x.endTimestamp===null)countActive++;else num(x.endTimestamp,x.startTimestamp);str(x.title,200);str(x.note);if(!['free','linked','plan'].includes(x.sourceType))fail('学習の種類が不正です');checkRefs(x);if(x.breakUntil!==null)num(x.breakUntil);if(!arr(x.segments).length)fail('学習区間がありません');let last=x.startTimestamp;
  for(const [i,p] of x.segments.entries()){if(!['study','break','pause'].includes(p.kind)||p.start!==last)fail('時間区間が連続していません');num(p.start);if(p.end===null){if(i!==x.segments.length-1||x.endTimestamp!==null)fail('未終了区間が不正です')}else num(p.end,p.start);last=p.end}if(last!==x.endTimestamp)fail('終了時刻が一致しません');if(x.milestones!==undefined)for(const m of arr(x.milestones))str(m,50);
 }
 if(countActive>1)fail('複数の学習が進行中です');const memIds=new Set();let manuals=0;
 for(const m of s.memories){object(m);str(m.id,200);if(memIds.has(m.id))fail('思い出IDが重複しています');memIds.add(m.id);str(m.category,50);str(m.text);num(m.timestamp);num(m.importance,0,10);if(m.relatedId!==null)str(m.relatedId,200);if(m.category==='manual')manuals++}if(manuals>100||s.memories.length-manuals>300)fail('思い出が上限を超えています');
 const visits=new Set();for(const d of s.visits){dateMs(d);if(visits.has(d))fail('訪問日が重複しています');visits.add(d)}
 const progressIds=new Set();for(const e of s.progressEvents){str(e.id,100);if(progressIds.has(e.id))fail('進捗履歴が重複しています');progressIds.add(e.id);if(!['materials','goals'].includes(e.kind)||!ids[e.kind].has(e.relatedId))fail('進捗履歴の関連先がありません');str(e.title,200);num(e.before);num(e.after);num(e.timestamp)}
 object(s.dialogueHistory);for(const [k,v] of Object.entries(s.dialogueHistory)){str(k,100);num(v.count);num(v.last)}if(s.lastSeen!==null)num(s.lastSeen);if(s.reaction!==null){for(const k of ['text','emotion','gesture','event','templateId'])str(s.reaction[k]);num(s.reaction.timestamp)}
 if(s.commitments!==undefined){arr(s.commitments);if(s.commitments.length>50)fail('約束が多すぎます');const cids=new Set();for(const c of s.commitments){object(c);const cid=str(c.commitmentId,100);if(!cid||cids.has(cid))fail('約束IDが不正です');cids.add(cid);if(!COMMITMENT_KINDS.includes(c.kind))fail('約束の種類が不正です');if(!COMMITMENT_STATUSES.includes(c.status))fail('約束の状態が不正です');num(c.createdAt);num(c.updatedAt);str(c.title,200);if(c.owner!==null&&c.owner!==undefined&&!['SAYO','NurseT'].includes(c.owner))fail('約束の担当が不正です');for(const key of ['dueAt','snoozedUntil','lastPromptAt','acceptedAt','completedAt','declinedAt'])if(c[key]!==null&&c[key]!==undefined)num(c[key]);if(c.promptCount!==undefined)num(c.promptCount);if(c.minutes!==undefined)num(c.minutes,1,600);checkRefs(c)}}
 if(s.initiativeStats!==undefined){object(s.initiativeStats);for(const k of ['shown','accepted','declined','snoozed','completed'])if(s.initiativeStats[k]!==undefined)num(s.initiativeStats[k])}
 if(s.initiative!==undefined){object(s.initiative);for(const k of ['lastPromptAt','lastDeclinedAt','snoozeUntil','shownCount','lastAcceptedAt'])if(s.initiative[k]!==null&&s.initiative[k]!==undefined)num(s.initiative[k]);for(const k of ['lastKind','lastDeclinedKind'])if(s.initiative[k]!==null&&s.initiative[k]!==undefined)str(s.initiative[k],60);if(s.initiative.shownDay!==null&&s.initiative.shownDay!==undefined)dateMs(s.initiative.shownDay);if(s.initiative.activeProposal!==null&&s.initiative.activeProposal!==undefined){object(s.initiative.activeProposal);str(s.initiative.activeProposal.id,200);str(s.initiative.activeProposal.kind,60);arr(s.initiative.activeProposal.actionOptions);if(s.initiative.activeProposal.actionOptions.length>4)fail('提案の操作が多すぎます');if(s.initiative.activeProposal.expiresAt!==null&&s.initiative.activeProposal.expiresAt!==undefined)num(s.initiative.activeProposal.expiresAt);for(const option of s.initiative.activeProposal.actionOptions){object(option);str(option.id,60);str(option.label,60);str(option.kind,40);if(option.minutes!==undefined&&option.minutes!==null)num(option.minutes,1,600)}}}
 const cfg=object(s.settings);if(cfg.voice!==undefined)voiceSettings(cfg.voice);if(cfg.companion!==undefined){object(cfg.companion);if(!PROACTIVITY_LEVELS.includes(cfg.companion.proactivity))fail('積極性の設定が不正です');if(cfg.companion.quietDay!==null&&cfg.companion.quietDay!==undefined&&typeof cfg.companion.quietDay!=='string')fail('静かな日の設定が不正です')}if(cfg.remoteAI!==undefined)bool(cfg.remoteAI);str(cfg.name,80);num(cfg.utcOffsetMinutes,-720,840);if(!Number.isInteger(cfg.utcOffsetMinutes))fail('時差が不正です');num(cfg.breakMinutes,1,180);bool(cfg.quiet);if(allowedVersion===2)bool(cfg.notifications);return s;
}
export function migrate(input){const original=clone(input);if(original.schemaVersion===1){validate(original,1);original.schemaVersion=2;original.settings.notifications=false;for(const x of original.sessions)x.milestones??=[];}original.commitments=Array.isArray(original.commitments)?original.commitments:[];original.initiativeStats=original.initiativeStats&&typeof original.initiativeStats==='object'&&!Array.isArray(original.initiativeStats)?original.initiativeStats:{shown:0,accepted:0,declined:0,snoozed:0,completed:0};original.initiative=original.initiative&&typeof original.initiative==='object'&&!Array.isArray(original.initiative)?original.initiative:{lastPromptAt:0,lastKind:null,lastRelatedId:null,lastDeclinedAt:0,lastDeclinedKind:null,shownDay:null,shownCount:0,snoozeUntil:0,activeProposal:null};if(original.settings&&typeof original.settings==='object'&&!Array.isArray(original.settings))original.settings.companion=original.settings.companion&&typeof original.settings.companion==='object'&&!Array.isArray(original.settings.companion)?original.settings.companion:{proactivity:'NORMAL',quietDay:null};validate(original);original.settings.lifeBalance=original.settings.lifeBalance===undefined?clone(fresh().settings.lifeBalance):compatibleLifeBalance(original.settings.lifeBalance,{preserveMissing:!!original.settings.lifeBalance&&typeof original.settings.lifeBalance==='object'&&!Array.isArray(original.settings.lifeBalance)});return validate(original)}
export function apply(state,action,p={},now=Date.now()){
 const s=clone(state);let event=null,context={};const a=active(s);
 switch(action){
 case 'visit':{const d=dateKey(now,s.settings.utcOffsetMinutes),gap=s.lastSeen===null?0:Math.floor((now-s.lastSeen)/86400000);if(!s.visits.includes(d)){s.visits.push(d);event=gap>=7?'return':'hello';context.days=gap}s.lastSeen=now;break}
 case 'start':{const sid=str(p.sessionId,100);if(!sid)fail('sessionIdが必要です');if(s.sessions.some(x=>x.sessionId===sid))return {state:s,event:null,context:{}};if(a)fail('現在の学習を続けてください');const r=relations(s,p);s.sessions.push({sessionId:sid,startTimestamp:now,endTimestamp:null,sourceType:r.relatedPlanId?'plan':Object.values(r).some(Boolean)?'linked':'free',title:str(p.title??'自由学習',200)||'自由学習',note:'',segments:[{kind:'study',start:now,end:null}],breakUntil:null,milestones:[],...r});event='start';break}
 case 'pause':case 'resume':case 'break':case 'finish':{const x=s.sessions.find(x=>x.sessionId===p.sessionId);if(!x)fail('学習が見つかりません');if(x.endTimestamp!==null)return {state:s,event:null,context:{}};const prev=x.segments.at(-1);now=Math.max(now,prev.start);if(action==='finish'){prev.end=now;x.endTimestamp=now;x.breakUntil=null;x.note=str(p.note??x.note);context={minutes:Math.floor(totals(x,now).study/60),material:x.relatedMaterialId};event='finish';for(const c of s.commitments??[])if(isOpen(c)&&matchesStudy(c,x)&&isMeaningful(c,x,now)){c.status=CommitmentStatus.COMPLETED;c.completedAt=now;c.updatedAt=now;context.completedCommitmentId=c.commitmentId;event='commitment-complete'}if(s.sessions.length===1)remember(s,'first','はじめて学習を記録した日。',now,x.sessionId,4);if(totals(x,now).study>=3600)remember(s,'long','1時間以上、一緒に取り組んだ日。',now,x.sessionId,3);const m=metrics(s,now);if([3,7,30,100,180,365].includes(m.studyDays))remember(s,'consistency',`${m.studyDays}日、学習を積み重ねた。`,now,String(m.studyDays),4);
  }else{const k={pause:'pause',resume:'study',break:'break'}[action];if(prev.kind===k)return {state:s,event:null,context:{}};prev.end=now;x.segments.push({kind:k,start:now,end:null});x.breakUntil=k==='break'?now+num(p.minutes??s.settings.breakMinutes,1,180)*60000:null;event=action}break}
 case 'classify':{const x=s.sessions.find(x=>x.sessionId===p.sessionId);if(!x)fail('学習が見つかりません');Object.assign(x,relations(s,p));x.note=str(p.note??x.note);if(p.title!==undefined)x.title=str(p.title,200)||'自由学習';break}
 case 'saveEntity':{const k=p.kind;if(!kinds.includes(k))fail('種類が不正です');const title=str(p.title??'',200);if(!title)fail('名前を入力してください');let o=entity(s,k,p.id),old=o?clone(o):null;if(p.id&&!o)fail('編集対象が見つかりません');if(!o){o={id:uuid(),createdAt:now,completedAt:null,progress:0};s[k].push(o)}Object.assign(o,{title,memo:str(p.memo??''),archived:!!p.archived});
 if(k==='materials'||k==='goals'){const target=num(p.target??100,1),progress=num(p.progress??0,0,target);Object.assign(o,{target,progress,unit:str(p.unit??(k==='materials'?'ページ':'%'),30)});if(!old||old.progress!==progress){s.progressEvents.push({id:uuid(),kind:k,relatedId:o.id,title,before:old?.progress??0,after:progress,timestamp:now});if(progress>0){event='progress';context={title,progress,target,unit:o.unit};remember(s,'progress',`${title}：${progress} ${o.unit}へ。`,now,uuid())}}o.completedAt=progress>=target?o.completedAt??now:null;if(o.completedAt&&(!old||!old.completedAt)){event='goal';context={title};remember(s,'achievement',`${title}を達成した。`,now,o.id,5)}}
 else{Object.assign(o,relations(s,p));o.done=!!p.done;o.completedAt=o.done?o.completedAt??now:null;if(k==='plans'){dateMs(p.date);o.date=p.date}if(o.done&&!old?.done){event='task';context={title};remember(s,'task',`${title}を終えた。`,now,o.id,2)}}break}
 case 'memory':{if(s.memories.filter(m=>m.category==='manual').length>=100)fail('手動の思い出は100件までです');const t=str(p.text);if(!t)fail('思い出を入力してください');remember(s,'manual',t,now,null,5);event='memory';break}
 case 'settings':{s.settings={...s.settings,...(p.voice?{voice:p.voice}:{}),name:str(p.name??'',80),utcOffsetMinutes:num(p.utcOffsetMinutes??540,-720,840),breakMinutes:num(p.breakMinutes??5,1,180),quiet:!!p.quiet,notifications:!!p.notifications,remoteAI:!!p.remoteAI,lifeBalance:p.lifeBalance??s.settings.lifeBalance};break}
 case 'intervention':{const lb=s.settings.lifeBalance||{},id=str(p.interventionId,120);if(!id)fail('介入IDが必要です');if(lb.lastInterventionId===id)return {state:s,event:null,context:{}};const text=str(p.text,300);if(!text)fail('介入メッセージがありません');const who=p.speaker==='NurseT'?'NurseT':'SAYO';s.reaction={text,templateId:'intervention:'+str(p.reason,40),event:'intervention',emotion:who==='NurseT'?'concerned':'pleased',gesture:'None',timestamp:now,speaker:who};s.settings.lifeBalance={...lb,lastInterventionId:id,lastInterventionAt:now,lastInterventionDay:dateKey(now,s.settings.utcOffsetMinutes),lastInterventionReason:str(p.reason,40)};event='intervention';context={reason:p.reason,interventionId:id,text};break}
 case 'interact':event='interact';break;
 case 'review':event=p.weekly?'weeklyReview':'dailyReview';break;
 case 'initiativeShow':{
      const messages=Array.isArray(p.messages)?p.messages.slice(0,3):[];
      if(!messages.length)fail('提案が空です');
      s.messages??=[];
      for(const [index,message] of messages.entries()){if(!['SAYO','NurseT'].includes(message?.speaker)||typeof message?.text!=='string'||!message.text.trim()||message.text.length>800)fail('提案メッセージが不正です');s.messages.push({id:crypto.randomUUID(),speaker:message.speaker,text:message.text.trim(),at:now+index,intent:'initiative'})}
      s.messages=s.messages.slice(-1000);
      s.initiativeStats??={shown:0,accepted:0,declined:0,snoozed:0,completed:0};
      s.initiative??={lastPromptAt:0,lastKind:null,lastRelatedId:null,lastDeclinedAt:0,lastDeclinedKind:null,shownDay:null,shownCount:0,snoozeUntil:0,activeProposal:null};
      const today=dateKey(now,s.settings.utcOffsetMinutes);
      if(s.initiative.shownDay!==today){s.initiative.shownDay=today;s.initiative.shownCount=0}
      s.initiative.shownCount=(s.initiative.shownCount??0)+1;
      s.initiative.lastPromptAt=now;
      s.initiative.lastKind=str(p.kind??'',60)||null;
      s.initiative.lastRelatedId=p.commitmentId?String(p.commitmentId).slice(0,100):(p.relatedId?String(p.relatedId).slice(0,100):null);
      s.initiative.snoozeUntil=0;
      s.initiativeStats.shown=(s.initiativeStats.shown??0)+1;
      if(p.commitmentId){const promised=(s.commitments??[]).find(c=>c.commitmentId===p.commitmentId);if(promised){promised.lastPromptAt=now;promised.promptCount=(promised.promptCount??0)+1;promised.updatedAt=now;if(promised.status===CommitmentStatus.SNOOZED){promised.status=CommitmentStatus.PENDING;promised.snoozedUntil=null}}}
      s.initiative.activeProposal={id:str(p.id??'proposal',200),kind:str(p.kind??'',60),createdAt:now,expiresAt:Number.isFinite(Number(p.expiresAt))?Number(p.expiresAt):null,title:str(p.title??'',200),commitmentId:p.commitmentId?String(p.commitmentId).slice(0,100):null,threadId:p.threadId?String(p.threadId).slice(0,120):null,returnId:p.returnId?String(p.returnId).slice(0,120):null,relatedMaterialId:p.relatedMaterialId??null,relatedTaskId:p.relatedTaskId??null,relatedGoalId:p.relatedGoalId??null,relatedPlanId:p.relatedPlanId??null,actionOptions:[]};
      s.initiative.activeProposal.actionOptions=(Array.isArray(p.actionOptions)?p.actionOptions:[]).slice(0,4).map(option=>({id:str(option?.id??'',60),label:str(option?.label??'',60),kind:str(option?.kind??'',40),minutes:Number.isFinite(Number(option?.minutes))?Math.max(1,Math.min(600,Number(option.minutes))):null,quietToday:Boolean(option?.quietToday),relatedMaterialId:option?.relatedMaterialId??null,relatedTaskId:option?.relatedTaskId??null,relatedGoalId:option?.relatedGoalId??null,relatedPlanId:option?.relatedPlanId??null}));
      if(s.initiative.activeProposal.threadId){const thread=(s.openThreads??[]).find(x=>x.id===s.initiative.activeProposal.threadId);if(thread)markThreadResurfaced(thread,now)}
      if(s.initiative.activeProposal.returnId){const item=(s.returnQueue??[]).find(x=>x.id===s.initiative.activeProposal.returnId);if(item)markReturnDelivered(item,now)}
      event='initiative';context={kind:p.kind,proposalId:s.initiative.activeProposal.id};break;
    }
 case 'commitment':{
      if(!COMMITMENT_KINDS.includes(p.kind))fail('約束の種類が不正です');
      const title=str(p.title??'',200)||'続き';
      const minutes=Number.isFinite(Number(p.minutes))?Math.max(1,Math.min(600,Number(p.minutes))):DEFAULT_MINUTES;
      const related=relations(s,p),existing=p.commitmentId?s.commitments.find(c=>c.commitmentId===p.commitmentId):null;
      if(p.commitmentId&&!existing)fail('約束が見つかりません');
      if(!existing&&s.commitments.filter(isOpen).length>=MAX_OPEN)fail('約束が多すぎます');
      const record={...(existing??{commitmentId:crypto.randomUUID(),createdAt:now,promptCount:0,acceptedAt:null,completedAt:null,declinedAt:null,lastPromptAt:null,snoozedUntil:null}),kind:p.kind,title,owner:p.owner==='NurseT'?'NurseT':'SAYO',source:str(p.source??'conversation',40),minutes,dueAt:Number.isFinite(Number(p.dueAt))?Number(p.dueAt):null,status:CommitmentStatus.PENDING,updatedAt:now,...related};
      if(existing)Object.assign(existing,record);else s.commitments.push(record);
      event='commitment';context={commitmentId:record.commitmentId,title};break;
    }
 case 'commitmentAction':{
      const c=s.commitments.find(x=>x.commitmentId===p.commitmentId);if(!c)fail('約束が見つかりません');
      if(p.op==='snooze'){c.status=CommitmentStatus.SNOOZED;c.snoozedUntil=Number.isFinite(Number(p.until))?Number(p.until):now+Math.max(1,Math.min(720,Number(p.minutes)||30))*60000;if(c.snoozedUntil<=now)c.snoozedUntil=now+30*60000}
      else if(p.op==='decline'){c.status=CommitmentStatus.DECLINED;c.declinedAt=now}
      else if(p.op==='complete'){c.status=CommitmentStatus.COMPLETED;c.completedAt=now}
      else if(p.op==='cancel'){c.status=CommitmentStatus.CANCELLED}
      else if(p.op==='prompt'){c.lastPromptAt=now;c.promptCount=(c.promptCount??0)+1}
      else if(p.op==='expire'){c.status=CommitmentStatus.EXPIRED}
      else fail('約束の操作が不正です');
      c.updatedAt=now;event='commitmentAction';context={commitmentId:c.commitmentId,op:p.op};break;
    }
 case 'commitmentMaintenance':{
      for(const c of s.commitments){if(c.status===CommitmentStatus.PENDING&&c.dueAt!==null&&c.dueAt!==undefined&&now-c.dueAt>36*3600000){c.status=CommitmentStatus.EXPIRED;c.updatedAt=now}if(c.status===CommitmentStatus.SNOOZED&&c.snoozedUntil!==null&&c.snoozedUntil!==undefined&&now-c.snoozedUntil>12*3600000){c.status=CommitmentStatus.EXPIRED;c.updatedAt=now}}break;
    }
 case 'initiative':{
      s.initiativeStats??={shown:0,accepted:0,declined:0,snoozed:0,completed:0};
      s.initiative??={lastPromptAt:0,lastKind:null,lastRelatedId:null,lastDeclinedAt:0,lastDeclinedKind:null,shownDay:null,shownCount:0,snoozeUntil:0};
      const today=dateKey(now,s.settings.utcOffsetMinutes);
      if(p.event==='shown'){s.initiative.snoozeUntil=0;if(s.initiative.shownDay!==today){s.initiative.shownDay=today;s.initiative.shownCount=0}s.initiative.shownCount=(s.initiative.shownCount??0)+1;s.initiative.lastPromptAt=now;s.initiative.lastKind=str(p.kind??'',60)||null;s.initiative.lastRelatedId=p.relatedId?String(p.relatedId).slice(0,100):null;s.initiativeStats.shown=(s.initiativeStats.shown??0)+1}
      else if(p.event==='accepted'){s.initiativeStats.accepted=(s.initiativeStats.accepted??0)+1;s.initiative.lastAcceptedAt=now;s.initiative.activeProposal=null}
      else if(p.event==='declined'){s.initiativeStats.declined=(s.initiativeStats.declined??0)+1;s.initiative.lastDeclinedAt=now;s.initiative.lastDeclinedKind=str(p.kind??s.initiative.lastKind??'',60)||null;s.initiative.snoozeUntil=0;s.initiative.activeProposal=null;if(p.quietToday)s.settings.companion={proactivity:PROACTIVITY_LEVELS.includes(s.settings.companion?.proactivity)?s.settings.companion.proactivity:'NORMAL',quietDay:today}}
      else if(p.event==='snoozed'){s.initiativeStats.snoozed=(s.initiativeStats.snoozed??0)+1;s.initiative.snoozeUntil=now+Math.max(1,Math.min(720,Number(p.minutes)||30))*60000;s.initiative.activeProposal=null}
      else if(p.event==='cleared'){s.initiative.activeProposal=null}
      else if(p.event==='completed'){s.initiativeStats.completed=(s.initiativeStats.completed??0)+1}
      else fail('initiativeの操作が不正です');
      break;
    }
 case 'companion':{
      const current=s.settings.companion??{proactivity:'NORMAL',quietDay:null};
      if(p.proactivity!==undefined){if(!PROACTIVITY_LEVELS.includes(p.proactivity))fail('積極性の設定が不正です');current.proactivity=p.proactivity}
      if(p.quietDay!==undefined)current.quietDay=p.quietDay;
      s.settings.companion={proactivity:current.proactivity??'NORMAL',quietDay:current.quietDay??null};
      break;
    }
 case 'memoryVault':{
      if(p.sessionId){const session=s.sessions.find(x=>x.sessionId===p.sessionId),material=session?.relatedMaterialId?entity(s,'materials',session.relatedMaterialId):null;noteFinishedSession(s,session,now,{material});event='memoryVault';context={sessionId:p.sessionId}}
      else{const record=p.who?addCharacterMemory(s,p.who,p,now):addShared(s,p,now);event='memoryVault';context={id:record?.id??null}}
      break;
    }
 case 'continuity':{
      if(p.op==='create'){const thread=detectThread(s,p.text??'',now,p.topic??null);event='continuity';context={threadId:thread?.id??null}}
      else if(p.op==='resolve'){const resolved=resolveThreads(s,p.text??'',now);event='continuity';context={resolved:resolved.length}}
      else if(p.op==='resolveStudy'){const session=s.sessions.find(x=>x.sessionId===p.sessionId);const resolved=resolveThreadsForStudy(s,session,now);event='continuity';context={resolved:resolved.length}}
      else if(p.op==='resurface'){const thread=(s.openThreads??[]).find(x=>x.id===p.threadId);if(thread){markThreadResurfaced(thread,now);event='continuity';context={threadId:thread.id}}else event=null}
      else if(p.op==='abandon'){abandonThread(s,p.threadId,now);event='continuity';context={threadId:p.threadId}}
      else fail('継続の操作が不正です');
      break;
    }
 case 'returnQueue':{
      if(p.op==='enqueue'){const record=enqueueReturn(s,p.item??p,now);event='returnQueue';context={id:record?.id??null}}
      else if(p.op==='deliver'){const item=(s.returnQueue??[]).find(x=>x.id===p.id);if(item)markReturnDelivered(item,now);event='returnQueue';context={id:p.id}}
      else if(p.op==='prune'){pruneReturns(s,now);event='returnQueue';context={}}
      else fail('保留の操作が不正です');
      break;
    }
 default:fail('不明な操作です');
 }
 validate(s);return {state:s,event,context};
}
