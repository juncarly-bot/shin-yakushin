/**
 * Sentence-level voice chunking.
 *
 * Speaking starts after the first useful sentence is synthesized instead of
 * waiting for the whole reply. Order is preserved and the queue stays bounded;
 * the native controller still owns playback and cancellation.
 */
const MAX_CHUNK=500, BOUND=8, MIN_LENGTH=6;

function hardSplit(piece){
 const parts=[];
 for(let index=0;index<piece.length;index+=MAX_CHUNK)parts.push(piece.slice(index,index+MAX_CHUNK));
 return parts;
}

/** Splits a reply into up to `max` ordered speech chunks (never empty strings). */
export function sentenceChunks(text,max=BOUND){
 const clean=String(text??'').replace(/\s+/g,' ').trim();
 if(!clean)return [];
 // Split after Japanese sentence enders, but never inside 「」『』（）.
 const pieces=clean.split(/(?<=[。．！!？?])(?![」』）)\]】])/).map(x=>x.trim()).filter(Boolean);
 const merged=[];
 for(const raw of pieces.map(x=>x.trim()).filter(Boolean)){
  const last=merged.at(-1);
  if(last&&last.length<MIN_LENGTH)merged[merged.length-1]=last+raw;
  else merged.push(raw);
 }
 const bounded=merged.flatMap(hardSplit);
 const limit=Math.max(1,Math.min(BOUND,Number.isInteger(max)&&max>0?max:BOUND));
 if(bounded.length<=limit)return bounded;
 return [...bounded.slice(0,limit-1),bounded.slice(limit-1).join('')].flatMap(hardSplit).slice(0,limit);
}

/** Expands ordered companion messages into a single bounded speech queue. */
export function speechQueue(messages,max=BOUND){
 const queue=[];
 for(const message of messages??[]){
  for(const text of sentenceChunks(message?.text,max)){
   if(queue.length>=max)return queue;
   queue.push({speaker:message.speaker,text});
  }
 }
 return queue;
}
