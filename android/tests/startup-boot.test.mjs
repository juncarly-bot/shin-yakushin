import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {StartupMarks,CRITICAL_MARKS,BOOT_PHASES,criticalStep,isStartupMark,createStartupTrace,safelyRun} from '../app/src/main/assets/startup.js';
const ui=readFileSync(new URL('../app/src/main/assets/ui.js',import.meta.url),'utf8');
const main=readFileSync(new URL('../app/src/main/java/org/shinyakushin/study/next/MainActivity.java',import.meta.url),'utf8');

const trace=(marks)=>{const t=createStartupTrace({clock:()=>0});return t};

test('the startup contract names exactly the measurable marks',()=>{
 assert.deepEqual([...StartupMarks],['process_start','activity_create','webview_create','loadUrl_start','store_ready','ui_shell_ready','recent_conversation_rendered','composer_interactive','memory_ready','voice_ready','usage_ready','continuity_ready']);
 assert.deepEqual([...CRITICAL_MARKS],['store_ready','ui_shell_ready','composer_interactive']);
 assert.equal(criticalStep('composer_interactive'),true);
 for(const mark of ['voice_ready','usage_ready','memory_ready','continuity_ready'])assert.equal(criticalStep(mark),false,mark+' must stay advisory');
 assert.equal(BOOT_PHASES.length,2);
 assert.equal(BOOT_PHASES[1].critical,false);
 for(const mark of StartupMarks)assert.equal(isStartupMark(mark),true);
 assert.equal(isStartupMark('nope'),false);
 assert.ok(main.includes('"continuity_ready"'),'the native filter knows every mark');
 for(const mark of StartupMarks)assert.ok(main.includes('"'+mark+'"'),'MainActivity must accept '+mark);
});

test('a mark is recorded once and unknown marks are rejected',()=>{
 let now=0;const t=createStartupTrace({clock:()=>now});
 assert.equal(t.mark('process_start'),0);
 now=10;assert.equal(t.mark('process_start'),0,'the first timestamp wins');
 now=20;assert.equal(t.mark('ui_shell_ready'),20);
 assert.throws(()=>t.mark('not_a_mark'),/unknown startup mark/);
 assert.equal(t.ready(),false);
 t.mark('composer_interactive');
 t.mark('store_ready');
 assert.equal(t.ready(),true);
});

test('slow VOICE, Memory, Usage and Continuity never delay time to usable chat',()=>{
 let now=0;const t=createStartupTrace({clock:()=>now});
 t.mark('process_start');
 now=40;t.mark('store_ready');
 now=90;t.mark('ui_shell_ready');
 now=120;t.mark('composer_interactive');
 now=150;t.mark('recent_conversation_rendered');
 // The advisory subsystems arrive much later.
 now=9000;t.mark('memory_ready');
 now=12000;t.mark('usage_ready');
 now=25000;t.mark('voice_ready');
 now=30000;t.mark('continuity_ready');
 assert.equal(t.timeToUsableChat(),120);
 assert.ok(t.lines().some(line=>line==='STARTUP_LATENCY timeToUsableChat 120ms'));
 assert.equal(t.lines().some(line=>/conversation_rendered/.test(line)),true);
});

test('a failing advisory subsystem cannot take the conversation down',()=>{
 const t=createStartupTrace({clock:()=>Date.now()});
 t.mark('process_start');t.mark('store_ready');t.mark('ui_shell_ready');t.mark('composer_interactive');
 let calls=0;
 const result=safelyRun(()=>{throw Error('continuity exploded')},()=>{calls++});
 assert.equal(result,undefined);
 assert.equal(calls,1);
 assert.equal(t.ready(),true,'chat is still usable after a continuity failure');
 assert.equal(safelyRun(()=>'ok'),'ok');
 safelyRun(()=>{throw Error('x')});
 assert.equal(safelyRun(()=>{throw Error('y')},()=>{throw Error('handler also broke')}),undefined,'even a broken error handler is contained');
});

test('chat is rendered before any advisory work is started',()=>{
 const advisory=ui.slice(ui.indexOf('function warmAdvisory'),ui.indexOf('try{if(!host)'));
 const boot=ui.slice(ui.indexOf('try{if(!host)'),ui.indexOf('function commitmentCard'));
 assert.ok(boot.includes("S=app.load();startup.mark('store_ready')"));
 assert.ok(boot.includes('render();scheduleTick()'));
 assert.ok(!boot.includes('prewarmVoice()'));
 assert.ok(!boot.includes('maybePropose()'));
 for(const call of ['host.requestDailyBalance?.()','host.requestDailyHistory?.()','prewarmVoice()','maybePropose()'])assert.ok(advisory.includes('safelyRun(()=>'+call+')'),call+' must be isolated');
 assert.match(advisory,/setTimeout\(\(\)=>\{/,'advisory work is deferred past first paint');
 assert.ok(ui.includes("startup.mark('memory_ready');startup.mark('continuity_ready')"));
 assert.ok(ui.includes("startup.mark('ui_shell_ready')"));
 assert.ok(ui.includes("startup.mark('composer_interactive')"));
 assert.ok(ui.includes("startup.mark('recent_conversation_rendered')"));
 assert.ok(ui.includes("startup.mark('voice_ready')"));
 assert.ok(ui.includes("startup.mark('usage_ready')"));
});

test('the saved state is opened off the main thread and JS waits for it',()=>{
 assert.ok(main.includes('io.execute(this::warmStore)'),'the store is warmed on the IO thread');
 const onCreate=main.slice(main.indexOf('public void onCreate(Bundle saved)'),main.indexOf('private WebResourceResponse response'));
 assert.ok(onCreate.indexOf('io.execute(this::warmStore)')<onCreate.indexOf('web.loadUrl('),'warming starts before loadUrl');
 assert.ok(main.includes('storeReady.await('),'read() waits for the warm-up instead of failing');
 assert.ok(main.includes('private StateStore readyStore()'));
 assert.ok(main.includes('storeFailure'));
 assert.match(main,/warmStore\(\)\{[\s\S]*?storeReady\.countDown\(\)/);
});

test('startup marks are debug-only',()=>{
 assert.ok(main.includes('FLAG_DEBUGGABLE'),'the native trace is gated on a debuggable build');
 assert.match(main,/void startupMark\(String name\)\{\s*if\(!startupLog/);
 assert.ok(main.includes('public void debugMark(String name)'));
 assert.match(main,/composer_interactive"\.equals\(name\)\)android\.util\.Log\.i\(STARTUP_TAG,"STARTUP_LATENCY timeToUsableChat "/,'the native trace reports time to usable chat');
 assert.ok(main.includes('"JS "+message.message()'),'debug builds mirror the JS timeline into logcat');
 assert.ok(ui.includes("enabled:Boolean(host?.debugToolsEnabled?.())"),'JS marks are gated on the debug host too');
 assert.ok(!/fetch\(|XMLHttpRequest|WebSocket|navigator\.sendBeacon/.test(readFileSync(new URL('../app/src/main/assets/startup.js',import.meta.url),'utf8')),'startup marks never leave the device');
});

test('the trace reports elapsed time from process start, then clears',()=>{
 let now=1000;const t=createStartupTrace({clock:()=>now});
 t.mark('process_start');
 now=1050;t.mark('composer_interactive');
 const lines=t.flush();
 assert.ok(lines.some(line=>line==='STARTUP_MARK composer_interactive 50ms'));
 assert.deepEqual(t.lines(),[],'flush clears the trace');
});
