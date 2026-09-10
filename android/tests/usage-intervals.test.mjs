import test from 'node:test';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const javac=spawnSync('javac',['-version']);
test('production Java interval accounting executes boundary and category scenarios',{skip:!process.env.CI&&javac.error?'Local JDK compiler unavailable; required in CI':false},()=>{
 assert.equal(javac.status,0,'JDK compiler required');
 const root=fileURLToPath(new URL('../',import.meta.url));
 const dir=mkdtempSync(join(tmpdir(),'study-usage-'));
 try {
  const sources=['app/src/main/java/org/shinyakushin/study/next/UsageIntervals.java','app/src/main/java/org/shinyakushin/study/next/AppUsageCategory.java','tests/UsageIntervalsTest.java'];
  const compile=spawnSync('javac',['-d',dir,...sources.map(x=>join(root,x))],{encoding:'utf8'});
  assert.equal(compile.status,0,compile.stderr);
  const run=spawnSync('java',['-cp',dir,'UsageIntervalsTest'],{encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);assert.match(run.stdout,/PASS/);
 } finally {rmSync(dir,{recursive:true,force:true})}
});
