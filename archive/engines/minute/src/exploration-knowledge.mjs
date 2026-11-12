/** Branch-local Core discoveries. Review establishes world canon, never real historical truth. */
import {validYear,tick} from '../../../../src/calendar.mjs';
import {sanitizePromptKnowledge} from '../../../../src/prompt-world.mjs';
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
/** Resolve the candidate DAG before admission; same-question premises may support later deductions. */
export function auditKnowledge({candidates=[],existing=[],events=[],makeId,questionRef='',limit=Infinity,requireEvidence=false}={}){
 if(typeof makeId!=='function')throw new TypeError('KNOWLEDGE_ID_FACTORY_REQUIRED');
 const accepted=[],rejected=[],duplicates=[],known=list(existing),records=new Map([...known,...list(events)].map(r=>[String(r.id),r])),aliases=new Map();
 const pending=list(candidates).map((raw,index)=>({raw,index,localId:typeof raw?.id==='string'?raw.id:'proposal:'+(index+1)}));
 const counts=new Map();for(const p of pending)counts.set(p.localId,(counts.get(p.localId)||0)+1);
 for(const p of pending){if(counts.get(p.localId)>1||records.has(p.localId)){p.invalid=true;rejected.push({index:p.index,proposalId:p.localId,reason:'DUPLICATE_PROPOSAL_ID'});}}
 let work=pending.filter(p=>!p.invalid),progress=true;
 const reject=(p,reason,detail)=>rejected.push({index:p.index,proposalId:p.localId,reason,...(detail?{detail}:{})});
 while(work.length&&progress){
  progress=false;const deferred=[];
  for(const p of work){
   const {raw,index,localId}=p;
   if(!isObject(raw)||raw.relevant===false){reject(p,'IRRELEVANT');progress=true;continue;}
   const refs=list(raw.evidenceIds).map(String),inputs=list(raw.calculation?.inputs).map(String),rankRefs=list(raw.ranking?.entries).map(e=>e.factId),allRefs=[...refs,...inputs,...rankRefs];
   if(allRefs.some(id=>!records.has(id)&&!aliases.has(id)&&work.some(other=>other.localId===id))){deferred.push(p);continue;}
   progress=true;
   const resolve=id=>aliases.get(id)||id,realRefs=refs.map(resolve);
   if(allRefs.some(id=>!records.has(resolve(id)))){reject(p,'UNKNOWN_EVIDENCE');continue;}
   const firstYear=raw.firstYear,validUntil=raw.validUntil??firstYear;
   if(!validYear(firstYear)||!validYear(validUntil)||tick(validUntil)<tick(firstYear)){reject(p,'INVALID_INTERVAL');continue;}
   if(!text(raw.nameEn||raw.nameZh)||!text(raw.descriptionEn||raw.descriptionZh)){reject(p,'INSUFFICIENT_DETAIL');continue;}
   const future=allRefs.map(id=>({id,year:records.get(resolve(id))?.year??records.get(resolve(id))?.firstYear})).filter(r=>validYear(r.year)&&tick(r.year)>tick(firstYear));
   if(future.length){reject(p,'EVIDENCE_IN_FUTURE',{factYear:firstYear,sources:future});continue;}
   if(!realRefs.length&&(requireEvidence||!text(raw.basis))){reject(p,'NO_CAUSAL_BASIS');continue;}
   const fact=sanitizeKnowledge({...raw,id:String(makeId()),evidenceIds:realRefs,
    ...(raw.calculation?{calculation:{...raw.calculation,inputs:inputs.map(resolve)}}:{}),
    ...(raw.ranking?{ranking:{...raw.ranking,entries:raw.ranking.entries.map(e=>({...e,factId:resolve(e.factId)}))}}:{}),
    validUntil,questionRef,discoveredAt:new Date().toISOString()});
   if(!fact){reject(p,'BAD_CANDIDATE');continue;}
   if(fact.calculation){
    const values=fact.calculation.inputs.map(id=>records.get(id)?.quantity?.amount),c=fact.calculation;
    if(!fact.quantity||values.some(v=>!Number.isFinite(v))||c.operation==='ratio'&&(values.length!==2||values[1]===0)){reject(p,'INVALID_CALCULATION');continue;}
    const result=(c.operation==='sum'?values.reduce((a,b)=>a+b,0):c.operation==='product'?values.reduce((a,b)=>a*b,1):values[0]/values[1])*c.scale;
    const rounded=Number(result.toFixed(c.decimals));if(!Number.isFinite(rounded)||Math.abs(rounded-fact.quantity.amount)>Math.max(1,Math.abs(rounded))*1e-10){reject(p,'CALCULATION_MISMATCH',{operation:c.operation,inputs:c.inputs.map(id=>({id,quantity:records.get(id)?.quantity})),scale:c.scale,expected:rounded,provided:fact.quantity.amount,unit:fact.quantity.unit});continue;}
   }
   const duplicate=[...known,...accepted,...list(events)].find(e=>equivalent(fact,e));
   if(duplicate){aliases.set(localId,duplicate.id);duplicates.push({index,proposalId:localId,id:duplicate.id,reason:'ALREADY_KNOWN'});continue;}
   if([...known,...accepted].some(e=>opposite(fact,e))){reject(p,'CONFLICTS_WITH_WORLDLINE');continue;}
   if(accepted.length>=limit){reject(p,'CAPACITY_EXCEEDED');continue;}
   accepted.push(fact);records.set(fact.id,fact);aliases.set(localId,fact.id);
  }
  work=deferred;
 }
 for(const p of work)reject(p,'CYCLIC_OR_UNRESOLVED_DEPENDENCY');
 return {accepted,rejected,duplicates,references:Object.fromEntries(aliases),reviewed:list(candidates).length};
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
export function knowledgeForFork(parent,anchorYear){
 if(!validYear(anchorYear))throw new RangeError('INVALID_YEAR');
 return list(parent?.knowledge).filter(f=>validYear(f.firstYear)&&tick(f.firstYear)<tick(anchorYear)).map(sanitizeKnowledge).filter(Boolean);
}
export function summarizeKnowledge(records,query='',max=24){
 const q=key(query),words=clip(query,240).toLowerCase().match(/[a-z0-9]{3,}|[\u3400-\u9fff]{2,}/g)||[];
 return list(records).map(f=>({f,score:words.reduce((s,w)=>s+(JSON.stringify(f).toLowerCase().includes(w)?w.length:0),0)+(q&&key(f.nameEn).includes(q)?10:0)+(q&&key(f.nameZh).includes(q)?10:0)})).sort((a,b)=>b.score-a.score||tick(b.f.firstYear)-tick(a.f.firstYear)).slice(0,max).map(x=>x.f);
}
