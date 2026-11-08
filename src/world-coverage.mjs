/**
 * Earth-wide event salience and narrative-dominance control for UCM-Ω.
 * This is editorial selection over causally audited model proposals,
 * NOT an empirical estimate of historical importance or probability.
 */
const list=x=>Array.isArray(x)?x:[];
const label=x=>String(x??'').trim().toLowerCase().replace(/\s+/g,'-').slice(0,100);
const weight={epochal:5,major:4,significant:3,moderate:2,minor:1};
const extent={global:4,transregional:3,regional:2,local:1};
const relation=new Set(['direct','indirect','independent','uncertain']);
const top=(counts)=>[...counts.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0]||[null,0];
const tally=(events,field)=>{const out=new Map();for(const e of events){const k=label(e?.[field]);if(k)out.set(k,(out.get(k)||0)+1)}return out};
export function worldCoverage(events=[]){
 const src=list(events);
 const threads=tally(src,'threadKey'),regions=tally(src,'region');
 const [dominantThread,threadCount]=top(threads);
 const [dominantRegion,regionCount]=top(regions);
 const related=src.filter(e=>['direct','indirect'].includes(e?.relationToIntervention)).length;
 const independent=src.filter(e=>e?.relationToIntervention==='independent').length;
 return {
  total:src.length,regions:Object.fromEntries(regions),threads:Object.fromEntries(threads),
  domains:Object.fromEntries(tally(src,'category')),independent,related,
  dominantThread,threadShare:src.length?threadCount/src.length:0,
  dominantRegion,regionShare:src.length?regionCount/src.length:0,
  metadataCoverage:src.length?src.filter(e=>label(e?.region)&&label(e?.threadKey)).length/src.length:0
 };
}
/**
 * Conditional coverage audit. The absence of events in a region is never
 * evidence they must be invented; review only detects apparent tunnel vision.
 */
export function needsWorldReview(batchEvents,earlier=[],window={from:1,to:1}){
 const current=worldCoverage(batchEvents);
 const running=worldCoverage([...list(earlier),...list(batchEvents)]);
 const duration=window.to-window.from+1;
 if(duration<30||!current.total||current.metadataCoverage<0.66)return false;
 const monoCurrent=current.total>=3&&current.threadShare>=0.75;
 const monoRunning=running.total>=5&&running.threadShare>=0.7;
 const allDirect=current.total>=2&&current.related===current.total&&current.independent===0;
 return monoCurrent||monoRunning||(duration>=80&&allDirect);
}
export function worldReviewReasons(events,prior,window){
 const now=worldCoverage(events),all=worldCoverage([...list(prior),...list(events)]);
 return [
  'Review this independent Earth-wide time window, not the user\'s initial topic.',
  `Window ${window.from}..${window.to}; local dominant thread ${now.dominantThread||'unknown'} (share ${now.threadShare.toFixed(2)}), full trajectory dominant thread ${all.dominantThread||'unknown'} (share ${all.threadShare.toFixed(2)}).`,
  'Explore historically consequential processes that might continue autonomously in regions, scientific fields, economies, societies and ecologies outside the intervention\'s region. Add events ONLY if causally supported; returning no additional events is valid.',
  'Do not invent obligatory milestones or assume actual post-fork history recurs unchanged.'
 ];
}
/**
 * Greedy, reproducible selection of globally consequential events.
 * All in-batch causal ancestors of a selected event and fact provenance
 * required by the event ledger are retained; never sever a causal chain.
 */
export function curateWorldEvents(events,{previous=[],maxEvents=9,requiredEventIds=[]}={}){
 const source=list(events);
 if(source.length<=maxEvents)return {events:source,omitted:[],coverage:worldCoverage([...list(previous),...source])};
 const byId=new Map(source.map(e=>[e.id,e]));
 const chosen=new Set(),required=new Set(list(requiredEventIds).map(String));
 // Preserve the factual ledger's provenance; not just visible story points.
 const closure=(id,seen=new Set())=>{
  if(seen.has(id))return [];seen.add(id);
  const e=byId.get(id);if(!e)return [];
  return [...list(e.causes).flatMap(c=>closure(c,seen)),e.id];
 };
 for(const id of required)for(const dep of closure(id))chosen.add(dep);
 const topicCounts=tally([...list(previous),...source.filter(e=>chosen.has(e.id))],'threadKey');
 const regionalCounts=tally([...list(previous),...source.filter(e=>chosen.has(e.id))],'region');
 const domainCounts=tally([...list(previous),...source.filter(e=>chosen.has(e.id))],'category');
 const selected=s=>{for(const id of s){if(chosen.has(id))continue;chosen.add(id);const e=byId.get(id);for(const [map,field] of [[topicCounts,'threadKey'],[regionalCounts,'region'],[domainCounts,'category']]){
  const key=label(e?.[field]);if(key)map.set(key,(map.get(key)||0)+1);
 }}};
 while(chosen.size<maxEvents){
  let winner=null;
  for(let i=0;i<source.length;i++){
   const e=source[i];if(chosen.has(e.id))continue;
   const extra=[...new Set(closure(e.id))].filter(id=>!chosen.has(id));
   if(!extra.length||chosen.size+extra.length>maxEvents)continue;
   const thread=label(e.threadKey),region=label(e.region),domain=label(e.category);
   const topicRepeat=thread?(topicCounts.get(thread)||0):0;
   const regionalRepeat=region?(regionalCounts.get(region)||0):0;
   const domainRepeat=domain?(domainCounts.get(domain)||0):0;
   const scope=extent[label(e.scope)]||2;
   const significance=weight[label(e.significance)]||2;
   // Significance matters more than diversity, but a monotonous topic has a cost.
   const score=significance*6+scope*2-4*topicRepeat-1.4*regionalRepeat-.5*domainRepeat-.4*(extra.length-1);
   if(!winner||score>winner.score||(score===winner.score&&i<winner.i))winner={score,i,extra};
  }
  if(!winner)break;
  selected(winner.extra);
 }
 // A metadata-poor suggestion must not be silently ranked as verified.
 const accepted=source.filter(e=>chosen.has(e.id));
 return {events:accepted,omitted:source.filter(e=>!chosen.has(e.id)),coverage:worldCoverage([...list(previous),...accepted])};
}
export function normalizeWorldMetadata(raw){
 const r=raw&&typeof raw==='object'?raw:{};
 const rel=label(r.relationToIntervention);
 return {
  region:label(r.region)||'unspecified',
  threadKey:label(r.threadKey)||'',
  scope:extent[label(r.scope)]?label(r.scope):'regional',
  significance:weight[label(r.significance)]?label(r.significance):'moderate',
  relationToIntervention:relation.has(rel)?rel:'uncertain'
 };
}
