import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {fresh,migrate,metrics} from '../app/src/main/assets/domain.js';
import {assessMigration,buildMigrationReport,migrationReportHtml} from '../app/src/main/assets/migration-verify.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const androidRoot=path.resolve(here,'..');
const repoRoot=path.resolve(androidRoot,'..');
const read=relative=>fs.readFileSync(path.join(androidRoot,relative),'utf8');
const readRepo=relative=>fs.readFileSync(path.join(repoRoot,relative),'utf8');
const sha256=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const golden=JSON.parse(fs.readFileSync(path.join(here,'v01-golden.json'),'utf8'));
const T=golden.now;
const meta={name:'files_study.sqlite3',format:'sqlite3',sha256:'a'.repeat(64),bytes:4096};

/** A v2 state that exercises every collection the rehearsal reports on. */
function richState(){
 const state=fresh();
 state.sessions=[{sessionId:'s-1',startTimestamp:T-3600000,endTimestamp:T,sourceType:'free',title:'朝の学習',note:'',
  segments:[{kind:'study',start:T-3600000,end:T}],breakUntil:null,milestones:[],
  relatedMaterialId:null,relatedGoalId:null,relatedTaskId:null,relatedPlanId:null},
  {sessionId:'s-2',startTimestamp:T+60000,endTimestamp:null,sourceType:'free',title:'進行中',note:'',
  segments:[{kind:'study',start:T+60000,end:null}],breakUntil:null,milestones:[],relatedMaterialId:null,relatedGoalId:null,relatedTaskId:null,relatedPlanId:null}];
 state.materials=[{id:'m-1',title:'問題集',memo:'',createdAt:T,completedAt:null,archived:false,progress:40,target:100,unit:'ページ'}];
 state.goals=[{id:'g-1',title:'毎日30分',memo:'',createdAt:T,completedAt:null,archived:false,progress:1,target:30,unit:'日'}];
 state.tasks=[{id:'t-1',title:'章末問題',memo:'',createdAt:T,completedAt:null,archived:false,done:false,relatedMaterialId:'m-1',relatedGoalId:'g-1',relatedTaskId:null,relatedPlanId:null}];
 state.plans=[{id:'p-1',title:'金曜の復習',memo:'',createdAt:T,completedAt:null,archived:false,done:false,date:'2026-09-04',relatedMaterialId:null,relatedGoalId:null,relatedTaskId:'t-1',relatedPlanId:null}];
 state.memories=[{id:'mem-1',category:'manual',text:'今日は集中できた。',timestamp:T,importance:5,relatedId:null}];
 state.progressEvents=[{id:'e-1',kind:'materials',relatedId:'m-1',title:'問題集',before:0,after:40,timestamp:T}];
 state.visits=['2026-09-04','2026-09-05'];
 state.settings.lifeBalance={dailyMode:'FOCUS',defaultMode:'NORMAL',budgetMinutes:{NORMAL:90,HOLIDAY:180,FOCUS:60},
  interventionLevel:'STRICT',cooldownMinutes:60,studyGoalMinutes:180,usageInConversation:true,usageNotifications:true,
  appCategories:{'com.google.android.youtube':'ENTERTAINMENT','com.twitter.android':'ENTERTAINMENT','com.android.chrome':'STUDY','com.openai.chatgpt':'STUDY'}};
 state.lifeBalanceAnalytics={version:1,rejectedCount:0,days:[
  {date:'2026-09-04',timeZone:'Asia/Tokyo',startMs:T-86400000,endMs:T,observedAt:T,complete:true,studyMinutes:52,entertainmentMinutes:38,studyGoalMinutes:180},
  {date:'2026-09-05',timeZone:'Asia/Tokyo',startMs:T,endMs:T+86400000,observedAt:T+1,complete:false,studyMinutes:35,entertainmentMinutes:82,studyGoalMinutes:180}]};
 return state;
}

test('v0.7 golden saved state migrates to v0.8 with identical sessions, reward and bond',()=>{
 const report=assessMigration(JSON.stringify(golden.state),meta,T);
 assert.equal(report.pass,true,report.failures.join('\n'));
 assert.equal(report.sourceSchemaVersion,1);
 assert.equal(report.targetSchemaVersion,2);
 assert.equal(report.entityCounts.sessions,golden.state.sessions.length);
 assert.equal(report.sessions[0].sessionId,golden.state.sessions[0].sessionId);
 assert.equal(report.sessions[0].studySeconds,5400);
 const expected=metrics(migrate(golden.state),T);
 assert.equal(report.metrics.reward,expected.reward);
 assert.equal(report.metrics.bond,expected.studyBond);
 assert.equal(report.metrics.reward,golden.metrics.reward);
 assert.equal(report.metrics.bond,golden.metrics.studyBond);
 assert.equal(report.metrics.studySeconds,golden.metrics.seconds);
 assert.ok(report.warnings.some(text=>text.includes('通知設定')),'v1 notification downgrade must be warned about');
 assert.equal(report.sourceSha256,meta.sha256);
});

test('a v2 state without LifeBalance fields keeps every entity and gains safe defaults',()=>{
 const source=migrate(golden.state);delete source.settings.lifeBalance;source.revision=7;
 const report=assessMigration(JSON.stringify(source),meta,T);
 assert.equal(report.pass,true,report.failures.join('\n'));
 assert.equal(report.sourceSchemaVersion,2);
 assert.deepEqual(report.lifeBalance.budgetMinutes,fresh().settings.lifeBalance.budgetMinutes);
 assert.equal(report.lifeBalance.dailyMode,'NORMAL');
 assert.ok(report.warnings.some(text=>text.includes('既定値')),'missing LifeBalance must be warned about');
});

test('partial LifeBalance settings are completed and reported as warnings, not failures',()=>{
 const source=migrate(golden.state);
 source.settings.lifeBalance={dailyMode:'HOLIDAY',budgetMinutes:{HOLIDAY:240}};
 const report=assessMigration(JSON.stringify(source),meta,T);
 assert.equal(report.pass,true,report.failures.join('\n'));
 assert.equal(report.lifeBalance.dailyMode,'HOLIDAY');
 assert.equal(report.lifeBalance.budgetMinutes.HOLIDAY,240);
 assert.equal(report.lifeBalance.budgetMinutes.NORMAL,90);
 assert.ok(report.warnings.some(text=>text.includes('不足項目')),'completed fields must be warned about');
});

test('unknown optional fields survive migration and their loss is detected',()=>{
 const source=migrate(golden.state);source.futureExtension={keep:['unchanged']};source.settings.futureOption=42;
 const report=assessMigration(JSON.stringify(source),meta,T);
 assert.equal(report.pass,true,report.failures.join('\n'));
 assert.deepEqual(report.unknownFields.names,['futureExtension']);
 assert.equal(report.unknownFields.preserved,true);
 const dropped=structuredClone(migrate(source));delete dropped.futureExtension;
 const lossy=buildMigrationReport(source,dropped,meta,T);
 assert.equal(lossy.pass,false);
 assert.ok(lossy.failures.some(text=>text.includes('未対応の項目')),lossy.failures.join('\n'));
});

test('the report compares StudySession content, not just counts',()=>{
 const source=migrate(golden.state);
 const trimmed=structuredClone(source);trimmed.sessions=[];
 const report=buildMigrationReport(source,trimmed,meta,T);
 assert.equal(report.pass,false);
 assert.ok(report.failures.some(text=>text.includes('StudySession')),report.failures.join('\n'));
});

test('Malformed or unsupported sources fail without throwing and without touching the source',()=>{
 const cases=[
  ['{"schemaVersion":2,','JSONとして読み込めません'],
  ['[1,2,3]','JSONオブジェクトではありません'],
  [JSON.stringify({...migrate(golden.state),schemaVersion:99}),'移行できません'],
  [JSON.stringify((()=>{const s=migrate(golden.state);delete s.schemaVersion;return s})()),'schemaVersionがありません'],
 ];
 for(const [raw,fragment] of cases){
  const snapshot=String(raw);
  const report=assessMigration(raw,meta,T);
  assert.equal(report.pass,false,raw.slice(0,40));
  assert.ok(report.failures.some(text=>text.includes(fragment)),`${fragment} missing in ${report.failures}`);
  assert.equal(raw,snapshot,'the source string must never be mutated');
 }
});

test('LifeBalance classification, DailyMode, budgets and weekly aggregates are reported',()=>{
 const source=richState();
 const report=assessMigration(JSON.stringify(source),meta,T);
 assert.equal(report.pass,true,report.failures.join('\n'));
 assert.deepEqual(report.entityCounts,{sessions:2,activeSessions:1,materials:1,goals:1,tasks:1,plans:1,memories:1,progressEvents:1,visits:2,messages:0,dialogueTurns:0});
 assert.equal(report.lifeBalance.dailyMode,'FOCUS');
 assert.equal(report.lifeBalance.budgetMinutes.FOCUS,60);
 assert.equal(report.lifeBalance.interventionLevel,'STRICT');
 assert.deepEqual(report.lifeBalance.appCategories,{ENTERTAINMENT:2,STUDY:2});
 assert.equal(report.lifeBalance.appCategoryTotal,4);
 assert.equal(report.settings.notifications,false);
 assert.deepEqual(report.weeklyAggregates,{version:1,days:2,rejectedCount:0,firstDate:'2026-09-04',lastDate:'2026-09-05',completeDays:1});
 assert.ok(report.warnings.some(text=>text.includes('進行中')),'an active session must be warned about');
 assert.equal(report.entityCounts.activeSessions,1);
});

test('a large source keeps the study totals the migration promises',()=>{
 const source=richState();
 for(let i=0;i<200;i++)source.sessions.push({...source.sessions[0],sessionId:'bulk-'+i,startTimestamp:T-7200000,endTimestamp:T-3600000,
  segments:[{kind:'study',start:T-7200000,end:T-3600000}]});
 const report=assessMigration(JSON.stringify(source),meta,T);
 assert.equal(report.pass,true,report.failures.join('\n'));
 assert.equal(report.entityCounts.sessions,202);
 assert.equal(report.entityCounts.activeSessions,1);
 assert.equal(report.metrics.studySeconds,200*3600+3600);
});

test('the verification screen is read-only, escapes content and has no commit action',()=>{
 const report=assessMigration(JSON.stringify(richState()),{...meta,name:'<script>alert(1)</script>.sqlite3'},T);
 const html=migrationReportHtml(report);
 assert.match(html,/読み取り専用/);
 assert.match(html,/PASS/);
 assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);
 assert.match(html,/&lt;script&gt;/);
 assert.doesNotMatch(html,/data-form="restore"/);
 assert.doesNotMatch(html,/host\.commit|app\.restore/);
 const failed=migrationReportHtml(assessMigration('{broken',meta,T));
 assert.match(failed,/FAIL/);
});

test('the rehearsal never commits, never restores and never writes the source',()=>{
 const module=read('app/src/main/assets/migration-verify.js');
 assert.doesNotMatch(module,/\.commit\(/);
 assert.doesNotMatch(module,/preserveImport|localStorage|indexedDB/);
 const activity=read('app/src/main/java/org/shinyakushin/study/next/MainActivity.java');
 const branch=activity.slice(activity.indexOf('request==MIGRATION'),activity.indexOf('request==MIGRATION')+1600);
 assert.match(branch,/MigrationSource\.read\(/);
 assert.match(branch,/store\.preserveImport\(source\.json\)/);
 assert.doesNotMatch(branch,/store\.commit\(/);
 assert.match(activity,/migrationQaEnabled\(\)\{return getPackageName\(\)\.endsWith\("\.migrationqa"\);\}/);
});

test('the migration QA variant has its own package and leaves the preview package alone',()=>{
 const gradle=read('app/build.gradle');
 assert.match(gradle,/applicationId 'org\.shinyakushin\.study\.next\.v07\.preview'/);
 assert.match(gradle,/migrationqa \{/);
 assert.match(gradle,/initWith debug/);
 assert.match(gradle,/versionNameSuffix '-migrationqa'/);
 assert.match(gradle,/selector\(\)\.withBuildType\('migrationqa'\)/);
 assert.match(gradle,/variant\.applicationId\.set\('org\.shinyakushin\.study\.next\.v08\.migrationqa'\)/);
 assert.doesNotMatch(gradle,/^\s*applicationIdSuffix\s/m,'no applicationIdSuffix may be used');
 const manifest=read('app/src/main/AndroidManifest.xml');
 assert.match(manifest,/android:label="@string\/app_name"/);
 assert.equal(read('app/src/main/res/values/strings.xml').includes('新躍進政策・学習'),true);
 assert.equal(read('app/src/migrationqa/res/values/strings.xml').includes('新躍進政策・移行QA'),true);
});

test('the migration QA asset and instrumentation sources are wired into the app',()=>{
 const activity=read('app/src/main/java/org/shinyakushin/study/next/MainActivity.java');
 assert.match(activity,/"\/migration-verify\.js"/);
 assert.match(activity,/importMigrationSource\(\)/);
 const ui=read('app/src/main/assets/ui.js');
 assert.match(ui,/from '\.\/migration-verify\.js'/);
 assert.match(ui,/window\.platformMigrationQaSource=/);
 assert.match(ui,/host\.migrationQaEnabled\?\.\(\)/);
 const instrumentation=read('app/src/androidTest/java/org/shinyakushin/study/next/MigrationQa.java');
 assert.match(instrumentation,/MIGRATION_QA passed=/);
 assert.match(instrumentation,/no sibling|unexpected format/);
});

test('CI builds, verifies and uploads the migration QA APK separately',()=>{
 const workflow=readRepo('.github/workflows/android-v08.yml');
 assert.match(workflow,/assembleMigrationqa/);
 assert.match(workflow,/app\/build\/outputs\/apk\/migrationqa\/app-migrationqa\.apk/);
 assert.match(workflow,/org\.shinyakushin\.study\.next\.v08\.migrationqa/);
 assert.match(workflow,/APK_LABEL: migrationqa-/);
 assert.match(workflow,/name: shin-yakushin-v08-migrationqa-debug/);
 assert.match(workflow,/Download migration QA APK/);
 assert.match(workflow,/package:org\.shinyakushin\.study\.next\.v08\.migrationqa/);
 assert.match(workflow,/MigrationQa \| tee migration-qa-instrument\.txt/);
 assert.match(workflow,/MIGRATION_QA passed=9 failed=0/);
});

test('the signed migration QA APK is verified against the pinned RC certificate',()=>{
 const verify=read('tools/verify_apk.py');
 assert.match(verify,/os\.environ\.get\('APK_LABEL'/);
 assert.match(verify,/stem\+'SHA256SUMS\.txt'/);
 const workflow=readRepo('.github/workflows/android-v08.yml');
 const pinned=workflow.match(/EXPECTED_SIGNING_CERT_SHA256=([0-9a-f]{64})/);
 assert.ok(pinned,'the RC certificate must stay pinned in CI');
 assert.equal(workflow.includes('org.shinyakushin.study.next.v08.migrationqa'),true);
});

test('the backup script stays read-only and the QA docs describe the rehearsal',()=>{
 const backup=read('tools/backup_app_state.sh');
 for(const danger of ['pm clear','adb_cmd install','adb_cmd uninstall','pm uninstall','am force-stop','rm -rf'])
  assert.ok(!backup.includes(danger),`backup must never run '${danger}'`);
 assert.doesNotMatch(backup,/^\s*(adb|adb_cmd)\b[^\n]*\s(install|uninstall)\b/m,'the backup script must not install or uninstall');
 assert.match(backup,/run-as/);
 const doc=read('docs/MIGRATION-QA.md');
 assert.match(doc,/org\.shinyakushin\.study\.next\.v08\.migrationqa/);
 assert.match(doc,/prepare_migration_source\.py/);
 assert.match(doc,/NOT VERIFIED/);
});

test('the host tool extracts the same JSON the app imports, read-only',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'migration-qa-'));
 const payload=JSON.stringify(richState());
 fs.writeFileSync(path.join(dir,'state.json'),payload);
 const sqliteFile=path.join(dir,'files_study.sqlite3');
 execFileSync('python3',['-c',`
import sqlite3, sys, json
state = json.load(open(sys.argv[1], encoding='utf-8'))
db = sqlite3.connect(sys.argv[2])
db.execute('CREATE TABLE state (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, payload TEXT NOT NULL)')
state['revision'] = 5
db.execute('INSERT INTO state(id,revision,payload) VALUES(1,?,?)', (5, json.dumps(state, ensure_ascii=False)))
db.commit(); db.close()
`,path.join(dir,'state.json'),sqliteFile],{stdio:['pipe','pipe','pipe']});
 const before=sha256(sqliteFile);
 const out=path.join(dir,'migration-source.json');
 const stdout=execFileSync('python3',[path.join(androidRoot,'tools/prepare_migration_source.py'),sqliteFile,'-o',out],{encoding:'utf8'});
 const summary=JSON.parse(stdout);
 assert.equal(summary.sourceSchemaVersion,2);
 assert.equal(summary.counts.sessions,2);
 assert.equal(summary.dailyMode,'FOCUS');
 assert.equal(summary.weeklyAggregateDays,2);
 assert.equal(sha256(sqliteFile),before,'the backup must not be modified');
 const extracted=JSON.parse(fs.readFileSync(out,'utf8'));
 assert.equal(extracted.revision,5);
 assert.deepEqual(assessMigration(fs.readFileSync(out,'utf8'),{name:'migration-source.json',format:'json'},T).failures,[]);
});

test('the host tool reads an app-data.tar and a plain JSON backup directory',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'migration-qa-tar-'));
 const payload=JSON.stringify(richState());
 fs.writeFileSync(path.join(dir,'state.json'),payload);
 const tarFile=path.join(dir,'app-data.tar');
 execFileSync('python3',['-c',`
import sqlite3, tarfile, io, sys, json
state = json.load(open(sys.argv[1], encoding='utf-8'))
image = sys.argv[3]
db = sqlite3.connect(image)
db.execute('CREATE TABLE state (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, payload TEXT NOT NULL)')
state['revision'] = 9
db.execute('INSERT INTO state(id,revision,payload) VALUES(1,?,?)', (9, json.dumps(state, ensure_ascii=False)))
db.commit(); db.close()
with tarfile.open(sys.argv[2], 'w') as archive:
    archive.add(image, arcname='files/study.sqlite3')
`,path.join(dir,'state.json'),tarFile,path.join(dir,'inner.sqlite3')],{stdio:['pipe','pipe','pipe']});
 const out=path.join(dir,'from-tar.json');
 const tarSummary=JSON.parse(execFileSync('python3',[path.join(androidRoot,'tools/prepare_migration_source.py'),tarFile,'-o',out],{encoding:'utf8'}));
 assert.equal(tarSummary.originFormat,'tar');
 assert.equal(JSON.parse(fs.readFileSync(out,'utf8')).revision,9);
 const backupDir=path.join(dir,'backup-1');
 fs.mkdirSync(backupDir);
 fs.writeFileSync(path.join(backupDir,'files_study.backup.json'),payload);
 const jsonSummary=JSON.parse(execFileSync('python3',[path.join(androidRoot,'tools/prepare_migration_source.py'),backupDir,'-o',path.join(dir,'from-dir.json')],{encoding:'utf8'}));
 assert.equal(jsonSummary.originFormat,'json');
 assert.equal(jsonSummary.counts.materials,1);
 assert.equal(assessMigration(fs.readFileSync(path.join(dir,'from-dir.json'),'utf8'),{},T).pass,true);
});
