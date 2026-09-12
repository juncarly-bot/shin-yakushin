/**
 * Causal dialogue composition.
 *
 * The second companion speaks *after* the first: their line is built from the
 * first companion's decision, not generated in parallel. This is the local,
 * deterministic implementation; the remote provider receives the same ordered
 * contract and must satisfy it too.
 */

const sayoBank={
 'wind-down':['じゃ今日は終わろー。','じゃ、今日はここまで。','今日はもう切り上げよっか。','ここまででいっか。'],
 'let-go':['ちょっと休もー。','一回休憩しよ。'],
 'enthuse':['おー、やる気あるね。','いいね、その勢い。'],
 'celebrate':['お、ちゃんとやったじゃん。','おつかれー。'],
 'recall':['今日も、ちゃんと積み上がってるね。'],
 'next-step':['じゃ次そこから見よー。','そこから続きやろ。'],
 'small-start':['15分だけやろー。','やるなら15分だけやろー。','小さく始めよっか。'],
 'greet':['お、今日は早いじゃん。','お、来たね。'],
 'chat':['うん。','そっか。','なるほどね。'],
 'sleep':['それはもう寝るやつじゃない？','今日は寝よ。'],
 'default':['うん。']
};
const nurseBank={
 'plan-next':['残りを今日終えるか、明日に明確に繰り越すか、決めておきましょう。','明日の開始位置だけ決めておきましょう。'],
 'feasibility-check':['90分を2回に分ける方が現実的だと思います。','一度に詰め込むより、区切りを入れた方が続きます。'],
 'agree-and-plan':['開始位置だけ決めておきませんか？'],
 'structured-review':['数字は正直なので、並べて見ましょう。'],
 'observe':['記録を見る限り、無理のない範囲です。'],
 'suggest-break':['一度休憩してからでも遅くありません。'],
 'acknowledge':['予定の時間は達成しています。'],
 'default':['記録に残しておきます。']
};
/** SAYO's reaction banks are keyed by what the other companion just decided. */
const sayoReact={
 'plan-next':['それならあり。どこからやる？','それならあり。'],
 'agree-and-plan':['それならあり。どこからやる？','それならあり。'],
 'feasibility-check':['あっ。','あ、そっか。'],
 'breath':['うん、そうしよ。'],
 'default':['たしかに。','なるほどね。']
};
const nurseReact={
 agreeAdd:['私も賛成です。ただ、{add}','いいと思います。{add}'],
 feasibility:['{duration}を一度に、ですか？','{duration}を一度に、ですか？'],
 disagree:['たしかに。ただ、{add}']
};

/** Deterministic bounded variation — least-recently-used template, never random. */
export function pick(s,key,list,now){
 const history=s.dialogueHistory??(s.dialogueHistory={});
 let best=null;
 list.forEach((text,index)=>{
  const id=`dlg:${key}:${index}`,count=history[id]?.count??0,last=history[id]?.last??0;
  if(!best||count<best.count||(count===best.count&&last<best.last))best={text,id,count,last};
 });
 history[best.id]={count:best.count+1,last:now};
 return best.text;
}

function durationFrom(text){
 const hours=String(text??'').match(/(\d{1,2})\s*時間/);
 if(hours)return `${hours[1]}時間`;
 const minutes=String(text??'').match(/(\d{1,3})\s*分/);
 if(minutes)return `${minutes[1]}分`;
 return 'その時間';
}

/** A plain line for a companion with no preceding companion statement. */
export function phrase(s,id,decision,situation,now){
 const bank=id==='SAYO'?sayoBank:nurseBank;
 return pick(s,`${id}:${decision.stance}`,bank[decision.stance]??bank.default,now);
}

/**
 * A line written *in response* to the previous companion statement.
 * The reaction kind is derived from the pair of decisions, so the wording can
 * never drift away from what was actually said.
 */
export function reaction(s,id,own,prior,situation,now){
 if(id==='NurseT'){
  const priorKind=prior.recommendation.kind,ownKind=own.recommendation.kind;
  if(ownKind===priorKind||own.stance==='agree-and-plan'){
   const add=ownKind==='PLAN_NEXT'?'明日の開始位置だけ決めませんか？':'区切りを入れておきましょう。';
   return pick(s,`NurseT:react:agree:${priorKind}`,nurseReact.agreeAdd.map(line=>line.replace('{add}',add)),now);
  }
  if(situation.planning||priorKind==='START'||priorKind==='CONTINUE'){
   const duration=durationFrom(situation.text);
   return pick(s,`NurseT:react:feasibility`,nurseReact.feasibility.map(line=>line.replace('{duration}',duration)),now);
  }
  const add=ownKind==='PLAN_NEXT'?'明日の開始位置を決めておきましょう。':'少し区切ってからにしましょう。';
  return pick(s,`NurseT:react:disagree:${priorKind}`,nurseReact.disagree.map(line=>line.replace('{add}',add)),now);
 }
 const priorKind=prior.recommendation.kind;
 const key=sayoReact[prior.stance]?prior.stance:sayoReact[priorKind]?priorKind:priorKind==='START'?'breath':'default';
 return pick(s,`SAYO:react:${key}`,sayoReact[key],now);
}

/**
 * Turn a plan + decisions into an ordered, causal set of companion messages.
 * Each message after the first is composed with the previous message known.
 */
export function composeDialogue(s,{order=[],situation,decisions,now,lead=null,relationship=null}){
 const messages=[];
 for(const [index,id] of order.entries()){
  const own=decisions[id];
  const useLead=index===0&&lead&&lead.speaker===id&&lead.text;
  const text=useLead?lead.text:index===0?phrase(s,id,own,situation,now):reaction(s,id,own,decisions[order[index-1]],situation,now);
  messages.push({speaker:id,text,emotion:own.emotion,stance:own.stance,recommendation:own.recommendation});
 }
 return messages;
}
