/**
 * Incremental knowledge layer for one Earth worldline.
 * AI-generated facts are hypotheses local to their branch, not recorded history.
 * The gate checks structure, time, duplication, explicit conflicts and provenance;
 * it cannot prove speculative history.
 */
import {validYear,tick,LAST_YEAR} from './ucm-omega.mjs';

const list=x=>Array.isArray(x)?x:[];
const clip=(v,n=550)=>String(v??'').trim().slice(0,n);
const key=v=>clip(v,180).toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu,'');
const isObject=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const allowedKinds=new Set(['person','place','institution','politics','economy','society','culture','science','technology','environment','military','demography','law','daily_life','other']);
const attrKey=(r)=>key(r?.exclusiveKey)||((key(r?.entity)&&key(r?.attribute))?`${key(r.entity)}::${key(r.attribute)}`:'');
const period=(r)=>{
 const a=validYear(r.firstYear)?tick(r.firstYear):null;
 const b=validYear(r.validUntil)?tick(r.validUntil):a;
 return [a,b];
};
const overlap=(a,b)=>{const [as,ae]=period(a),[bs,be]=period(b);return as!==null&&bs!==null&&as<=be&&bs<=ae};
const equivalent=(a,b)=>{
 const ka=attrKey(a),kb=attrKey(b);
 if(ka&&kb&&ka===kb&&key(a.value)===key(b.value)&&overlap(a,b))return true;
 const ay=a.firstYear===b.firstYear;
 return ay&&(
 (key(a.nameEn)&&key(a.nameEn)===key(b.nameEn))||
 (key(a.nameZh)&&key(a.nameZh)===key(b.nameZh))
 )&&(!a.value||!b.value||key(a.value)===key(b.value));
};
const opposite=(a,b)=>{
 const ka=attrKey(a),kb=attrKey(b);
 return !!ka&&ka===kb&&overlap(a,b)&&key(a.value)&&key(b.value)&&key(a.value)!==key(b.value);
};
export function sanitizeKnowledge(x){
 if(!isObject(x)||typeof x.id!=='string'||!validYear(x.firstYear))return null;
 const nameEn=clip(x.nameEn||x.nameZh,210),nameZh=clip(x.nameZh||x.nameEn,210);
 if(!nameEn||!nameZh)return null;
 const end=validYear(x.validUntil)?x.validUntil:x.firstYear;
 if(tick(end)<tick(x.firstYear))return null;
 return {
  id:clip(x.id,100),firstYear:x.firstYear,validUntil:end,nameEn,nameZh,
  descriptionEn:clip(x.descriptionEn||x.descriptionZh,900),descriptionZh:clip(x.descriptionZh||x.descriptionEn,900),
  kind:allowedKinds.has(x.kind)?x.kind:'other',
  entity:clip(x.entity,140),attribute:clip(x.attribute,100),value:clip(x.value,300),
  exclusiveKey:clip(x.exclusiveKey,180),basis:clip(x.basis,420),
  evidenceIds:list(x.evidenceIds).slice(0,8).map(v=>clip(v,100)),
  assumptions:list(x.assumptions).slice(0,5).map(v=>clip(v,150)),
  certainty:x.certainty==='medium'?'medium':'low',
  origin:'derived',source:'core-exploration',status:'hypothesis',
  discoveredAt:clip(x.discoveredAt,40),questionRef:clip(x.questionRef,100)
 };
}
export function auditKnowledge({candidates=[],existing=[],events=[],makeId,questionRef='',limit=14}={}){
 if(typeof makeId!=='function')throw new TypeError('KNOWLEDGE_ID_FACTORY_REQUIRED');
 const accepted=[],rejected=[],duplicates=[];
 const known=list(existing);
 const allowedIds=new Set([...known,...list(events)].map(x=>String(x.id)));
 for(const [index,raw] of list(candidates).slice(0,Math.min(28,limit*2)).entries()){
  if(!isObject(raw)||raw?.relevant===false){rejected.push({index,reason:'IRRELEVANT'});continue}
  const firstYear=raw.firstYear,validUntil=raw.validUntil??firstYear;
  if(!validYear(firstYear)||!validYear(validUntil)||tick(validUntil)<tick(firstYear)){
   rejected.push({index,reason:'INVALID_INTERVAL'});continue
  }
  if(!clip(raw.nameEn||raw.nameZh,210)||!clip(raw.descriptionEn||raw.descriptionZh,900)){
   rejected.push({index,reason:'INSUFFICIENT_DETAIL'});continue
  }
  const refs=list(raw.evidenceIds).map(String);
  if(refs.some(x=>!allowedIds.has(x))){
   rejected.push({index,reason:'UNKNOWN_EVIDENCE'});continue
  }
  if(!refs.length&&!clip(raw.basis,420)){
   rejected.push({index,reason:'NO_CAUSAL_BASIS'});continue
  }
  const fact=sanitizeKnowledge({
   ...raw,id:String(makeId()),validUntil,questionRef,
   discoveredAt:new Date().toISOString()
  });
  if(!fact){rejected.push({index,reason:'BAD_CANDIDATE'});continue}
  if([...known,...accepted,...list(events)].some(e=>equivalent(fact,e))){
   duplicates.push({index,reason:'ALREADY_KNOWN'});continue
  }
  if([...known,...accepted].some(e=>opposite(fact,e))){
   rejected.push({index,reason:'CONFLICTS_WITH_WORLDLINE'});continue
  }
  accepted.push(fact);
  if(accepted.length>=limit)break;
 }
 return {accepted,rejected,duplicates,reviewed:Math.min(list(candidates).length,Math.min(28,limit*2))};
}
export function mergeKnowledge(existing=[],incoming=[]){
 const out=list(existing).map(sanitizeKnowledge).filter(Boolean),stats={added:0,duplicates:0,conflicts:0,invalid:0};
 for(const raw of list(incoming)){
  const x=sanitizeKnowledge(raw);if(!x){stats.invalid++;continue}
  if(out.some(y=>equivalent(x,y))){stats.duplicates++;continue}
  if(out.some(y=>opposite(x,y))){stats.conflicts++;continue}
  out.push(x);stats.added++;
 }
 return {facts:out,stats};
}
export function knowledgeForFork(parent,anchorYear){
 if(!validYear(anchorYear))throw new RangeError('INVALID_YEAR');
 return list(parent?.knowledge).filter(f=>validYear(f.firstYear)&&tick(f.firstYear)<tick(anchorYear)).map(sanitizeKnowledge).filter(Boolean);
}
export function summarizeKnowledge(records,query='',max=24){
 const q=key(query),words=clip(query,240).toLowerCase().match(/[a-z0-9]{3,}|[\u3400-\u9fff]{2,}/g)||[];
 return list(records).map(f=>({
  f,score:words.reduce((s,w)=>s+(JSON.stringify(f).toLowerCase().includes(w)?w.length:0),0)
   +(q&&key(f.nameEn).includes(q)?10:0)+(q&&key(f.nameZh).includes(q)?10:0)
 })).sort((a,b)=>b.score-a.score||tick(b.f.firstYear)-tick(a.f.firstYear)).slice(0,max).map(x=>x.f);
}
