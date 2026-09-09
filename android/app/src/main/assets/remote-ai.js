const allowedEmotions=new Set(['calm','pleased','focused','concerned','relaxed','proud','tired_context']);

/** Promise adapter around the native HTTPS backend bridge. No API key is accepted by this provider. */
export class RemoteAIProvider {
 constructor(host,timeoutMs=15000){this.host=host;this.timeoutMs=timeoutMs;this.pending=new Map();window.platformRemoteAIResult=(id,raw)=>this.resolve(id,raw);window.platformRemoteAIError=id=>this.reject(id)}
 available(){try{return Boolean(this.host?.remoteAIAvailable?.())}catch{return false}}
 generate(context,signal){
  if(!this.available())return Promise.reject(Error('remote unavailable'));
  const requestId=crypto.randomUUID(),raw=JSON.stringify(context);
  if(new TextEncoder().encode(raw).length>64*1024)return Promise.reject(Error('remote context too large'));
  return new Promise((resolve,reject)=>{
   const finish=error=>{const item=this.pending.get(requestId);if(!item)return;clearTimeout(item.timer);this.pending.delete(requestId);error?reject(error):null};
   const timer=setTimeout(()=>finish(Error('remote timeout')),this.timeoutMs);
   this.pending.set(requestId,{resolve,reject,finish,timer});
   if(signal){if(signal.aborted)return finish(Error('remote cancelled'));signal.addEventListener('abort',()=>finish(Error('remote cancelled')),{once:true})}
   try{this.host.requestRemoteAI(requestId,raw)}catch{finish(Error('remote unavailable'))}
  });
 }
 resolve(id,raw){const item=this.pending.get(id);if(!item)return;try{const value=JSON.parse(raw),text=String(value?.text??'').trim().slice(0,800);if(!text)throw Error('invalid remote response');const result={text,emotion:allowedEmotions.has(value.emotion)?value.emotion:'calm',event:String(value.event??'conversation').slice(0,48)};clearTimeout(item.timer);this.pending.delete(id);item.resolve(result)}catch(error){item.finish(error)}}
 reject(id){const item=this.pending.get(id);if(item)item.finish(Error('remote unavailable'))}
 cancel(){for(const [id,item] of this.pending){item.finish(Error('remote cancelled'));this.pending.delete(id)}}
}

export function remoteRequest(state,userMessage,speaker,context){
 return {speaker,userMessage:String(userMessage??'').slice(0,600),context:{...context,conversation:context.conversation,characters:context.characters,request:{conversationDepth:state.conversation?.depth??'NORMAL',selectedSpeaker:speaker}}};
}

