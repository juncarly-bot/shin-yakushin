const allowedEmotions=new Set(['calm','pleased','focused','concerned','relaxed','proud','tired_context']);
const speakers=['SAYO','NurseT'];

/**
 * The local ConversationPlan owns who may speak and in what order. The remote
 * model may phrase content but can never add a speaker or exceed the bound.
 */
export function validateTurn(value,plan){
 const order=(plan?.order??['SAYO']).filter(x=>speakers.includes(x));
 if(!order.length)throw Error('invalid conversation plan');
 const max=Math.max(1,Math.min(3,plan?.maxMessages??order.length));
 const raw=Array.isArray(value?.messages)?value.messages:[];
 if(raw.length){
  if(raw.length>max)throw Error('invalid remote response');
  return raw.map((message,index)=>{
   const speaker=String(message?.speaker??'');
   if(!order.includes(speaker))throw Error('invalid remote speaker');
   if(speaker!==order[index])throw Error('invalid remote speaker order');
   const text=String(message?.text??'').trim().slice(0,800);
   if(!text)throw Error('invalid remote response');
   return {speaker,text,emotion:allowedEmotions.has(message.emotion)?message.emotion:'calm'};
  });
 }
 const text=String(value?.text??'').trim().slice(0,800);
 if(!text)throw Error('invalid remote response');
 return [{speaker:order[0],text,emotion:allowedEmotions.has(value?.emotion)?value.emotion:'calm'}];
}

/** Promise adapter around the native HTTPS backend bridge. No API key is accepted by this provider. */
export class RemoteAIProvider {
 constructor(host,timeoutMs=75000){this.host=host;this.timeoutMs=timeoutMs;this.pending=new Map();window.platformRemoteAIResult=(id,raw)=>this.resolve(id,raw);window.platformRemoteAIError=id=>this.reject(id)}
 available(){try{return Boolean(this.host?.remoteAIAvailable?.())}catch{return false}}
 generate(context,signal){
  if(!this.available())return Promise.reject(Error('remote unavailable'));
  const requestId=crypto.randomUUID(),raw=JSON.stringify(context),plan=context?.turn??null;
  if(new TextEncoder().encode(raw).length>64*1024)return Promise.reject(Error('remote context too large'));
  return new Promise((resolve,reject)=>{
   const finish=error=>{const item=this.pending.get(requestId);if(!item)return;clearTimeout(item.timer);this.pending.delete(requestId);error?reject(error):null};
   const timer=setTimeout(()=>finish(Error('remote timeout')),this.timeoutMs);
   this.pending.set(requestId,{resolve,reject,finish,timer,plan});
   if(signal){if(signal.aborted)return finish(Error('remote cancelled'));signal.addEventListener('abort',()=>finish(Error('remote cancelled')),{once:true})}
   try{this.host.requestRemoteAI(requestId,raw)}catch{finish(Error('remote unavailable'))}
  });
 }
 resolve(id,raw){const item=this.pending.get(id);if(!item)return;try{const value=JSON.parse(raw),messages=validateTurn(value,item.plan),event=String(value?.event??'conversation').slice(0,48),result={messages:messages.map(m=>({...m,event})),text:messages[0].text,emotion:messages[0].emotion,event};clearTimeout(item.timer);this.pending.delete(id);item.resolve(result)}catch(error){item.finish(error)}}
 reject(id){const item=this.pending.get(id);if(item)item.finish(Error('remote unavailable'))}
 cancel(){this.host?.cancelRemoteAI?.();for(const [id,item] of this.pending){item.finish(Error('remote cancelled'));this.pending.delete(id)}}
}

export function remoteRequest(state,userMessage,speaker,context,turn=null){
 const order=(turn?.order??[speaker]).filter(x=>speakers.includes(x));
 const conversationPlan={order:order.length?order:[speaker],allowedSpeakers:[...new Set(order.length?order:[speaker])],maxMessages:Math.min(3,order.length||1)};
 return {speaker,userMessage:String(userMessage??'').slice(0,600),turn:conversationPlan,context:{...context,conversation:context.conversation,characters:context.characters,request:{conversationDepth:state.conversation?.depth??'NORMAL',selectedSpeaker:speaker,conversationPlan}}};
}
