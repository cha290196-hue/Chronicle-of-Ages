/** Knowledge storage, legacy record reading and branch-local merging. */
import {validYear,tick} from './calendar.mjs';
import {sanitizePromptKnowledge} from './prompt-world.mjs';
const list=x=>Array.isArray(x)?x:[];
const text=x=>String(x??'').trim();
const clip=(v,n=550)=>text(v).slice(0,n);
const normalize=v=>text(v).toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu,'');
const key=v=>normalize(clip(v,180));
const valueKey=r=>text(r?.value).toLocaleLowerCase().replace(/\s+/g,' ');
const unitKey=v=>text(v).toLocaleLowerCase().replace(/\s+/g,'');
const isObject=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const allowedKinds=new Set(['person','place','institution','politics','economy','society','culture','science','technology','environment','military','demography','law','daily_life','other']);
const attrKey=r=>{const base=(key(r?.entity)&&key(r?.attribute))?`${key(r.entity)}::${key(r.attribute)}`:key(r?.exclusiveKey);return base&&r?.quantity?base+'::'+normalize(r.quantity.metric)+'::'+unitKey(r.quantity.unit)+'::'+unitKey(r.quantity.period):base};
const period=r=>[validYear(r.firstYear)?tick(r.firstYear):null,validYear(r.validUntil)?tick(r.validUntil):validYear(r.firstYear)?tick(r.firstYear):null];
const overlap=(a,b)=>{const [as,ae]=period(a),[bs,be]=period(b);return as!==null&&bs!==null&&as<=be&&bs<=ae};
const equivalent=(a,b)=>{
 const ka=attrKey(a),kb=attrKey(b);
 if(ka&&kb)return ka===kb&&valueKey(a)===valueKey(b)&&overlap(a,b);
 return (a.firstYear??a.year)===(b.firstYear??b.year)&&((key(a.nameEn)&&key(a.nameEn)===key(b.nameEn||b.en))||(key(a.nameZh)&&key(a.nameZh)===key(b.nameZh||b.zh)))&&(!a.value||!b.value||valueKey(a)===valueKey(b));
};
const opposite=(a,b)=>{const ka=attrKey(a);return !!ka&&ka===attrKey(b)&&overlap(a,b)&&valueKey(a)&&valueKey(b)&&valueKey(a)!==valueKey(b)};
export function normalizeQuantity(q){
 if(!isObject(q)||typeof q.amount!=='number'||!Number.isFinite(q.amount)||!text(q.unit)||!text(q.metric))return null;
 return {amount:q.amount,unit:text(q.unit),metric:text(q.metric),period:text(q.period)};
}
function calculation(x){
 if(!isObject(x)||!['product','sum','ratio'].includes(x.operation)||!list(x.inputs).length||list(x.inputs).some(id=>typeof id!=='string')||!Number.isFinite(x.scale??1)||!Number.isInteger(x.decimals??2)||(x.decimals??2)<0||(x.decimals??2)>10)return null;
 return {operation:x.operation,inputs:[...x.inputs],scale:x.scale??1,decimals:x.decimals??2};
}
function ranking(x){
 if(!isObject(x)||!text(x.metric)||!text(x.unit)||!validYear(x.year)||!text(x.coverage)||!list(x.entries).length)return null;
 const entries=x.entries.map(e=>({rank:e.rank,entity:text(e.entity),amount:e.amount,factId:clip(e.factId,100)}));
 const ascending=x.order==='ascending';
 if(new Set(entries.map(e=>e.factId)).size!==entries.length||entries.some((e,i)=>!e.entity||!e.factId||!Number.isFinite(e.amount)||e.rank!==(i&&e.amount===entries[i-1].amount?entries[i-1].rank:i+1)||i&&(ascending?e.amount<entries[i-1].amount:e.amount>entries[i-1].amount)))return null;
 return {metric:text(x.metric),label:text(x.label||x.metric),unit:text(x.unit),period:text(x.period),year:x.year,scope:text(x.scope||'global'),entityType:text(x.entityType||'other'),order:ascending?'ascending':'descending',coverage:text(x.coverage),entries};
}
export function sanitizeKnowledge(x){
 if(x?.source==='prompt-llm')return sanitizePromptKnowledge(x);
 if(!isObject(x)||typeof x.id!=='string'||!validYear(x.firstYear))return null;
 const nameEn=clip(x.nameEn||x.nameZh,210),nameZh=clip(x.nameZh||x.nameEn,210),end=validYear(x.validUntil)?x.validUntil:x.firstYear;
 if(!nameEn||!nameZh||tick(end)<tick(x.firstYear))return null;
 const quantity=x.quantity===undefined?undefined:normalizeQuantity(x.quantity),calc=x.calculation===undefined?undefined:calculation(x.calculation),table=x.ranking===undefined?undefined:ranking(x.ranking);
 if(quantity===null||calc===null||table===null)return null;
 return {id:clip(x.id,100),firstYear:x.firstYear,validUntil:end,nameEn,nameZh,
  descriptionEn:text(x.descriptionEn||x.descriptionZh),descriptionZh:text(x.descriptionZh||x.descriptionEn),kind:allowedKinds.has(x.kind)?x.kind:'other',
  entity:clip(x.entity,140),attribute:clip(x.attribute,180),value:quantity?JSON.stringify(quantity):text(x.value),exclusiveKey:clip(x.exclusiveKey,180),basis:text(x.basis),
  evidenceIds:list(x.evidenceIds).map(v=>clip(v,100)),assumptions:list(x.assumptions).map(text),certainty:x.certainty==='medium'?'medium':'low',origin:'derived',source:'core-exploration',
  status:x.commitment==='world-canon'?'established-in-world':'hypothesis',...(x.commitment==='world-canon'?{commitment:'world-canon'}:{}),
  ...(quantity?{quantity}:{}),...(calc?{calculation:calc}:{}),...(table?{ranking:table}:{}),
  ...(isObject(x.resolution)?{resolution:{version:1,question:text(x.resolution.question),defaults:list(x.resolution.defaults).map(text),method:text(x.resolution.method)}}:{}),
  discoveredAt:clip(x.discoveredAt,40),questionRef:clip(x.questionRef,100)};
}
export function mergeKnowledge(existing=[],incoming=[]){
 const out=list(existing).map(sanitizeKnowledge).filter(Boolean),stats={added:0,duplicates:0,conflicts:0,invalid:0};
 for(const raw of list(incoming)){
  const x=sanitizeKnowledge(raw);if(!x){stats.invalid++;continue;}
  if(x.source==='prompt-llm'){
   const index=out.findIndex(y=>y.id===x.id);if(index>=0){out[index]=x;stats.duplicates++}else{out.push(x);stats.added++}
   continue;
  }
  if(out.some(y=>equivalent(x,y))){stats.duplicates++;continue;}
  if(out.some(y=>opposite(x,y))){stats.conflicts++;continue;}
  out.push(x);stats.added++;
 }
 return {facts:out,stats};
}
