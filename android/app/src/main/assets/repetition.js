/**
 * Bounded RepetitionGuard.
 *
 * Repetition is a *structure* problem, not a vocabulary problem. This guard
 * tracks the recent interaction structure (mode + speaker order + question vs
 * observation + CTA) from persisted messages and, when the exact same structure
 * would repeat, chooses a structurally different one. Deterministic: it only
 * reads the persisted tail, never random.
 */
export const STRUCTURE_LIMIT=8;

export function structureKey({mode='CASUAL',order=[],question=false,cta=false}){
 return `${mode}|${order.join('>')}|${question?'q':'s'}|${cta?'cta':'nocta'}`;
}

/** Recent companion structures, oldest first, bounded. */
export function recentStructures(s,limit=STRUCTURE_LIMIT){
 const messages=s?.messages??[];
 const out=[];
 for(const m of messages){
  if(m.speaker!=='SAYO'&&m.speaker!=='NurseT')continue;
  if(!m.structure)continue;
  out.push({id:m.id,speaker:m.speaker,structure:m.structure,at:m.at});
 }
 return out.slice(-limit);
}

function alternativeOrder(order){
 if(order.length>=3)return order.slice(0,2);
 if(order.length===2)return [order[0]];
 const other=order[0]==='SAYO'?'NurseT':'SAYO';
 return [order[0],other];
}

/**
 * Adjust a candidate structure so the same shape does not repeat immediately.
 * Returns {order,mode,question,cta,adjusted,reason}.
 */
export function guardStructure(s,candidate,recent=recentStructures(s)){
 const base={mode:'CASUAL',order:[],question:false,cta:false,...candidate};
 const key=structureKey(base),last=recent.at(-1);
 if(!last||last.structure!==key)return {...base,key,adjusted:false,reason:null};
 if(base.question)return {...base,question:false,key:structureKey({...base,question:false}),adjusted:true,reason:'observation-instead-of-question'};
 if(base.cta)return {...base,cta:false,key:structureKey({...base,cta:false}),adjusted:true,reason:'no-cta-this-time'};
 const order=alternativeOrder(base.order);
 const next={...base,order,key:structureKey({...base,order})};
 return {...next,adjusted:true,reason:'changed-speaker-sequence'};
}
