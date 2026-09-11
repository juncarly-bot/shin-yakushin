import test from 'node:test';import assert from 'node:assert/strict';
import {sentenceChunks,speechQueue} from '../app/src/main/assets/voice-chunks.js';

test('a multi-sentence reply becomes ordered sentence chunks',()=>{
 const chunks=sentenceChunks('うん、それで合ってるよ。今日はかなり進んだね。次は2章の続きをやってみよっか。');
 assert.deepEqual(chunks,['うん、それで合ってるよ。','今日はかなり進んだね。','次は2章の続きをやってみよっか。']);
});

test('tiny punctuation fragments are merged instead of spoken alone',()=>{
 const chunks=sentenceChunks('あ。い。うん、ここから本題。');
 assert.equal(chunks.length,1);
 assert.ok(chunks.every(c=>c.length>1));
});

test('empty or whitespace input produces no speech',()=>{
 assert.deepEqual(sentenceChunks(''),[]);assert.deepEqual(sentenceChunks('   \n '),[]);assert.deepEqual(sentenceChunks(null),[]);
});

test('chunk count and per-chunk length stay inside the native queue bound',()=>{
 const long=Array.from({length:40},(_,i)=>`これは${i}番目の文です。`).join('');
 const chunks=sentenceChunks(long);
 assert.ok(chunks.length<=8,`chunks=${chunks.length}`);
 assert.ok(chunks.every(c=>c.length<=500));
 assert.ok(chunks.every(c=>c.trim().length>0));
});

test('a single over-long sentence is split rather than dropped',()=>{
 const chunks=sentenceChunks('あ'.repeat(1200));
 assert.ok(chunks.length>=3);assert.ok(chunks.every(c=>c.length<=500));assert.equal(chunks.join('').length,1200);
});

test('the speech queue keeps companion order and the bound',()=>{
 const messages=[{speaker:'SAYO',text:'まずは最初のことを話すよ。それから次のことも話すね。'},{speaker:'NurseT',text:'こちらからも一つだけ補足します。'}];
 assert.deepEqual(speechQueue(messages).map(x=>x.speaker),['SAYO','SAYO','NurseT']);
 assert.ok(speechQueue(messages,2).length<=2);
 assert.ok(speechQueue(messages,2).every(x=>x.text.length>0));
});
