import test from 'node:test';import {spawnSync} from 'node:child_process';import {mkdtempSync,rmSync,existsSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {fileURLToPath} from 'node:url';import assert from 'node:assert/strict';
const java=process.env.JAVA_HOME?join(process.env.JAVA_HOME,'bin/java'):existsSync('/usr/lib/jvm/java-17-openjdk-amd64/bin/java')?'/usr/lib/jvm/java-17-openjdk-amd64/bin/java':'java';
test('native coaching policy executes the shared fixtures and the real usage example',()=>{
 const root=fileURLToPath(new URL('../',import.meta.url));
 const dir=mkdtempSync(join(tmpdir(),'study-coaching-'));
 try{
  const sources=['app/src/main/java/org/shinyakushin/study/next/CoachingPolicy.java','app/src/main/java/org/shinyakushin/study/next/UsageIntervals.java','app/src/main/java/org/shinyakushin/study/next/AppUsageCategory.java','tests/CoachingPolicyTest.java'];
  const compile=spawnSync(java,['-m','jdk.compiler/com.sun.tools.javac.Main','-d',dir,...sources.map(x=>join(root,x))],{encoding:'utf8'});
  assert.equal(compile.status,0,compile.stderr);
  const run=spawnSync(java,['-cp',dir,'CoachingPolicyTest'],{encoding:'utf8',cwd:root});
  assert.equal(run.status,0,run.stderr);assert.match(run.stdout,/CoachingPolicy: 10 fixtures/);
 } finally {rmSync(dir,{recursive:true,force:true})}
});
