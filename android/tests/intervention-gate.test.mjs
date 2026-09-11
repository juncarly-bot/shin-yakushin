import test from 'node:test';import {spawnSync} from 'node:child_process';import {mkdtempSync,rmSync,existsSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {fileURLToPath} from 'node:url';import assert from 'node:assert/strict';
const java=process.env.JAVA_HOME?join(process.env.JAVA_HOME,'bin/java'):existsSync('/usr/lib/jvm/java-17-openjdk-amd64/bin/java')?'/usr/lib/jvm/java-17-openjdk-amd64/bin/java':'java';
test('intervention gate enforces permission, duplicate and cooldown rules',()=>{
 const root=fileURLToPath(new URL('../',import.meta.url));
 const dir=mkdtempSync(join(tmpdir(),'study-gate-'));
 try{
  const sources=['app/src/main/java/org/shinyakushin/study/next/CoachingPolicy.java','app/src/main/java/org/shinyakushin/study/next/InterventionGate.java','app/src/main/java/org/shinyakushin/study/next/InterventionCopy.java','tests/InterventionGateTest.java'];
  const compile=spawnSync(java,['-m','jdk.compiler/com.sun.tools.javac.Main','-d',dir,...sources.map(x=>join(root,x))],{encoding:'utf8'});
  assert.equal(compile.status,0,compile.stderr);
  const run=spawnSync(java,['-cp',dir,'InterventionGateTest'],{encoding:'utf8',cwd:root});
  assert.equal(run.status,0,run.stderr);assert.match(run.stdout,/InterventionGate: 13 assertions PASS/);
 } finally {rmSync(dir,{recursive:true,force:true})}
});
