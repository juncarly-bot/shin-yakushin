import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');

test('provided avatar sheet is preserved and mapped only to SAYO and NurseT',()=>{
 const bytes=readFileSync(new URL('app/src/main/assets/avatar-sheet.png',root));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),'03034a4a769df7fe529d54ad4f561e4366d1cb785394596d886b8084b000287a');
 const ui=read('app/src/main/assets/ui.js'),css=read('app/src/main/assets/style.css');
 assert.match(ui,/avatar\('SAYO'/);assert.match(ui,/avatar\('NurseT'/);
 assert.match(css,/\.avatar-sayo \.avatar-photo/);assert.match(css,/\.avatar-nurse \.avatar-photo/);
 assert.doesNotMatch(ui,/avatar\('user'|avatar\('USER'/);
});

test('USER timeline branch has no avatar or reserved icon column',()=>{
 const ui=read('app/src/main/assets/ui.js');
 const start=ui.indexOf("if(m.speaker==='user')return"),end=ui.indexOf("return '<article class=\"message-row incoming\">",start);
 assert.ok(start>0&&end>start);const userBranch=ui.slice(start,end);
 assert.match(userBranch,/message outgoing/);assert.doesNotMatch(userBranch,/avatar|message-row/);
 const css=read('app/src/main/assets/style.css');assert.match(css,/\.outgoing\{margin-left:auto;margin-right:0\}/);
});

test('WebView serves the avatar image locally with image MIME type',()=>{
 const java=read('app/src/main/java/org/shinyakushin/study/next/MainActivity.java');
 assert.match(java,/\/avatar-sheet\.png/);assert.match(java,/endsWith\("\.png"\)\?"image\/png"/);
});
