/** Optional settings repair operates on a copy; core schema validation remains strict. */
const object=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:{};
const number=(x,fallback,min=0,max=1440)=>typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max?x:fallback;
const mode=x=>['NORMAL','HOLIDAY','FOCUS','UNLIMITED'].includes(x)?x:'NORMAL';
export function compatibleLifeBalance(input,{preserveMissing=false}={}){
 const src=object(input),out=structuredClone(src),budgets=object(src.budgetMinutes);
 out.dailyMode=mode(src.dailyMode);out.defaultMode=mode(src.defaultMode);
 out.budgetMinutes={...budgets,NORMAL:number(budgets.NORMAL,90),HOLIDAY:number(budgets.HOLIDAY,180),FOCUS:number(budgets.FOCUS,60)};
 out.interventionLevel=['GENTLE','NORMAL','STRICT'].includes(src.interventionLevel)?src.interventionLevel:'NORMAL';
 out.cooldownMinutes=number(src.cooldownMinutes,120,15);out.studyGoalMinutes=number(src.studyGoalMinutes,0);
 // A corrupt preference must never silently opt the user into notifications.
 out.usageNotifications=typeof src.usageNotifications==='boolean'?src.usageNotifications:false;
 out.usageInConversation=typeof src.usageInConversation==='boolean'?src.usageInConversation:false;
 const cats=object(src.appCategories);out.appCategories=Object.fromEntries(Object.entries(cats).filter(([p])=>p.length>0&&p.length<=255&&!['__proto__','constructor','prototype'].includes(p)).map(([p,c])=>[p,['ENTERTAINMENT','STUDY','NEUTRAL'].includes(c)?c:'NEUTRAL']));
 if(preserveMissing)for(const key of Object.keys(out))if(!(key in src))delete out[key];
 return out;
}
