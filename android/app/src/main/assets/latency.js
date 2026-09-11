/**
 * Local-only conversation/voice latency instrumentation.
 *
 * Debug builds can render these lines on-device; nothing is ever sent anywhere.
 * `clock` is injectable so tests can assert ordering without sleeping.
 */
export const LatencyMarks=Object.freeze([
 'user_submit_at',
 'user_bubble_rendered_at',
 'reply_plan_created_at',
 'remote_request_started_at',
 'remote_first_response_at',
 'remote_response_completed_at',
 'assistant_text_rendered_at',
 'voice_request_at',
 'voice_prewarm_started_at',
 'voice_prewarm_completed_at',
 'voice_synthesis_started_at',
 'voice_first_chunk_ready_at',
 'voice_playback_started_at',
 'voice_playback_completed_at'
]);

const KNOWN=new Set(LatencyMarks);
const ms=value=>`${Math.max(0,Math.round(value))}ms`;

export function createLatencyTracker({enabled=false,clock=()=>Date.now(),sink=()=>{}}={}){
 const marks=new Map();
 const record=(name,at=clock())=>{if(!enabled)return null;if(!KNOWN.has(name))throw Error('unknown latency mark: '+name);marks.set(name,at);return at};
 const recordOnce=(name,at=clock())=>{if(!enabled)return null;if(!KNOWN.has(name))throw Error('unknown latency mark: '+name);if(!marks.has(name))marks.set(name,at);return marks.get(name)};
 const delta=(from,to)=>{const a=marks.get(from),b=marks.get(to);return a===undefined||b===undefined?null:b-a};
 const lines=()=>{
  const out=[];
  const push=(prefix,label,from,to)=>{const value=delta(from,to);if(value!==null)out.push(`${prefix} ${label}=${ms(value)}`)};
  push('CONVERSATION_LATENCY','userBubble','user_submit_at','user_bubble_rendered_at');
  push('CONVERSATION_LATENCY','plan','user_submit_at','reply_plan_created_at');
  push('CONVERSATION_LATENCY','remoteFirstByte','remote_request_started_at','remote_first_response_at');
  push('CONVERSATION_LATENCY','remote','remote_request_started_at','remote_response_completed_at');
  push('CONVERSATION_LATENCY','assistantText','user_submit_at','assistant_text_rendered_at');
  push('VOICE_LATENCY','prewarm','voice_prewarm_started_at','voice_prewarm_completed_at');
  push('VOICE_LATENCY','firstChunk','voice_synthesis_started_at','voice_first_chunk_ready_at');
  push('VOICE_LATENCY','playbackStart','assistant_text_rendered_at','voice_playback_started_at');
  push('VOICE_LATENCY','submitToAudio','user_submit_at','voice_playback_started_at');
  push('VOICE_LATENCY','playback','voice_playback_started_at','voice_playback_completed_at');
  return out;
 };
 return {
  get enabled(){return enabled},
  mark:record,
  markIfEnabled:record,
  markOnce:recordOnce,
  has:name=>marks.has(name),
  delta,
  lines,
  /** Emits every available line once, then clears the marks so turns do not duplicate. */
  flush(){const all=lines();for(const line of all)sink(line);marks.clear();return all},
  reset(){marks.clear()}
 };
}
