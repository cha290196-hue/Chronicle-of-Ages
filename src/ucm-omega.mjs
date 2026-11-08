/**
 * UCM-Ω: deterministic causal-integrity kernel for Chronicle of Ages.
 * No model/provider dependency. LLM proposals are untrusted candidate data.
 * A credible causal probability cannot be inferred from plausible prose alone.
 * License: MIT. Target: browser ES modules / Node >= 20.
 */

import { normalizeWorldMetadata,worldCoverage,needsWorldReview,worldReviewReasons,curateWorldEvents } from './world-coverage.mjs';
import {runAdaptiveWindow} from './adaptive-propagation.mjs';

export const FIRST_YEAR = -3200;
export const LAST_YEAR = 2026;
export const ENGINE_VERSION = '0.1.0';
const CATEGORY = new Set(['science','technology','culture','governance','exploration','conflict','society','other']);
const KINDS = new Set(['historical_change','earth_intrusion','physical_constant','branch_fact']);
const MODES = new Set(['point','gradual']);
const safeList = x => Array.isArray(x) ? x : [];
const plain = (x,max=1200) => String(x ?? '').trim().slice(0,max);
const copy = x => JSON.parse(JSON.stringify(x));

export function validYear(y) { return Number.isInteger(y) && y >= FIRST_YEAR && y <= LAST_YEAR && y !== 0; }
export function tick(y) { if (!validYear(y)) throw new RangeError('INVALID_HISTORICAL_YEAR'); return y < 0 ? y + 1 : y; }
export function untick(t) { const y = t <= 0 ? t - 1 : t; if (!validYear(y)) throw new RangeError('INVALID_HISTORICAL_YEAR'); return y; }
export class MatrixError extends Error { constructor(code,detail='') { super(`${code}${detail ? ': '+detail : ''}`); this.name='MatrixError'; this.code=code; } }
const requireYear = y => { if (!validYear(y)) throw new MatrixError('INVALID_YEAR',String(y)); return y; };

/**
 * Converts the *structured interpretation* of a user utterance into immutable interventions.
 * A text model may propose the interpretation, but this function alone authorizes it.
 * It cannot independently determine historical truth or interpret every natural-language input.
 */
export function compileInterventions(interpretation,{parentAnchor=null,parentFacts=[]}={}) {
 const ops = safeList(interpretation?.operations);
 if (!ops.length || ops.length > 12) throw new MatrixError('EMPTY_OR_EXCESSIVE_INTERVENTION');
 const facts = new Set(parentFacts.map(f=>String(f.id)));
 const actions = ops.map((raw,i)=>{
  const kind = raw?.kind;
  if (!KINDS.has(kind)) throw new MatrixError('UNKNOWN_INTERVENTION_KIND');
  if (raw?.scope !== 'earth' && kind !== 'physical_constant') throw new MatrixError('NOT_EARTH_ANCHORED');
  const start = requireYear(raw?.startYear);
  const mode = raw?.mode || 'point';
  if (!MODES.has(mode)) throw new MatrixError('INVALID_TIME_MODE');
  const end = mode === 'point' ? start : requireYear(raw?.endYear);
  if (tick(end) < tick(start) || (mode === 'gradual' && tick(end) === tick(start))) throw new MatrixError('INVALID_TIME_RANGE');
  if (parentAnchor !== null && tick(start) < tick(parentAnchor)) throw new MatrixError('ANCHOR_PRECEDES_PARENT');
  const target = plain(raw?.target,160);
  if (!target) throw new MatrixError('MISSING_TARGET');
  if (kind==='branch_fact' && !facts.has(String(raw?.parentFactId||''))) throw new MatrixError('UNKNOWN_BRANCH_FACT');
  if (kind==='physical_constant' && !plain(raw?.units,100)) throw new MatrixError('PHYSICAL_UNITS_REQUIRED');
  return Object.freeze({
   id:`intervention:${i+1}`,kind,mode,startYear:start,endYear:end,year:start,
   target,value:raw?.value ?? null,units:kind==='physical_constant'?plain(raw.units,100):null,
   parentFactId:kind==='branch_fact'?String(raw.parentFactId):null,
   scope:'earth',description:plain(raw.description||target,900),
   temporalBasis:plain(raw.temporalBasis,500),assumptions:safeList(raw.assumptions).map(x=>plain(x,300)).slice(0,10)
  });
 });
 // Same year, target and different imposed values is an incompatible intervention set.
 for(let i=0;i<actions.length;i++)for(let j=i+1;j<actions.length;j++){
  const a=actions[i],b=actions[j];
  if(a.target.toLowerCase()!==b.target.toLowerCase())continue;
  if(tick(a.startYear)<=tick(b.endYear)&&tick(b.startYear)<=tick(a.endYear)&&JSON.stringify(a.value)!==JSON.stringify(b.value))
   throw new MatrixError('CONTRADICTORY_INTERVENTIONS',`${a.id}, ${b.id}`);
 }
 return Object.freeze(actions);
}

/** Validates lineage and returns the exact shared history at the branching boundary. */
export function resolveAncestry({baseline=[],branches=[],parentId=null,atYear}) {
 requireYear(atYear);
 const byId=new Map(branches.map(b=>[b.id,b]));
 if(byId.size!==branches.length)throw new MatrixError('DUPLICATE_WORLDLINE_ID');
 let p=parentId===null?null:byId.get(parentId);
 if(parentId!==null&&!p)throw new MatrixError('PARENT_NOT_FOUND');
 const chain=[],seen=new Set();
 while(p){
  if(seen.has(p.id))throw new MatrixError('WORLDLINE_CYCLE');
  seen.add(p.id);requireYear(p.anchorYear);chain.unshift(p);
  if(p.parentId && !byId.has(p.parentId))throw new MatrixError('BROKEN_WORLDLINE_ANCESTRY');
  p=p.parentId?byId.get(p.parentId):null;
 }
 if(chain.length && tick(atYear)<tick(chain.at(-1).anchorYear))throw new MatrixError('ANCHOR_PRECEDES_PARENT');
 const rootYear=chain.length?chain[0].anchorYear:atYear;
 const events=[],facts=[];
 const seenIds=new Set();
 const add=(array,record)=>{
  if(!record||!record.id)return;
  if(seenIds.has(record.id))throw new MatrixError('DUPLICATE_INHERITED_ID',String(record.id));
  seenIds.add(record.id);array.push(copy(record));
 };
 // The reality baseline is inherited only BEFORE the first divergence, not after it.
 for(const e of baseline)if(validYear(e.year)&&tick(e.year)<tick(rootYear))add(events,e);
 for(let i=0;i<chain.length;i++){
  const limit=i+1<chain.length?chain[i+1].anchorYear:atYear;
  for(const e of safeList(chain[i].events))if(validYear(e.year)&&tick(e.year)<tick(limit))add(events,e);
  for(const f of [...safeList(chain[i].facts),...safeList(chain[i].knowledge)])if(validYear(f.firstYear)&&tick(f.firstYear)<tick(limit))add(facts,f);
 }
 return {events:events.sort((a,b)=>tick(a.year)-tick(b.year)),facts,ancestry:chain.map(b=>b.id),baselineCutoffYear:rootYear};
}

/** Adaptive nonoverlapping time windows; earlier consequences receive more resolution. */
export function adaptiveWindows(start,end=LAST_YEAR,{maxWindows=7,landmarks=[]}={}) {
 requireYear(start);requireYear(end);
 const lo=tick(start),hi=tick(end);
 if(hi<lo)throw new MatrixError('BACKWARD_SIMULATION');
 if(hi===lo)return [{from:start,to:end}];
 const n=Math.max(1,Math.min(18,Math.trunc(maxWindows)||7,hi-lo+1));
 const cuts=[lo],candidates=new Set();
 // Quadratic spacing allocates high resolution near the intervention.
 for(let i=1;i<n;i++)candidates.add(lo+Math.max(1,Math.min(hi-lo,Math.round((hi-lo)*(i/n)**1.75))));
 const significant=safeList(landmarks).filter(validYear).map(tick).filter(t=>t>lo&&t<hi);
 for(const t of [...candidates].sort((a,b)=>a-b)){
  const nearby=significant.filter(v=>Math.abs(v-t)<=(hi-lo)/(n*5)).sort((a,b)=>Math.abs(a-t)-Math.abs(b-t))[0];
  const candidate=nearby??t;
  if(candidate>cuts.at(-1)&&candidate<hi)cuts.push(candidate);
 }
 cuts.push(hi+1);
 // Inclusive integer-year windows; no zero-year gap and no duplicate boundary years.
 return cuts.slice(0,-1).map((from,i)=>({from:untick(from),to:untick(cuts[i+1]-1)}));
}

function normalizeFact(raw,window,scenario,index){
 const y=raw?.firstYear;
 if(!validYear(y)||tick(y)<tick(window.from)||tick(y)>tick(window.to))throw new MatrixError('FACT_OUT_OF_WINDOW');
 const id=plain(raw.id||`fact:${scenario}:${index}`,120);
 if(!id)throw new MatrixError('EMPTY_FACT_ID');
 return {...copy(raw),id,firstYear:y,origin:'derived',nameEn:plain(raw.nameEn||raw.name,300),nameZh:plain(raw.nameZh||raw.nameEn||raw.name,300),certainty:['high','medium','low'].includes(raw.certainty)?raw.certainty:'low'};
}
function normalizeEvent(raw,window,scenario,index){
 const y=raw?.year;
 if(!validYear(y)||tick(y)<tick(window.from)||tick(y)>tick(window.to))throw new MatrixError('EVENT_OUT_OF_WINDOW');
 const id=plain(raw.id||`event:${scenario}:${index}`,120);
 if(!id||!plain(raw.en||raw.title,300))throw new MatrixError('MISSING_EVENT_ID_OR_TITLE');
 if(!Array.isArray(raw.causes)||!raw.causes.length)throw new MatrixError('CAUSES_REQUIRED',id);
 const causes=raw.causes.map(String);
 return {...copy(raw),...normalizeWorldMetadata(raw),id,year:y,en:plain(raw.en||raw.title,300),zh:plain(raw.zh||raw.en||raw.title,300),
  descriptionEn:plain(raw.descriptionEn||raw.description,1500),descriptionZh:plain(raw.descriptionZh||raw.descriptionEn||raw.description,1500),
  causes,category:CATEGORY.has(raw.category)?raw.category:'other',origin:'derived',
  certainty:['high','medium','low'].includes(raw.certainty)?raw.certainty:'low',
  assumptions:safeList(raw.assumptions).slice(0,10).map(a=>plain(a,250))};
}
const overlap=(a,b,c,d)=>a<=d&&c<=b;
/**
 * Hard gate: rejects retrocausality, missing prerequisites, cycles, invalid dates,
 * double identifiers and mutually incompatible interval facts. No silent repairs.
 * Allows a documented same-year causal ordering because UI stores integer years.
 */
export function auditBatch({proposal,window,knownEvents=[],knownFacts=[],actions=[],scenario=0}){
 const issues=[],rejected=[];
 const indexedEvents=new Map([...knownEvents,...actions].map(e=>[String(e.id),e]));
 const indexedFacts=new Map(knownFacts.map(f=>[String(f.id),f]));
 const draftEvents=[];
 for(const [i,raw] of safeList(proposal?.events).entries()){
  try{
   const e=normalizeEvent(raw,window,scenario,i);
   if(indexedEvents.has(e.id)||draftEvents.some(x=>x.id===e.id))throw new MatrixError('DUPLICATE_EVENT_ID',e.id);
   draftEvents.push(e);
  }catch(err){rejected.push({kind:'event',index:i,reason:err.code||err.message});}
 }
 const stagedFacts=[];
 for(const [i,raw] of safeList(proposal?.facts).entries()){
  try{
   const f=normalizeFact(raw,window,scenario,i);
   if(indexedFacts.has(f.id)||stagedFacts.some(x=>x.id===f.id))throw new MatrixError('DUPLICATE_FACT_ID',f.id);
   if(!f.nameEn)throw new MatrixError('MISSING_FACT_NAME');
   stagedFacts.push(f);
  }catch(err){rejected.push({kind:'fact',index:i,reason:err.code||err.message});}
 }
 const candidates=new Map(draftEvents.map(e=>[e.id,e]));
 // Reject same-year and cross-year cycles, and dependency references to nonexistent causes.
 const visited=new Set(),visiting=new Set(),invalid=new Map();
 function inspect(id){
  if(visited.has(id))return;
  if(visiting.has(id)){invalid.set(id,'CAUSAL_CYCLE');return;}
  const e=candidates.get(id);if(!e)return;
  visiting.add(id);
  for(const cause of e.causes){
   const predecessor=candidates.get(cause)||indexedEvents.get(cause);
   if(!predecessor){invalid.set(id,'UNKNOWN_CAUSE');continue;}
   if(tick(predecessor.year ?? predecessor.startYear)>tick(e.year)){invalid.set(id,'CAUSE_IN_FUTURE');continue;}
   if(candidates.has(cause)){
    inspect(cause);
    if(invalid.has(cause))invalid.set(id,'INVALID_CAUSAL_ANCESTOR');
   }
  }
  for(const fid of safeList(e.requires)){
   const f=stagedFacts.find(x=>x.id===fid)||indexedFacts.get(fid);
   if(!f)invalid.set(id,'MISSING_PREREQUISITE');
   else if(tick(f.firstYear)>tick(e.year))invalid.set(id,'PREREQUISITE_IN_FUTURE');
  }
  // A resource feasibility check is meaningful only when the proposal specifies resource quantities.
  for(const amount of Object.values(e.resourceBalance||{})){
   if(typeof amount!=='number'||!Number.isFinite(amount)||amount<0)invalid.set(id,'INVALID_RESOURCE_BALANCE');
  }
  visiting.delete(id);visited.add(id);
 }
 // A process declared independent of the EDIT must not depend on the edit's
 // downstream graph. Earlier inherited world history remains an independent root.
 const firstActionTick=actions.length?Math.min(...actions.map(a=>tick(a.startYear))):null;
 function descendsFromCurrentEdit(id,seen=new Set()){
  if(seen.has(id))return false;seen.add(id);
  if(actions.some(a=>a.id===id))return true;
  const e=candidates.get(id)||indexedEvents.get(id);
  if(!e||firstActionTick===null)return false;
  if(validYear(e.year)&&tick(e.year)<firstActionTick)return false;
  return safeList(e.causes).some(cause=>descendsFromCurrentEdit(String(cause),seen));
 }
 for(const e of draftEvents){
  if(e.relationToIntervention==='independent' && e.causes.some(cause=>descendsFromCurrentEdit(cause)))
   invalid.set(e.id,'FALSE_INDEPENDENCE');
 }
 for(const e of draftEvents)inspect(e.id);
 const acceptedEvents=draftEvents.filter(e=>{
  if(!invalid.has(e.id))return true;
  rejected.push({kind:'event',id:e.id,reason:invalid.get(e.id)});return false;
 }).sort((a,b)=>tick(a.year)-tick(b.year));
 // Some accepted events can depend on an event rejected for unrelated reasons.
 const good=new Set([...indexedEvents.keys(),...acceptedEvents.map(e=>e.id)]);
 for(let i=acceptedEvents.length-1;i>=0;i--){
  if(acceptedEvents[i].causes.some(id=>!good.has(id))){
   const [e]=acceptedEvents.splice(i,1);good.delete(e.id);rejected.push({kind:'event',id:e.id,reason:'REJECTED_ANCESTOR'});
  }
 }
 const facts=[];
 for(const f of stagedFacts){
  if(f.derivedFrom && !good.has(String(f.derivedFrom))){rejected.push({kind:'fact',id:f.id,reason:'MISSING_FACT_CAUSE'});continue;}
  const key=plain(f.exclusiveKey,120);
  const start=tick(f.firstYear),end=validYear(f.validUntil)?tick(f.validUntil):tick(LAST_YEAR);
  if(end<start){rejected.push({kind:'fact',id:f.id,reason:'INVALID_FACT_INTERVAL'});continue;}
  const conflict=[...knownFacts,...facts].some(other=>key&&key===plain(other.exclusiveKey,120)
   && JSON.stringify(f.value)!==JSON.stringify(other.value)
   && overlap(start,end,tick(other.firstYear),validYear(other.validUntil)?tick(other.validUntil):tick(LAST_YEAR)));
  if(conflict){rejected.push({kind:'fact',id:f.id,reason:'EXCLUSIVE_FACT_CONFLICT'});continue;}
  facts.push(f);
 }
 // A rejected fact can invalidate an event, and an invalidated event can invalidate
 // dependent facts and later events. Compute the fixed point before committing.
 let changed=true;
 while(changed){
  changed=false;
  const survivingFacts=new Set([...knownFacts.map(f=>String(f.id)),...facts.map(f=>f.id)]);
  const survivingEvents=new Set([...indexedEvents.keys(),...acceptedEvents.map(e=>e.id)]);
  for(let i=acceptedEvents.length-1;i>=0;i--){
   const e=acceptedEvents[i];
   if(safeList(e.requires).some(id=>!survivingFacts.has(String(id)))||e.causes.some(id=>!survivingEvents.has(id))){
    acceptedEvents.splice(i,1);rejected.push({kind:'event',id:e.id,reason:'UNSATISFIED_DEPENDENCY'});changed=true;
   }
  }
  const nextEvents=new Set([...indexedEvents.keys(),...acceptedEvents.map(e=>e.id)]);
  for(let i=facts.length-1;i>=0;i--){
   if(facts[i].derivedFrom&&!nextEvents.has(String(facts[i].derivedFrom))){
    const [f]=facts.splice(i,1);rejected.push({kind:'fact',id:f.id,reason:'INVALID_FACT_ANCESTOR'});changed=true;
   }
  }
 }
 if(!acceptedEvents.length && safeList(proposal?.events).length)issues.push('NO_VALID_EVENTS');
 return {events:acceptedEvents,facts,rejected,issues};
}

export function evaluateScenario(scenario){
 const events=scenario.events||[],rejected=scenario.rejected||[],facts=scenario.facts||[];
 const unsupported=events.filter(e=>e.assumptions.length>0).length;
 const domains=new Set(events.map(e=>e.category)).size;
 // Internal consistency heuristic only; never call this a posterior probability.
 const coverage=worldCoverage(events);
 const knownBreadth=coverage.metadataCoverage>=.6;
 const dominancePenalty=knownBreadth&&events.length>=5?Math.max(0,coverage.threadShare-.55)*24:0;
 // Evaluates distribution of modeled events, not objective importance or truth.
 const score=100-18*rejected.length-3*unsupported+2*Math.min(domains,7)+Math.min(events.length,12)+Math.min(facts.length,6)
  -dominancePenalty+(knownBreadth?Math.min(6,coverage.independent):0);
 return {score,validEvents:events.length,rejected:rejected.length,domains,unsupportedAssumptions:unsupported,worldCoverage:coverage,dominancePenalty};
}

/**
 * Runs independent, LLM-proposed trajectories behind a deterministic integrity barrier.
 * `propose` is a user-supplied async callback; this module neither calls an API nor invents facts.
 * Returns alternative scenarios and transparent consistency diagnostics, NOT probabilities.
 */
export async function runMatrix({baseline=[],branches=[],parentId=null,interpretation,propose,scenarioCount=1,maxWindows=6,signal,onProgress=()=>{},landmarks=[]}){
 if(typeof propose!=='function')throw new MatrixError('PROPOSER_REQUIRED');
 const parent=parentId===null?null:branches.find(b=>b.id===parentId);
 // A discovered fact cannot support a new fork earlier than that fact exists.
 // Filter ancestry and the selected parent's own knowledge by the new fork date
 // before compiling branch-local modifications.
 const requestedYears=safeList(interpretation?.operations).map(op=>op?.startYear).filter(validYear);
 const requestedFirst=requestedYears.length?requestedYears.reduce((earliest,y)=>tick(y)<tick(earliest)?y:earliest):LAST_YEAR;
 const inheritedAtFork=parent?resolveAncestry({baseline,branches,parentId,atYear:requestedFirst}).facts:[];
 const knownAtFork=parent?[...inheritedAtFork,...safeList(parent.facts),...safeList(parent.knowledge)]
   .filter(f=>validYear(f.firstYear)&&tick(f.firstYear)<=tick(requestedFirst)):[];
 const actions=compileInterventions(interpretation,{parentAnchor:parent?.anchorYear??null,parentFacts:knownAtFork});
 const firstYear=actions.reduce((best,a)=>tick(a.startYear)<tick(best)?a.startYear:best,actions[0].startYear);
 const inherited=resolveAncestry({baseline,branches,parentId,atYear:firstYear});
 const windows=adaptiveWindows(firstYear,LAST_YEAR,{maxWindows,landmarks});
 const trajectories=[];
 const count=Math.max(1,Math.min(5,Math.trunc(scenarioCount)||1));
 let completedWindows=0,plannedWindows=count*windows.length;
 for(let s=0;s<count;s++){
  const events=[],facts=[],rejected=[],snapshots=[];
  for(let w=0;w<windows.length;w++){
   // On malformed/truncated provider output, subdivide this exact window.
   // Successful earlier subdivisions are not regenerated or discarded.
   await runAdaptiveWindow({
    window:windows[w],signal,maxDepth:12,maxTasks:72,
    onSplit:({children,window,reason})=>{
     plannedWindows+=children-1;
     onProgress({phase:'propagation',index:completedWindows,total:plannedWindows,scenario:s+1,window,reason,subdividing:true});
    },
    execute:async (window,{focus,depth})=>{
     if(signal?.aborted)throw new MatrixError('ABORTED');
     onProgress({phase:'propagation',index:completedWindows,total:plannedWindows,scenario:s+1,window,focus,depth});
     const knownEvents=[...inherited.events,...events],knownFacts=[...inherited.facts,...facts];
     const promptState={scenario:s+1,window,windowIndex:w,totalWindows:windows.length,
      actions,propagationFocus:focus||null,
      knownEvents:knownEvents.slice(-55).map(e=>({id:e.id,year:e.year,en:e.en,category:e.category,region:e.region,threadKey:e.threadKey,relationToIntervention:e.relationToIntervention})),
      knownFacts:knownFacts.slice(-50).map(f=>({id:f.id,firstYear:f.firstYear,nameEn:f.nameEn})),
      allowedCauseIds:[...actions.map(a=>a.id),...knownEvents.map(e=>e.id)],
      realityCheckpoints:baseline.filter(e=>validYear(e.year)&&tick(e.year)>=tick(window.from)&&tick(e.year)<=tick(window.to))
       .slice(0,12).map(e=>({year:e.year,en:e.en,category:e.category})),
      worldwideCoverage:worldCoverage(events),
      instructions:'Each candidate event must cite at least one existing causal ID or a prior event ID from the same batch. Use unique event IDs. Every fact has firstYear and may use derivedFrom. The returned events are hypotheses, never recorded historical facts.'};
     let batch=await propose(copy(promptState));
     if(!batch||typeof batch!=='object')throw new MatrixError('INVALID_WINDOW_RESPONSE');
     let audit=auditBatch({proposal:batch,window,knownEvents,knownFacts,actions,scenario:s+1});
     // Existing causal-repair stage remains in place.
     if(!audit.events.length && safeList(batch.events).length){
      const repaired=await propose({...copy(promptState),repairReasons:audit.rejected,repairAttempt:1});
      if(repaired&&typeof repaired==='object')
       audit=auditBatch({proposal:repaired,window,knownEvents,knownFacts,actions,scenario:s+1});
     }
     // Review a biased regional history without demanding invented milestones.
     if(needsWorldReview(audit.events,events,window)&&!focus){
      const coverageState={...copy(promptState),
       knownEvents:[...knownEvents,...audit.events].slice(-65).map(e=>({id:e.id,year:e.year,en:e.en,category:e.category,region:e.region,threadKey:e.threadKey})),
       knownFacts:[...knownFacts,...audit.facts].slice(-55).map(f=>({id:f.id,firstYear:f.firstYear,nameEn:f.nameEn})),
       allowedCauseIds:[...promptState.allowedCauseIds,...audit.events.map(e=>e.id)],
       coverageReasons:worldReviewReasons(audit.events,events,window),coverageAttempt:1};
      const supplement=await propose(coverageState);
      if(supplement&&typeof supplement==='object'){
       const extra=auditBatch({proposal:supplement,window,
        knownEvents:[...knownEvents,...audit.events],knownFacts:[...knownFacts,...audit.facts],actions,scenario:s+1});
       audit.events.push(...extra.events);audit.facts.push(...extra.facts);
       audit.rejected.push(...extra.rejected);
      }
     }
     // Selection determines major-event salience only. Keep the FULL audited
     // causal ledger, including quieter milestones and prerequisites.
     const curated=curateWorldEvents(audit.events,{previous:events,maxEvents:9,
      requiredEventIds:audit.facts.map(f=>f.derivedFrom).filter(Boolean)});
     const salient=new Set(curated.events.map(e=>e.id));
     const full=audit.events.map(e=>({...e,salient:salient.has(e.id)}));
     events.push(...full);facts.push(...audit.facts);rejected.push(...audit.rejected);
     snapshots.push({window,focus,accepted:full.length,major:salient.size,
      rejected:audit.rejected.length,worldCoverage:worldCoverage([...events]),
      summary:plain(batch.summary,900)});
     completedWindows++;
     return {window,accepted:full.length};
    }
   });
  }
  // Once all subdivided windows are assembled, independently revalidate
  // every event, fact, cross-window causal edge and mutually exclusive claim.
  const global=auditBatch({proposal:{events,facts},window:{from:firstYear,to:LAST_YEAR},
   knownEvents:inherited.events,knownFacts:inherited.facts,actions,scenario:s+1});
  if(global.events.length!==events.length||global.facts.length!==facts.length||global.rejected.length){
   throw new MatrixError('GLOBAL_CAUSAL_AUDIT_FAILED',
    `Rejected ${global.rejected.length} cross-window dependencies; no partial worldline committed`);
  }
  const trajectory={scenarioId:`scenario:${s+1}`,events,facts,rejected,snapshots};
  trajectory.audit=evaluateScenario(trajectory);
  trajectories.push(trajectory);
 }
 trajectories.sort((a,b)=>b.audit.score-a.audit.score||a.scenarioId.localeCompare(b.scenarioId));
 return {version:ENGINE_VERSION,origin:'counterfactual',firstYear,endYear:LAST_YEAR,actions,inherited,windows,
  preferred:trajectories[0],alternatives:trajectories.slice(1),
  evaluation:'Uncalibrated causal-integrity ranking. This score is not a probability of historical truth.'};
}

/** Convert an audited output to the existing branch storage shape, preserving model provenance. */
export function toLegacyWorldline(result,{id,parentId=null,prompt='',titleEn='',titleZh='',summaryEn='',summaryZh='',createdAt=new Date().toISOString()}={}){
 if(!id)throw new MatrixError('WORLDLINE_ID_REQUIRED');
 const action=result.actions[0],preferred=result.preferred;
 return {
  id,parentId,anchorYear:result.firstYear,timeMode:action.mode,transitionEndYear:action.endYear,
  timeBasisEn:action.temporalBasis,timeBasisZh:action.temporalBasis,
  prompt,type:action.kind,titleEn,titleZh,summaryEn,summaryZh,createdAt,
  events:preferred.events.map(e=>({...e,causes:e.causes,origin:'derived'})),
  facts:preferred.facts.map(f=>({...f,origin:'derived'})),knowledge:[],
  inherited:{events:result.inherited.events.filter(e=>e.origin!=='recorded'),facts:result.inherited.facts},
  certainty:'low',impacts:[],image:null,
  // Legacy sanitizer currently removes these extra fields; use an archive-schema migration to persist them.
  omega:{version:ENGINE_VERSION,interventions:result.actions,audit:preferred.audit,scenarios:result.alternatives.length+1}
 };
}