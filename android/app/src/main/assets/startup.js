/**
 * Startup instrumentation and first-paint contract.
 *
 * The only metric that matters is TIME TO USABLE CHAT: the header, the recent
 * conversation and the composer must be reachable long before VOICE, Memory,
 * Usage or Continuity finish. Those subsystems are advisory — a slow or failing
 * one may never block or break the conversation.
 *
 * Marks are recorded locally and only reported while the host reports a debug
 * build; nothing here is ever sent to a server.
 */
export const StartupMarks=Object.freeze([
 'process_start','activity_create','webview_create','loadUrl_start',
 'store_ready','ui_shell_ready','recent_conversation_rendered','composer_interactive',
 'memory_ready','voice_ready','usage_ready','continuity_ready'
]);

/** Reaching these marks is what makes chat usable. Everything else is advisory. */
export const CRITICAL_MARKS=Object.freeze(['store_ready','ui_shell_ready','composer_interactive']);

const KNOWN=new Set(StartupMarks);
export const isStartupMark=name=>KNOWN.has(name);

/**
 * Boot has exactly two phases. `shell` is required for a usable conversation;
 * `heavy` is advisory, deferred and isolated so it can never block first paint.
 */
export const BOOT_PHASES=Object.freeze([
 Object.freeze({name:'shell',critical:true,steps:Object.freeze(['store_ready','ui_shell_ready','recent_conversation_rendered','composer_interactive'])}),
 Object.freeze({name:'heavy',critical:false,steps:Object.freeze(['memory_ready','voice_ready','usage_ready','continuity_ready'])})
]);
export const criticalStep=name=>BOOT_PHASES[0].steps.includes(name);

/**
 * Deterministic startup trace. `clock` is injectable so tests can assert the
 * order and the derived time-to-usable-chat without sleeping.
 */
export function createStartupTrace({enabled=true,clock=()=>Date.now(),emit=()=>{}}={}){
 const marks=new Map();
 const mark=name=>{
  if(!enabled)return null;
  if(!KNOWN.has(name))throw Error('unknown startup mark: '+name);
  if(marks.has(name))return marks.get(name);
  const at=clock();
  marks.set(name,at);
  try{emit(name,at)}catch{}
  return at;
 };
 const origin=()=>marks.has('process_start')?marks.get('process_start'):marks.has('loadUrl_start')?marks.get('loadUrl_start'):marks.get('store_ready');
 const timeToUsableChat=()=>{const start=origin(),usable=marks.get('composer_interactive');return start===undefined||usable===undefined?null:Math.max(0,usable-start)};
 const lines=()=>{
  const start=origin(),out=[];
  for(const name of StartupMarks){const at=marks.get(name);if(at===undefined)continue;out.push(`STARTUP_MARK ${name} ${start===undefined?0:Math.max(0,Math.round(at-start))}ms`)}
  const value=timeToUsableChat();
  if(value!==null)out.push(`STARTUP_LATENCY timeToUsableChat ${Math.round(value)}ms`);
  return out;
 };
 return {
  get enabled(){return enabled},
  mark,
  markOnce:mark,
  has:name=>marks.has(name),
  at:name=>marks.get(name)??null,
  /** True once every mark chat actually needs has been recorded. */
  ready:()=>CRITICAL_MARKS.every(name=>marks.has(name)),
  timeToUsableChat,
  lines,
  flush(){const all=lines();marks.clear();return all}
 };
}

/** Runs advisory work without letting it break the caller. */
export function safelyRun(run,onError=()=>{}){
 try{return run()}catch(error){try{onError(error)}catch{}return undefined}
}
