/**
 * Relationship behaviour.
 *
 * Bond/relationship stays authoritative in domain.js. This module only turns
 * that authoritative progress into *behaviour*: language distance, teasing,
 * shorthand, directness and willingness to disagree. Progression is gradual —
 * one session can never jump several stages.
 */
export const RelationshipStage=Object.freeze(['new','acquainted','familiar','close']);

const HOUR=3600; // seconds: metrics().seconds is authoritative study seconds
/** Derived only from authoritative metrics; no separate bond state. */
export function relationshipStage(m){
 const days=Number(m?.studyDays??0),seconds=Number(m?.seconds??0);
 if(days>=21)return 'close';
 if(days>=7)return 'familiar';
 if(days>=2||seconds>=2*HOUR)return 'acquainted';
 return 'new';
}

const VOICE={
 new:{directness:0,teasing:0,shorthand:0,explanationLength:2,canDisagree:0,banter:0},
 acquainted:{directness:1,teasing:0,shorthand:1,explanationLength:1,canDisagree:1,banter:0},
 familiar:{directness:1,teasing:1,shorthand:1,explanationLength:1,canDisagree:1,banter:1},
 close:{directness:2,teasing:1,shorthand:2,explanationLength:1,canDisagree:2,banter:2}
};
export function relationshipVoice(stage){return VOICE[stage]??VOICE.new}

/** Familiarity changes how a known material is referenced — gradually. */
export function referenceLine(stage,title){
 const name=String(title??'').slice(0,40);
 if(!name)return '';
 if(stage==='close')return `結局${name}に戻ってくるんですよね。`;
 if(stage==='familiar')return `また${name}ですね。`;
 if(stage==='acquainted')return `${name}、前にも進めていましたね。`;
 return `以前${name}を勉強していましたね。`;
}
/** How much a companion explains, by stage. */
 export function explanationBudget(stage){return (VOICE[stage]??VOICE.new).explanationLength}
