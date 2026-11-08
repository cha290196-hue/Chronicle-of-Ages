import {validYear,tick,untick,LAST_YEAR,MatrixError,auditBatch} from './ucm-omega.mjs';

export const REGIONS=['east-asia','south-asia','west-central-asia','europe','africa','americas','oceania'];
export const DOMAINS=['politics','economy','society','science-technology','environment','culture'];
export const REVIEW_CRITERIA=['premise-fidelity','mechanism-support','world-coverage','temporal-coverage','state-consistency'];
const list=x=>Array.isArray(x)?x:[];
const clip=(x,n=1200)=>String(x??'').trim().slice(0,n);
const clone=x=>JSON.parse(JSON.stringify(x));
const unique=x=>[...new Set(x)];

/** Navigation milestones are intentionally NOT accepted as the initial world model. */
export function initializeWorld(raw,{year,inheritedEvents=[],inheritedFacts=[]}={}){
 if(!validYear(year)||!raw||!Array.isArray(raw.conditions)||!Array.isArray(raw.processes))throw new MatrixError('WORLD_INITIALIZATION_INVALID');
 const conditions=raw.conditions.map((r,i)=>{
  if(!clip(r.id)||!validYear(r.firstYear)||tick(r.firstYear)>tick(year)||!clip(r.statement)||
   ![...REGIONS,'global'].includes(r.region)||!DOMAINS.includes(r.domain)||!clip(r.basis))
   throw new MatrixError('WORLD_CONDITION_INVALID',String(i));
  return {id:clip(r.id,120),year:r.firstYear,firstYear:r.firstYear,en:clip(r.statement),zh:clip(r.statementZh||r.statement),
   nameEn:clip(r.statement),nameZh:clip(r.statementZh||r.statement),region:r.region,domain:r.domain,
   basis:clip(r.basis),origin:'background',status:'model-background',causes:[],
   // A model's recollection is not an externally verified historical source.
   provenance:{kind:'model-background',verified:false},certainty:'low'};
 });
 const ids=new Set([...conditions,...inheritedEvents,...inheritedFacts].map(x=>x.id));
 if(new Set(conditions.map(x=>x.id)).size!==conditions.length||conditions.some(c=>[...inheritedEvents,...inheritedFacts].some(x=>x.id===c.id)))
  throw new MatrixError('WORLD_CONDITION_DUPLICATE');
 const regions=list(raw.regions).map(r=>({region:r.region,summary:clip(r.summary,1800),unknowns:list(r.unknowns).map(x=>clip(x,300)),
  domains:list(r.domains).map(d=>({domain:d.domain,summary:clip(d.summary,600),evidenceIds:list(d.evidenceIds),status:d.status}))}));
 if(REGIONS.some(r=>!regions.some(s=>s.region===r&&s.summary)))throw new MatrixError('WORLD_REGIONS_INCOMPLETE');
 if(regions.some(r=>DOMAINS.some(domain=>!r.domains.some(d=>d.domain===domain&&d.summary&&['established','uncertain','unknown'].includes(d.status)&&
  (d.status==='unknown'||d.evidenceIds.length>0)&&d.evidenceIds.every(id=>ids.has(id))))))throw new MatrixError('WORLD_DOMAINS_INCOMPLETE');
 const processes=raw.processes.map((p,i)=>{
  if(!clip(p.id)||!REGIONS.includes(p.region)||!DOMAINS.includes(p.domain)||!clip(p.description)||
   !list(p.causes).length||p.causes.some(id=>!ids.has(id)))throw new MatrixError('WORLD_PROCESS_INVALID',String(i));
  return {id:clip(p.id,120),region:p.region,domain:p.domain,description:clip(p.description),
   causes:unique(p.causes),status:'active',lastReviewed:year,summary:clip(p.description),uncertainty:list(p.uncertainty).map(x=>clip(x,300))};
 });
 if(new Set(processes.map(p=>p.id)).size!==processes.length||REGIONS.some(r=>!processes.some(p=>p.region===r)))throw new MatrixError('WORLD_PROCESSES_INCOMPLETE');
 return {version:2,year,conditions,regions,processes,extinction:null};
}

/** Bounded era-sensitive windows, further shortened by an established pending change. */
export function nextWorldWindow(from,{processes=[],end=LAST_YEAR,first=false}={}){
 const span=first?Math.min(5,end-from+1):from<1?100:from<1000?80:from<1700?40:from<1900?25:15;
 let to=untick(Math.min(tick(end),tick(from)+span-1));
 for(const p of processes)if(validYear(p.nextYear)&&tick(p.nextYear)>=tick(from)&&tick(p.nextYear)<tick(to))to=p.nextYear;
 return {from,to};
}

export function stateAt(snapshot,year){
 if(!snapshot)return null;
 const history=list(snapshot.snapshots).filter(s=>validYear(s.year)&&tick(s.year)<tick(year)).sort((a,b)=>tick(a.year)-tick(b.year));
 const prior=history.at(-1)?.state||snapshot.genesis;
 if(!prior||tick(prior.year)>tick(year))return null;
 return clone(prior);
}

/** Retrieve causal ancestors plus regional boundary conditions, never only the last N headlines. */
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

/** Events require a mechanism for EVERY causal edge, not merely a valid reference ID. */
export function auditTransition({proposal,window,world,events=[],facts=[],actions=[]}){
 const rejected=[],prepared=[];
 for(const e of list(proposal?.events)){
  const links=list(e.links),causes=list(e.causes);
  const invalid=!causes.length||causes.some(id=>!links.some(l=>l.causeId===id&&clip(l.mechanism)&&['established','supported-inference'].includes(l.support)))||
   links.some(l=>!causes.includes(l.causeId)||l.support==='speculative');
  if(invalid){rejected.push({kind:'event',id:e.id,reason:'UNSUPPORTED_MECHANISM'});continue}
  const impact=e.impact;
  if(!impact||!clip(impact.mechanism)||!list(impact.domains).length||!list(impact.regions).length||
   impact.regions.some(r=>![...REGIONS,'global'].includes(r))){rejected.push({kind:'event',id:e.id,reason:'IMPACT_UNEXPLAINED'});continue}
  prepared.push(e);
 }
 const preparedFacts=list(proposal?.facts).filter(f=>{
  if(!clip(f.derivedFrom)){rejected.push({kind:'fact',id:f.id,reason:'FACT_MECHANISM_REQUIRED'});return false}return true;
 });
 const audit=auditBatch({proposal:{events:prepared,facts:preparedFacts},window,
  knownEvents:[...world.conditions,...events],knownFacts:facts,actions,scenario:1});
 audit.rejected.unshift(...rejected);
 const allowed=new Set([...world.conditions,...events,...audit.events,...facts,...audit.facts,...actions].map(x=>x.id));
 // Every process, including autonomous ones outside the intervention, is explicitly reviewed.
 const reviews=list(proposal?.processReviews),issues=[];
 for(const p of world.processes){
  const r=reviews.find(r=>r.processId===p.id);
  if(!r||!['advanced','stable','blocked','uncertain'].includes(r.status)||!clip(r.reason))issues.push({processId:p.id,reason:'PROCESS_NOT_REVIEWED'});
  else if(list(r.eventIds).some(id=>!audit.events.some(e=>e.id===id))||r.status==='advanced'&&!list(r.eventIds).length)
   issues.push({processId:p.id,reason:'PROCESS_EVIDENCE_INVALID'});
 }
 const updates=list(proposal?.stateUpdates);
 for(const region of REGIONS){
  const update=updates.find(u=>u.region===region);
  if(!update||!clip(update.summary)||!list(update.evidenceIds).length||update.evidenceIds.some(id=>!allowed.has(id)))
   issues.push({region,reason:'REGION_STATE_UNSUPPORTED'});
  if(!update||DOMAINS.some(domain=>!list(update.domains).some(d=>d.domain===domain&&clip(d.summary)&&
   ['established','uncertain','unknown'].includes(d.status)&&(d.status==='unknown'||list(d.evidenceIds).length>0)&&list(d.evidenceIds).every(id=>allowed.has(id)))))
   issues.push({region,reason:'REGIONAL_DOMAINS_NOT_REVIEWED'});
 }
 if(audit.rejected.length)issues.push({reason:'REJECTED_EVENTS_NEED_REPAIR',count:audit.rejected.length});
 return {...audit,issues,processReviews:reviews,stateUpdates:updates};
}

export function advanceWorld(world,audit,year){
 const next=clone(world);next.year=year;
 next.regions=REGIONS.map(region=>{
  const u=audit.stateUpdates.find(u=>u.region===region);
  return {region,summary:clip(u.summary,1800),evidenceIds:unique(list(u.evidenceIds)),unknowns:list(u.unknowns).map(x=>clip(x,300)),
   domains:list(u.domains).map(d=>({domain:d.domain,summary:clip(d.summary,600),evidenceIds:unique(list(d.evidenceIds)),status:d.status}))};
 });
 next.processes=next.processes.map(p=>{
  const r=audit.processReviews.find(r=>r.processId===p.id);
  return {...p,status:r.status,lastReviewed:year,summary:clip(r.reason),
   causes:list(r.eventIds).length?unique(r.eventIds):p.causes,nextYear:validYear(r.nextYear)&&tick(r.nextYear)>tick(year)?r.nextYear:null};
 });
 return next;
}

/** Global milestones are selected only FROM accepted ledger events. No new prose events. */
export function selectMilestones(events){
 return events.filter(e=>{
  const regions=unique(list(e.impact?.regions));
  return ['epochal','major','significant'].includes(e.significance)&&
   (regions.includes('global')||regions.length>=2)&&clip(e.impact?.mechanism);
 }).map(e=>e.id);
}

export function validateSemanticReview(review,{events,world}){
 if(!review||!['pass','revise','insufficient'].includes(review.verdict))throw new MatrixError('WORLD_REVIEW_INVALID');
 const ids=new Set(events.map(e=>e.id));
 if(list(review.unsupportedEventIds).some(id=>!ids.has(id)))throw new MatrixError('WORLD_REVIEW_INVALID');
 if(REGIONS.some(r=>!list(review.regions).some(s=>s.region===r&&clip(s.reason))))throw new MatrixError('WORLD_REVIEW_INCOMPLETE');
 if(!clip(review.densityReason)||typeof review.sufficient!=='boolean')throw new MatrixError('WORLD_REVIEW_INVALID');
 if(REVIEW_CRITERIA.some(criterion=>!list(review.rubric).some(r=>r.criterion===criterion&&
  ['pass','revise','insufficient'].includes(r.verdict)&&clip(r.reason))))throw new MatrixError('WORLD_REVIEW_INCOMPLETE');
 return review.verdict==='pass'&&review.sufficient&&!list(review.unsupportedEventIds).length&&
  !list(review.missingProcesses).length&&!list(review.issues).length&&review.rubric.every(r=>r.verdict==='pass');
}

export function sanitizeSimulation(raw){
 if(!raw||raw.version!==2||!Array.isArray(raw.snapshots)||!raw.genesis)return null;
 try{
  const data=clone(raw);
  if(JSON.stringify(data).length>12_000_000)return null;
  if(!Array.isArray(data.actions)||!Array.isArray(data.milestoneIds)||data.milestoneIds.some(x=>typeof x!=='string'))return null;
  const validState=s=>s&&validYear(s.year)&&Array.isArray(s.conditions)&&Array.isArray(s.processes)&&Array.isArray(s.regions)&&
   REGIONS.every(region=>s.regions.some(r=>r.region===region&&typeof r.summary==='string'&&Array.isArray(r.unknowns)&&Array.isArray(r.domains)));
  if(!validState(data.genesis)||data.snapshots.some(s=>!validState(s.state)))return null;
  if(!validYear(data.genesis.year)||data.snapshots.some(s=>!validYear(s.year)||!s.state||s.state.year!==s.year))return null;
  if(data.snapshots.some((s,i)=>i&&tick(s.year)<=tick(data.snapshots[i-1].year)))return null;
  return data;
 }catch{return null}
}
