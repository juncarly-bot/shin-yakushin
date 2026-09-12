/**
 * Separated companion memory.
 *
 * SharedMemory   facts both companions mutually know
 * SayoMemory     SAYO's own impressions/interpretations
 * TTMemory       NurseT's own impressions/interpretations
 *
 * Character memory may interpret but never invent authoritative facts. Every
 * record can carry an `authority` reference; if the referenced real state no
 * longer holds, the interpretation is dropped and real state still wins.
 */
export const MemoryOwner=Object.freeze({SHARED:'SHARED',SAYO:'SAYO',NurseT:'NurseT'});
export const MAX_SHARED=120,MAX_CHARACTER=120;
export const MEMORY_KINDS=Object.freeze(['FACT','SESSION','MATERIAL','GOAL','COMMITMENT','THREAD','PATTERN']);

const clip=(x,n)=>String(x??'').trim().slice(0,n);
const find=(s,kind,id)=>(s[kind]??[]).find(x=>x.id===id);

/** Does the authoritative state still support this interpretation? */
export function verifyAuthority(s,ref){
 if(!ref)return true;
 if(ref.kind==='session')return s.sessions.some(x=>x.sessionId===ref.id&&x.endTimestamp!==null);
 if(ref.kind==='material'){const m=find(s,'materials',ref.id);return Boolean(m&&!m.archived&&(ref.minProgress===undefined||m.progress>=ref.minProgress))}
 if(ref.kind==='goal'){const g=find(s,'goals',ref.id);return Boolean(g&&!g.archived&&(ref.done===undefined||g.done===ref.done))}
 if(ref.kind==='commitment')return (s.commitments??[]).some(x=>x.commitmentId===ref.id&&(ref.status===undefined||x.status===ref.status));
 return true;
}

export function addShared(s,fields,now){
 s.sharedMemories??=[];
 const text=clip(fields.text,200);if(!text)return null;
 const id=clip(fields.id,120)||`shared:${fields.kind??'FACT'}:${text.slice(0,40)}:${now}`;
 if(s.sharedMemories.some(m=>m.id===id))return null;
 const record={id,kind:MEMORY_KINDS.includes(fields.kind)?fields.kind:'FACT',text,timestamp:fields.timestamp??now,
  importance:Number.isFinite(fields.importance)?fields.importance:3,relatedId:fields.relatedId??null,authority:fields.authority??null};
 s.sharedMemories=[...s.sharedMemories,record].slice(-MAX_SHARED);
 return record;
}

export function addCharacterMemory(s,who,fields,now){
 if(who!=='SAYO'&&who!=='NurseT')return null;
 s.characterMemories??={SAYO:[],NurseT:[]};
 const text=clip(fields.text,200);if(!text)return null;
 const list=s.characterMemories[who]??[];
 const id=clip(fields.id,120)||`${who}:${fields.relatedId??text.slice(0,30)}:${now}`;
 if(list.some(m=>m.id===id))return null;
 const record={id,text,timestamp:fields.timestamp??now,importance:Number.isFinite(fields.importance)?fields.importance:3,
  relatedId:fields.relatedId??null,authority:fields.authority??null};
 s.characterMemories[who]=[...list,record].slice(-MAX_CHARACTER);
 return record;
}

/** Interpretation text only when the authoritative reference still holds. */
export function interpretation(s,memory){
 if(!memory||!verifyAuthority(s,memory.authority))return null;
 return memory.text;
}

/**
 * CharacterMemoryRouter returns only a small relevant slice for one speaker.
 * It is deliberately bounded so no full memory/history ever leaves the device.
 */
export class CharacterMemoryRouter{
 route(s,{speaker='SAYO',topic='',relatedId=null,limit=2}={}){
  const relevant=m=>{
   if(!verifyAuthority(s,m.authority))return false;
   if(relatedId&&m.relatedId===relatedId)return true;
   if(topic&&String(m.text).includes(topic))return true;
   return !relatedId&&!topic;
  };
  const rank=(a,b)=>(b.importance??0)-(a.importance??0)||(b.timestamp??0)-(a.timestamp??0);
  const pick=list=>[...list].filter(relevant).sort(rank).slice(0,limit).map(m=>({id:m.id,text:m.text,kind:m.kind??'IMPRESSION',relatedId:m.relatedId??null}));
  return {speaker,shared:pick(s.sharedMemories??[]),own:pick((s.characterMemories??{})[speaker]??[])};
 }
}

/** Grounded memories after a real StudySession. Never invents facts. */
export function noteFinishedSession(s,session,now,{material=null}={}){
 if(!session||session.endTimestamp===null)return {shared:null,characters:[]};
 const segments=(session.segments??[]).filter(p=>p.kind==='study');
 const seconds=segments.reduce((total,p)=>total+Math.max(0,(p.end??session.endTimestamp)-p.start)/1000,0);
 const minutes=Math.floor(seconds/60);
 const title=clip(material?.title??session.title??'学習',60);
 const authority={kind:'session',id:session.sessionId};
 const shared=addShared(s,{kind:'SESSION',text:`${title}を${minutes}分取り組んだ`,relatedId:session.sessionId,authority,importance:3,timestamp:now},now);
 const characters=[];
 const sayo=addCharacterMemory(s,'SAYO',{text:segments.length>=2?'続けて取り組めていたね':'短くても戻ってきたね',relatedId:session.sessionId,authority,importance:2,timestamp:now},now);
 if(sayo)characters.push(sayo);
 const goalIsComplete=Boolean(material&&material.target>0&&material.progress>=material.target);
 const nurse=addCharacterMemory(s,'NurseT',{text:goalIsComplete?'記録上は目標に届いています':'次に続く記録が残りました',relatedId:session.sessionId,authority,importance:2,timestamp:now},now);
 if(nurse)characters.push(nurse);
 return {shared,characters};
}
