/** Read-only versioned save adapter; no inference or context selection. */
import {validYear,tick,LAST_YEAR} from './calendar.mjs';
import {REGIONS,validateMacro} from './legacy-world-reader.mjs';
import {sanitizePromptSimulation} from './prompt-world.mjs';
const clone=x=>JSON.parse(JSON.stringify(x));
export function sanitizeSimulation(raw){
 if(raw?.version===4)return sanitizePromptSimulation(raw);
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
   validateMacro(data.graph,{firstYear:data.genesis.year,actions:data.actions.map((a,i)=>({...a,id:'intervention:'+(i+1)})),inherited:{events:data.referenceYears,facts:[]},requireRegionalDomains:!!data.outputPolicy});
  }
  return data;
 }catch{return null}
}
