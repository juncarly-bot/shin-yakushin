import {VERSION,migrate,metrics,totals} from './domain.js';

/**
 * Read-only migration rehearsal report.
 *
 * assessMigration() never writes: it parses the staged source, runs the exact production
 * migration in memory and compares the result back against the source. A failure therefore
 * leaves the staged import source and the installed app's data untouched.
 */

const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const list=x=>Array.isArray(x)?x:[];
const escaped=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const freshKeys=Object.freeze(['schemaVersion','revision','sessions','materials','goals','tasks','plans','memories','visits','progressEvents','dialogueHistory','reaction','settings','lastSeen','messages','conversation','lifeBalanceAnalytics','commitments','initiativeStats','initiative']);

function emptyReport(meta){
 return {fileName:meta.name??null,sourceFormat:meta.format??null,sourceSha256:meta.sha256??null,sourceBytes:Number.isFinite(meta.bytes)?meta.bytes:null,
  sourceSchemaVersion:null,targetSchemaVersion:VERSION,entityCounts:null,sessions:null,settings:null,lifeBalance:null,weeklyAggregates:null,
  metrics:null,unknownFields:null,warnings:[],failures:[],pass:false};
}

function compareEntities(source,migrated,key,idField,label,fields,failures){
 const wanted=new Map(list(source[key]).map(item=>[String(item?.[idField]),item]));
 const seen=new Map(list(migrated[key]).map(item=>[String(item?.[idField]),item]));
 if(wanted.size!==seen.size)failures.push(`${label}: 件数が ${wanted.size} → ${seen.size} に変化しました`);
 for(const [id,item] of wanted){
  const next=seen.get(id);
  if(!next){failures.push(`${label}: ${id} が移行後にありません`);continue;}
  if(item.archived!==next.archived)failures.push(`${label}: ${id} のアーカイブ状態が変わりました`);
  for(const field of fields)if(JSON.stringify(item[field])!==JSON.stringify(next[field])){failures.push(`${label}: ${id} の ${field} が変わりました`);break;}
 }
}

function sessionsReport(source,migrated,now,failures){
 const wanted=new Map(list(source.sessions).map(x=>[String(x?.sessionId),x]));
 const seen=new Map(list(migrated.sessions).map(x=>[String(x?.sessionId),x]));
 if(wanted.size!==seen.size)failures.push(`StudySession: 件数が ${wanted.size} → ${seen.size} に変化しました`);
 const rows=[];
 for(const [id,session] of wanted){
  const next=seen.get(id);
  if(!next){failures.push(`StudySession: ${id} が移行後にありません`);continue;}
  if(session.startTimestamp!==next.startTimestamp||session.endTimestamp!==next.endTimestamp)failures.push(`StudySession: ${id} の開始/終了時刻が変わりました`);
  if(list(session.segments).length!==list(next.segments).length)failures.push(`StudySession: ${id} の学習区間数が変わりました`);
  const before=totals(session,now).study,after=totals(next,now).study;
  if(before!==after)failures.push(`StudySession: ${id} の学習秒数が ${before} → ${after} に変わりました`);
  if(list(next.milestones).length!==list(session.milestones).length)failures.push(`StudySession: ${id} のマイルストーン数が変わりました`);
  rows.push({sessionId:id,startTimestamp:next.startTimestamp,endTimestamp:next.endTimestamp,title:next.title,segments:list(next.segments).length,
   milestones:list(next.milestones).length,studySeconds:Math.round(after),active:next.endTimestamp===null});
 }
 return rows.sort((a,b)=>a.startTimestamp-b.startTimestamp);
}

function lifeBalanceReport(migrated,warnings){
 const lb=isObject(migrated?.settings?.lifeBalance)?migrated.settings.lifeBalance:null;
 if(!lb){warnings.push('lifeBalance設定を確認できません。既定値が使われます。');return null;}
 const categories={};
 for(const value of Object.values(isObject(lb.appCategories)?lb.appCategories:{})){if(!['ENTERTAINMENT','STUDY','NEUTRAL'].includes(value))continue;categories[value]=(categories[value]??0)+1;}
 return {dailyMode:lb.dailyMode??null,defaultMode:lb.defaultMode??null,budgetMinutes:isObject(lb.budgetMinutes)?lb.budgetMinutes:null,
  interventionLevel:lb.interventionLevel??null,cooldownMinutes:Number.isFinite(lb.cooldownMinutes)?lb.cooldownMinutes:null,
  studyGoalMinutes:Number.isFinite(lb.studyGoalMinutes)?lb.studyGoalMinutes:null,
  usageNotifications:typeof lb.usageNotifications==='boolean'?lb.usageNotifications:null,
  usageInConversation:typeof lb.usageInConversation==='boolean'?lb.usageInConversation:null,
  appCategories:categories,appCategoryTotal:Object.keys(isObject(lb.appCategories)?lb.appCategories:{}).length};
}

function weeklyReport(migrated,warnings){
 const ledger=migrated?.lifeBalanceAnalytics;
 if(ledger===undefined||ledger===null){warnings.push('週次集計（lifeBalanceAnalytics）は元データにありません。');return null;}
 if(!isObject(ledger)||!Array.isArray(ledger.days)){warnings.push('週次集計の形式を確認できないため、そのまま保持します。');return {version:null,days:0,rejectedCount:0,firstDate:null,lastDate:null,completeDays:0,raw:true};}
 const days=ledger.days;
 return {version:ledger.version??null,days:days.length,rejectedCount:Number.isFinite(ledger.rejectedCount)?ledger.rejectedCount:0,
  firstDate:days[0]?.date??null,lastDate:days.at(-1)?.date??null,completeDays:days.filter(d=>d?.complete===true).length};
}

/** Builds the report from an already parsed source and its migrated state. */
export function buildMigrationReport(source,migrated,meta={},now=Date.now()){
 const report=emptyReport(meta);
 report.sourceSchemaVersion=Number.isInteger(source?.schemaVersion)?source.schemaVersion:null;
 const failures=report.failures,warnings=report.warnings;
 report.sessions=sessionsReport(source,migrated,now,failures);
 const entityFields={materials:['title','progress','target','unit','memo','completedAt'],goals:['title','progress','target','unit','memo','completedAt'],
  tasks:['title','done','memo','completedAt'],plans:['title','date','done','memo','completedAt'],memories:['category','text','timestamp','importance','relatedId']};
 for(const [key,label] of [['materials','教材'],['goals','目標'],['tasks','タスク'],['plans','予定'],['memories','思い出']])
  compareEntities(source,migrated,key,'id',label,entityFields[key],failures);
 const count=key=>list(migrated[key]).length;
 report.entityCounts={sessions:count('sessions'),activeSessions:list(migrated.sessions).filter(x=>x?.endTimestamp===null).length,
  materials:count('materials'),goals:count('goals'),tasks:count('tasks'),plans:count('plans'),memories:count('memories'),
  progressEvents:count('progressEvents'),visits:count('visits'),messages:count('messages'),
  dialogueTurns:list(migrated.conversation?.turns).length};
 const sourceCounts={sessions:list(source.sessions).length,materials:list(source.materials).length,goals:list(source.goals).length,
  tasks:list(source.tasks).length,plans:list(source.plans).length,memories:list(source.memories).length,
  progressEvents:list(source.progressEvents).length,visits:list(source.visits).length};
 for(const key of Object.keys(sourceCounts))if(sourceCounts[key]!==report.entityCounts[key])failures.push(`${key}: 件数が ${sourceCounts[key]} → ${report.entityCounts[key]} に変化しました`);
 const stats=metrics(migrated,now);
 report.metrics={studySeconds:stats.seconds,studyDays:stats.studyDays,streak:stats.streak,reward:stats.reward,
  bond:stats.studyBond,sharedMemories:stats.sharedMemories,familiarity:stats.familiarity};
 const settings=migrated.settings??{};
 report.settings={name:settings.name??null,utcOffsetMinutes:Number.isFinite(settings.utcOffsetMinutes)?settings.utcOffsetMinutes:null,
  breakMinutes:Number.isFinite(settings.breakMinutes)?settings.breakMinutes:null,quiet:Boolean(settings.quiet),
  notifications:Boolean(settings.notifications),remoteAI:Boolean(settings.remoteAI),
  voicePresent:isObject(settings.voice)};
 report.lifeBalance=lifeBalanceReport(migrated,warnings);
 report.weeklyAggregates=weeklyReport(migrated,warnings);
 const unknown=list(Object.keys(source??{})).filter(key=>!freshKeys.includes(key));
 report.unknownFields={names:unknown,preserved:unknown.every(key=>key in (migrated??{}))};
 if(!report.unknownFields.preserved)failures.push('未対応の項目が移行で失われました');
 if(report.sourceSchemaVersion!==VERSION)warnings.push(`保存形式 ${report.sourceSchemaVersion} を ${VERSION} へ移行しました。`);
 if(report.sourceSchemaVersion===1&&source.settings?.notifications!==false)warnings.push('v1の通知設定は安全のため無効(false)へ移行しました。');
 if(source.settings?.lifeBalance===undefined)warnings.push('生活バランス設定が無いため既定値を補いました。');
 else if(isObject(source.settings?.lifeBalance)){const keys=['dailyMode','budgetMinutes','interventionLevel','cooldownMinutes','usageNotifications','usageInConversation','appCategories'];
  const missing=keys.filter(key=>!(key in source.settings.lifeBalance));if(missing.length)warnings.push('生活バランス設定の不足項目を補いました：'+missing.join(', '));}
 if(isObject(source.settings?.lifeBalance?.appCategories)&&isObject(migrated.settings?.lifeBalance?.appCategories)){const kept=Object.keys(migrated.settings.lifeBalance.appCategories);
  const dropped=Object.keys(source.settings.lifeBalance.appCategories).filter(pkg=>!kept.includes(pkg));
  if(dropped.length)warnings.push('アプリ分類から除外した項目があります：'+dropped.slice(0,5).join(', '));}
 if(list(report.sessions).some(row=>row.active))warnings.push('進行中のStudySessionがあります。学習を終えると復元できます。');
 report.pass=failures.length===0;
 return report;
}

/** Parses, migrates in memory and verifies. Never throws and never writes. */
export function assessMigration(raw,meta={},now=Date.now()){
 let source;
 try{source=JSON.parse(raw);}
 catch(error){return {...emptyReport(meta),failures:['JSONとして読み込めません：'+(error?.message??error)]};}
 if(!isObject(source))return {...emptyReport(meta),failures:['保存形式がJSONオブジェクトではありません']};
 const report=emptyReport(meta);
 report.sourceSchemaVersion=Number.isInteger(source.schemaVersion)?source.schemaVersion:null;
 if(report.sourceSchemaVersion===null)return {...report,failures:['schemaVersionがありません']};
 let migrated;
 try{migrated=migrate(source);}
 catch(error){return {...report,failures:['移行できません：'+(error?.message??error)]};}
 return buildMigrationReport(source,migrated,meta,now);
}

const row=(label,value)=>`<tr><th>${escaped(label)}</th><td>${escaped(value)}</td></tr>`;

/** Read-only report HTML. The screen has no commit/restore action by construction. */
export function migrationReportHtml(report){
 const counts=report.entityCounts;
 const heading=report.pass?'<p class="notice">移行リハーサル：PASS</p>':'<p class="error" role="alert">移行リハーサル：FAIL</p>';
 const list2=items=>items.length?`<ul>${items.map(item=>`<li>${escaped(item)}</li>`).join('')}</ul>`:'<p class="muted">なし</p>';
 return `<h2>移行リハーサル（読み取り専用）</h2>${heading}
 <p class="muted">元データとインストール済みアプリは変更していません。この画面は何も保存しません。</p>
 <table class="migration-report">
 ${row('移行元ファイル',report.fileName??'不明')}
 ${row('移行元の形式',report.sourceFormat??'不明')}
 ${row('移行元 schemaVersion',report.sourceSchemaVersion??'不明')}
 ${row('このアプリの schemaVersion',report.targetSchemaVersion)}
 ${row('移行元 SHA-256',report.sourceSha256??'不明')}
 ${row('StudySession',counts?`${counts.sessions}件（進行中 ${counts.activeSessions}）`:'不明')}
 ${row('教材 / 目標 / タスク / 予定',counts?`${counts.materials} / ${counts.goals} / ${counts.tasks} / ${counts.plans}`:'不明')}
 ${row('思い出 / 進捗履歴',counts?`${counts.memories} / ${counts.progressEvents}`:'不明')}
 ${row('Reward / Bond',report.metrics?`${report.metrics.reward} / ${report.metrics.bond}`:'不明')}
 ${row('学習時間',report.metrics?`${Math.floor(report.metrics.studySeconds/3600)}時間 ${Math.floor(report.metrics.studySeconds%3600/60)}分`:'不明')}
 ${row('DailyMode / 予算',report.lifeBalance?`${report.lifeBalance.dailyMode??'不明'} / NORMAL ${report.lifeBalance.budgetMinutes?.NORMAL??'?'}分・HOLIDAY ${report.lifeBalance.budgetMinutes?.HOLIDAY??'?'}分・FOCUS ${report.lifeBalance.budgetMinutes?.FOCUS??'?'}分`:'不明')}
 ${row('アプリ分類',report.lifeBalance?`娯楽 ${report.lifeBalance.appCategories.ENTERTAINMENT??0}・学習 ${report.lifeBalance.appCategories.STUDY??0}・対象外 ${report.lifeBalance.appCategories.NEUTRAL??0}`:'不明')}
 ${row('週次集計',report.weeklyAggregates?`${report.weeklyAggregates.days}日分`:'なし')}
 </table>
 <h3>警告</h3>${list2(report.warnings)}
 <h3>失敗</h3>${list2(report.failures)}
 <button type="button" data-action="cancel">閉じる</button>`;
}
