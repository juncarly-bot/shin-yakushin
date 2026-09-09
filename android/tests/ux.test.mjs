import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const ui=await readFile(new URL('../app/src/main/assets/ui.js',import.meta.url),'utf8');
const css=await readFile(new URL('../app/src/main/assets/style.css',import.meta.url),'utf8');

test('Home previous study and free study are single-tap actions',()=>{
  assert.match(ui,/data-study="\$\{p\.kind\}"[^>]*>続きを勉強<\/button>/);
  assert.match(ui,/data-action="start">自由学習<\/button>/);
});

test('finish progress offers bounded quick actions and optional skip',()=>{
  for(const label of ['+5','+10','入力','今は記録しない'])assert.ok(ui.includes(label),label);
  assert.match(ui,/Math\.min\(m\.target,m\.progress\+Number\(b\.dataset\.progressAdd\)\)/);
});

test('mobile controls retain 48px touch targets and narrow layout fallback',()=>{
  assert.match(css,/button\{min-height:48px/);
  assert.match(css,/@media\(max-width:360px\)\{\.quick-actions\{grid-template-columns:1fr\}\}/);
  assert.match(css,/dialog\{max-height:85dvh;overflow:auto\}/);
});
