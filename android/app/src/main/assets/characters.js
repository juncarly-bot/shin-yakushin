export const CharacterProfiles=Object.freeze({
 SAYO:Object.freeze({
  id:'SAYO',displayName:'小夜 / SAYO',role:'study-companion',
  speakingTendency:'short-warm-observant',vocabularyTendency:['一緒に','続き','積み重ね'],
  reactionTendency:['start','resume','finish','progress','goal','continuation','memory'],
  relationshipDistance:'grows-slowly-with-study-bond',memoryUsageTendency:'personal-study-context-only',
  voice:Object.freeze({model:'15.vvm',defaultStyleId:46,styleTendency:'normal'})
 }),
 NurseT:Object.freeze({
  id:'NurseT',displayName:'ナースロボ＿タイプＴ',role:'rest-and-review-guide',
  speakingTendency:'concise-clinical-gentle',vocabularyTendency:['休憩','記録','整理'],
  reactionTendency:['break','dailyReview','weeklyReview','long','statistics'],
  relationshipDistance:'steady-supportive',memoryUsageTendency:'summary-and-milestone-only',
  voice:Object.freeze({model:'11.vvm',defaultStyleId:47,styles:Object.freeze({normal:47,relaxed:48,concerned:49,private:50})})
 })
});
export const profileFor=id=>CharacterProfiles[id]??CharacterProfiles.SAYO;
