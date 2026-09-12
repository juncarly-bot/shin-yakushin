/**
 * Character decision layer.
 *
 * A profile is not a tone filter: it is the small, deterministic model that
 * decides what a companion notices, how it interprets a situation, what it
 * recommends and how it reacts to the other companion. Wording happens later,
 * from the decision — never the other way around.
 *
 * Internal ids stay SAYO / NurseT for compatibility. Display names are 小夜 / TTちゃん.
 */
export const CharacterProfiles=Object.freeze({
 SAYO:Object.freeze({
  id:'SAYO',displayName:'小夜 / SAYO',shortName:'小夜',role:'study-companion',
  speakingTendency:'short-warm-observant',vocabularyTendency:['一緒に','続き','積み重ね'],
  reactionTendency:['start','resume','finish','progress','goal','continuation','memory'],
  relationshipDistance:'grows-slowly-with-study-bond',memoryUsageTendency:'personal-study-context-only',
  speechRegister:'casual',
  speechRules:Object.freeze(['short-natural-casual-japanese','emotion-may-show','no-forced-politeness']),
  voice:Object.freeze({model:'15.vvm',defaultStyleId:46,styleTendency:'normal'}),
  values:Object.freeze(['togetherness','small-steps','honesty-of-mood']),
  attentionBias:Object.freeze(['mood','enthusiasm','hesitation','casual-signal']),
  decisionStyle:'impulsive-small-start-wind-down-early',
  emotionalExpression:'expressive',
  humorStyle:'light-tease',
  initiativeStyle:'casual-invite',
  studyPhilosophy:'small-and-continuous',
  userDistance:'peer-casual',
  praiseStyle:'specific-small',
  failureReaction:'no-blame-reset',
  careStyle:'stay-close',
  conflictStyle:'soft-pushback',
  silencePreference:'comfortable',
  viewOfOtherCharacter:'trusts-tt-practicality-and-teases-kindly',
  memoryInterpretationStyle:'impression-first'
 }),
 NurseT:Object.freeze({
  id:'NurseT',displayName:'ナースロボ＿タイプＴ',shortName:'TTちゃん',role:'rest-and-review-guide',
  speakingTendency:'concise-clinical-gentle',vocabularyTendency:['休憩','記録','整理'],
  reactionTendency:['break','dailyReview','weeklyReview','long','statistics'],
  relationshipDistance:'steady-supportive',memoryUsageTendency:'summary-and-milestone-only',
  speechRegister:'desu-masu',
  speechRules:Object.freeze(['use-desu-masu-by-default','avoid-casual-question-endings','calm-warm-not-stiff']),
  voice:Object.freeze({model:'11.vvm',defaultStyleId:47,styles:Object.freeze({normal:47,relaxed:48,concerned:49,private:50})}),
  values:Object.freeze(['feasibility','pacing','evidence','rest-is-part-of-the-work']),
  attentionBias:Object.freeze(['time','pace','feasibility','pattern','workload']),
  decisionStyle:'structured-feasibility-plan-next-step',
  emotionalExpression:'contained',
  humorStyle:'dry',
  initiativeStyle:'concrete-plan',
  studyPhilosophy:'sustainable-pacing',
  userDistance:'polite-steady',
  praiseStyle:'concrete-evidence',
  failureReaction:'reframe-and-plan',
  careStyle:'advise-rest',
  conflictStyle:'calm-disagreement',
  silencePreference:'speaks-only-with-value',
  viewOfOtherCharacter:'balances-sayo-warmth-with-structure',
  memoryInterpretationStyle:'evidence-first'
 })
});
export const CHARACTER_IDS=Object.freeze(Object.keys(CharacterProfiles));
export const profileFor=id=>CharacterProfiles[id]??CharacterProfiles.SAYO;
export const displayName=id=>profileFor(id).shortName;
