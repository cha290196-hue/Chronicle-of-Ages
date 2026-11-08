/** Read-only versioned world state and evidence retrieval. Legacy inference lives in archive/. */
import {validYear,tick,LAST_YEAR} from './worldline-contract.mjs';
import {REGIONS,DOMAINS,validateMacro} from './minute-world.mjs';
export {REGIONS,DOMAINS};
const list=x=>Array.isArray(x)?x:[];
const clone=x=>JSON.parse(JSON.stringify(x));
export function stateAt(snapshot,year){
 if(!snapshot)return null;
 const history=list(snapshot.snapshots).filter(s=>validYear(s.year)&&(snapshot.version===3?tick(s.year)<=tick(year):tick(s.year)<tick(year))).sort((a,b)=>tick(a.year)-tick(b.year));
 const prior=history.at(-1)?.state||snapshot.genesis;
 if(!prior||tick(prior.year)>tick(year))return null;
 return clone(prior);
}

export function causalContext({world,events=[],facts=[],actions=[],query='',limit=90}){
 const byId=new Map([...world.conditions,...events,...facts,...actions].map(x=>[x.id,x]));
 const chosen=new Set(world.conditions.map(c=>c.id));
 const add=(id)=>{if(chosen.has(id))return;const r=byId.get(id);if(!r)return;chosen.add(id);
  for(const c of [...list(r.causes),...list(r.requires),...list(r.evidenceIds),...(r.derivedFrom?[r.derivedFrom]:[])])add(c)};
 for(const a of actions)add(a.id);
 for(const r of REGIONS){for(const e of events.filter(e=>e.region===r||list(e.impact?.regions).includes(r)).slice(-6))add(e.id)}
 for(const p of world.processes)for(const id of p.causes)add(id);
 const terms=String(query).toLowerCase().match(/[a-z]{3,}|[\u3400-\u9fff]{2,}/g)||[];
 for(const f of facts.filter(f=>terms.some(t=>JSON.stringify(f).toLowerCase().includes(t))).slice(0,limit))add(f.id);
 for(const e of events.slice(-12))add(e.id);
 // Do not cut a causal chain to satisfy a fixed record count. Region state is compact.
 return {records:[...chosen].map(id=>byId.get(id)).filter(Boolean),regions:world.regions,processes:world.processes};
}

export function sanitizeSimulation(raw){
 if(!raw||![2,3].includes(raw.version)||!Array.isArray(raw.snapshots)||!raw.genesis)return null;
 try{
  const data=clone(raw);
  if(JSON.stringify(data).length>12_000_000)return null;
  if(!Array.isArray(data.actions)||!Array.isArray(data.milestoneIds)||data.milestoneIds.some(x=>typeof x!=='string'))return null;
  const validState=s=>s&&validYear(s.year)&&Array.isArray(s.conditions)&&Array.isArray(s.processes)&&Array.isArray(s.regions)&&
   REGIONS.every(region=>s.regions.some(r=>r.region===region&&typeof r.summary==='string'&&Array.isArray(r.unknowns)&&Array.isArray(r.domains)));
  if(!validState(data.genesis)||data.snapshots.some(s=>!validState(s.state)))return null;
  if(!validYear(data.genesis.year)||data.snapshots.some(s=>!validYear(s.year)||!s.state||s.state.year!==s.year))return null;
  if(data.snapshots.some((s,i)=>i&&tick(s.year)<=tick(data.snapshots[i-1].year)))return null;
  if(data.version===3){
   if(data.engine!=='Chronicle Minute'||data.completedThrough!==LAST_YEAR||data.quality?.status!=='reviewed'||!data.graph||!Array.isArray(data.referenceYears)||!data.timing?.completed)return null;
   if(!['pass','repair'].includes(data.quality.review?.verdict)||(data.quality.review.checks&&!['premise','causality','world','time','setting'].every(k=>data.quality.review.checks[k]===true)))return null;
   validateMacro(data.graph,{firstYear:data.genesis.year,actions:data.actions.map((a,i)=>({...a,id:'intervention:'+(i+1)})),inherited:{events:data.referenceYears,facts:[]}});
  }
  return data;
 }catch{return null}
}
