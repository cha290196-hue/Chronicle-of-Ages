import {validYear,tick,untick,LAST_YEAR,MatrixError} from './worldline-contract.mjs';
export const REGIONS=['east-asia','south-asia','west-central-asia','europe','africa','americas','oceania'];
export const DOMAINS=['politics','economy','society','science-technology','environment','culture'];
export const CHECKPOINTS=[-1000,1,500,1000,1500,1750,1900,1950,2000,2026];
const list=x=>Array.isArray(x)?x:[];
const text=x=>typeof x==='string'?x.trim():'';
const copy=x=>JSON.parse(JSON.stringify(x));
const unique=x=>[...new Set(x)];
const fail=(code,detail)=>{throw Object.assign(new MatrixError(code),{diagnostic:detail})};
export const checkpointYears=year=>CHECKPOINTS.filter(y=>tick(y)>tick(year)||y===LAST_YEAR);
const recordYear=x=>x.year??x.firstYear??x.startYear;
const category=k=>({'science-technology':'technology',politics:'governance',economy:'society',environment:'other',society:'society',culture:'culture'}[k]||'other');

/** Flatten the seven regional trajectories into the single canonical causal ledger. */
export function assembleMacro(raw,firstYear){
 if(!raw)return raw;
 const next=copy(raw);
 if(validYear(firstYear))next.conditions=list(next.conditions).map(b=>({...b,y:b.y??firstYear}));
 if(!Array.isArray(next.trajectories)||next.trajectories.every(t=>Array.isArray(t.eventIds)&&!t.events))return next;
 next.events=[...next.trajectories.flatMap(t=>list(t.events)),...list(next.effects)];
 next.trajectories=next.trajectories.map(t=>({r:t.r,eventIds:list(t.events).map(e=>e.id),quiet:t.quiet||null,refs:list(t.refs)}));
 delete next.effects;return next;
}

/** Checkpoints are projections of accepted records, never a second generated history. */
export function materializePeriods(raw,firstYear){
 if(!raw||!Array.isArray(raw.events))return raw;
 const next=copy(raw);let from=firstYear;
 next.periods=checkpointYears(firstYear).map(to=>{
  const rows=next.events.filter(e=>validYear(e.y)&&tick(e.y)>=tick(from)&&tick(e.y)<=tick(to));
  const quiet=list(next.quietPeriods).find(p=>p.to===to);
  const p=rows.length?{to,t:rows.map(e=>e.t).join('；'),refs:rows.map(e=>e.id),quiet:null}:{to,t:text(quiet?.t),refs:list(quiet?.refs),quiet:text(quiet?.t)||null};
  from=to===LAST_YEAR?LAST_YEAR:untick(tick(to)+1);return p;
 });
 return next;
}

/** Collect independent defects so the single audit can fix more than the first thrown error. */
export function structuralIssues(raw,firstYear){
 const out=[],events=list(raw?.events),records=new Map([...list(raw?.conditions),...events].map(r=>[r.id,r]));
 for(const b of list(raw?.conditions))if(!validYear(b.y)||tick(b.y)>tick(firstYear))out.push({code:'BACKGROUND_AFTER_FORK',id:b.id,year:b.y,forkYear:firstYear});
 for(const e of events)for(const id of list(e.c)){const p=records.get(id);if(p&&validYear(p.y)&&validYear(e.y)&&tick(p.y)>tick(e.y))out.push({code:'FUTURE_CAUSE',id:e.id,cause:id,eventYear:e.y,causeYear:p.y});}
 for(const p of list(raw?.periods))if(!text(p.t)||!list(p.refs).length)out.push({code:'UNCOVERED_INTERVAL',to:p.to,reason:'No interval event or evidenced quietPeriods explanation; supply a justified quiet explanation or a supported event, never filler.'});
 return out;
}

/** One typed DAG unifies background conditions, interventions, inherited knowledge and events. */
export function validateMacro(raw,{firstYear,actions,inherited={events:[],facts:[]}}){
 if(!raw||!text(raw.title)||!text(raw.summary)||!Array.isArray(raw.conditions)||!Array.isArray(raw.events)||!raw.events.length||raw.events.length>80)fail('MINUTE_STRUCTURE_INVALID','Missing title, summary or event ledger');
 const records=new Map([...list(inherited.events),...list(inherited.facts),...actions].map(r=>[r.id,r]));
 const local=new Set(),events=new Map();
 const idOkay=id=>typeof id==='string'&&/^[\w:.-]{1,120}$/.test(id)&&!records.has(id)&&!local.has(id);
 for(const b of raw.conditions){
  if(!idOkay(b.id)||!validYear(b.y)||tick(b.y)>tick(firstYear)||!text(b.t)||!DOMAINS.includes(b.k)||!list(b.r).length||b.r.some(r=>![...REGIONS,'global'].includes(r)))fail('MINUTE_BACKGROUND_INVALID',b.id);
  local.add(b.id);records.set(b.id,{...b,year:b.y,firstYear:b.y});
 }
 for(const e of raw.events){
  if(!idOkay(e.id)||!validYear(e.y)||tick(e.y)<tick(firstYear)||tick(e.y)>tick(LAST_YEAR)||!text(e.t)||text(e.d).length<12||!DOMAINS.includes(e.k)||!Number.isInteger(e.s)||e.s<1||e.s>4||!list(e.c).length||!list(e.r).length||e.r.some(r=>![...REGIONS,'global'].includes(r)))fail('MINUTE_EVENT_INVALID',{id:e.id,reason:records.has(e.id)?'Event ID collides with an intervention/background/inherited record':local.has(e.id)?'Duplicate local ID':'Check event year, title, description length >=12, domain, significance 1..4, nonempty causes and allowed region IDs'});
  local.add(e.id);events.set(e.id,e);records.set(e.id,{...e,year:e.y});
 }
 const visiting=new Set(),done=new Set(),ordered=[],descends=new Map();
 function visit(id){
  if(done.has(id))return;if(visiting.has(id))fail('MINUTE_CAUSAL_CYCLE',id);visiting.add(id);
  const e=events.get(id);let affected=false;
  for(const c of unique(e.c)){
   const parent=records.get(c);if(!parent)fail('MINUTE_UNKNOWN_CAUSE',{event:id,cause:c});
   if(!validYear(recordYear(parent))||tick(recordYear(parent))>tick(e.y))fail('MINUTE_FUTURE_CAUSE',{event:id,cause:c});
   if(events.has(c)){visit(c);affected=affected||descends.get(c);}else affected=affected||actions.some(a=>a.id===c);
  }
  descends.set(id,!!affected);visiting.delete(id);done.add(id);ordered.push(e);
 }
 for(const id of events.keys())visit(id);
 for(const a of actions)if(!ordered.some(e=>e.c.includes(a.id)))fail('MINUTE_INTERVENTION_UNUSED',a.id);
 if(!Array.isArray(raw.trajectories))fail('MINUTE_TRAJECTORIES_INVALID','Missing the seven regional trajectories');
 {
  const tracks=list(raw.trajectories);
  if(tracks.length!==REGIONS.length||new Set(tracks.map(t=>t.r)).size!==REGIONS.length||REGIONS.some(r=>!tracks.some(t=>t.r===r)))fail('MINUTE_TRAJECTORIES_INVALID','Every region needs its own trajectory');
  for(const t of tracks){
   if(!list(t.eventIds).length&&(!text(t.quiet)||!list(t.refs).length||t.refs.some(id=>!records.has(id))))fail('MINUTE_TRAJECTORIES_INVALID',t.r);
   for(const id of list(t.eventIds))if(!events.has(id)||descends.get(id)||!events.get(id).r.some(r=>r===t.r||r==='global'))fail('MINUTE_TRAJECTORIES_INVALID',id);
  }
 }
 const regions=list(raw.regions);
 if(regions.length!==REGIONS.length||new Set(regions.map(r=>r.r)).size!==REGIONS.length||REGIONS.some(r=>!regions.some(x=>x.r===r&&text(x.t)&&list(x.refs).length&&x.refs.every(id=>records.has(id)))))fail('MINUTE_WORLD_COVERAGE_INVALID','All regions need supported endpoint states');
 if(DOMAINS.some(d=>!text(raw.setting?.[d])))fail('MINUTE_SETTING_INVALID','Six global domains are required');
 const ends=checkpointYears(firstYear),periods=list(raw.periods);
 if(periods.length!==ends.length||periods.some((p,i)=>p.to!==ends[i]||!text(p.t)||!list(p.refs).length||p.refs.some(id=>!records.has(id)||tick(recordYear(records.get(id)))>tick(p.to))))fail('MINUTE_TEMPORAL_COVERAGE_INVALID','All checkpoints need temporally valid evidence');
 let from=firstYear;
 for(const p of periods){
  const active=p.refs.some(id=>events.has(id)&&tick(events.get(id).y)>=tick(from));
  if(!active&&!text(p.quiet))fail('MINUTE_TEMPORAL_COVERAGE_INVALID',{to:p.to,reason:'Neither interval events nor a quiet explanation'});
  from=p.to===LAST_YEAR?LAST_YEAR:untick(tick(p.to)+1);
 }
 ordered.sort((a,b)=>tick(a.y)-tick(b.y));
 // Propagate only along accepted causal links: a locally originating event can
 // have world significance through effects actually realized later in this ledger.
 const reach=new Map(ordered.map(e=>[e.id,new Set(e.r.includes('global')?REGIONS:e.r)]));
 for(const e of [...ordered].reverse())for(const id of e.c)if(events.has(id))for(const r of reach.get(e.id))reach.get(id).add(r);
 const milestones=ordered.filter(e=>e.s>=3&&reach.get(e.id).size>=2);
 if(tick(LAST_YEAR)-tick(firstYear)>20&&!milestones.length)fail('MINUTE_NO_MILESTONES','Long global histories need meaningful world events');
 return {ordered,records,descends,milestones,periods,regions,reach};
}

/** Apply explicit ID-level corrections, then the SAME complete graph/coverage checks run again. */
export function applyMacroEdits(raw,edits){
 if(!edits||typeof edits!=='object')fail('MINUTE_REVIEW_INVALID','No explicit repair');
 const next=copy(raw),drop=new Set(list(edits.drop));
 if(drop.size&&[...drop].some(id=>![...list(raw.events),...list(raw.conditions)].some(e=>e.id===id)))fail('MINUTE_REVIEW_INVALID','Only local event or background IDs may be removed');
 for(const key of ['events','conditions']){
  const changes=list(edits[key]);if(new Set(changes.map(r=>r.id)).size!==changes.length)fail('MINUTE_REVIEW_INVALID','Duplicate edits');
  next[key]=[...new Map([...list(next[key]).filter(r=>!drop.has(r.id)),...changes].map(r=>[r.id,r])).values()];
 }
 if(edits.regions)next.regions=[...new Map([...list(next.regions),...list(edits.regions)].map(r=>[r.r,r])).values()];
 if(list(edits.quietPeriods).length)next.quietPeriods=copy(edits.quietPeriods);
 if(list(edits.trajectories).length)next.trajectories=copy(edits.trajectories);
 if(edits.setting)next.setting={...next.setting,...edits.setting};
 for(const key of ['title','summary'])if(edits[key]!==undefined&&edits[key]!==null)next[key]=edits[key];
 return next;
}

export function buildMinuteWorld({raw,checked,assessment,actions,inherited,firstYear,parentId,prompt,lang,runId,review,timing}){
 const idMap=new Map([...raw.conditions.map(b=>[b.id,'background:'+runId+':'+b.id]),...checked.ordered.map(e=>[e.id,'event:'+runId+':'+e.id]),...actions.map((a,i)=>[a.id,'intervention:'+runId+':'+(i+1)])]);
 const ref=id=>idMap.get(id)||id;
 const conditions=raw.conditions.map(b=>({id:ref(b.id),year:b.y,firstYear:b.y,en:b.t,zh:b.t,nameEn:b.t,nameZh:b.t,descriptionEn:b.t,descriptionZh:b.t,region:b.r[0],regions:b.r,domain:b.k,origin:'background',status:'model-background',basis:'Unverified model-recalled historical background',provenance:{kind:'model-background',verified:false},causes:[]}));
 const finalActions=actions.map(a=>({...a,id:ref(a.id)}));
 const milestoneIds=checked.milestones.map(e=>ref(e.id));
 const events=checked.ordered.map(e=>({id:ref(e.id),year:e.y,en:e.t,zh:e.t,descriptionEn:e.d,descriptionZh:e.d,causes:unique(e.c).map(ref),links:unique(e.c).map(id=>({causeId:ref(id),mechanism:e.d,support:'supported-inference'})),requires:[],assumptions:[],category:category(e.k),domain:e.k,region:e.r.find(r=>r!=='global')||'global',scope:e.r.includes('global')?'global':unique(e.r).length>1?'transregional':'regional',significance:['minor','moderate','significant','major','epochal'][e.s],relationToIntervention:actions.some(a=>e.c.includes(a.id))?'direct':checked.descends.get(e.id)?'indirect':'independent',impact:{regions:e.r,domains:[e.k],mechanism:e.d},origin:'derived',certainty:'conditional',worldImpact:{regions:[...checked.reach.get(e.id)],basis:'accepted-causal-descendants'},milestone:milestoneIds.includes(ref(e.id))}));
 const lineageRoots=inherited.events.filter(r=>r.origin==='background'||r.startYear!==undefined);
 const inheritedEvents=inherited.events.filter(r=>!lineageRoots.includes(r));
 const localRecords=[...conditions,...inherited.events,...inherited.facts];
 function state(year,final=false,includeEvents=true){
  const available=[...localRecords,...(includeEvents?events.filter(e=>tick(e.year)<=tick(year)):[])];
  const covers=(r,region)=>r.region===region||r.region==='global'||r.regions?.includes(region)||r.impact?.regions?.includes(region)||r.impact?.regions?.includes('global');
  const regions=REGIONS.map(region=>{
   const rows=available.filter(r=>covers(r,region)),ending=raw.regions.find(r=>r.r===region),last=rows.slice(-2);
   return {region,summary:final?ending.t:last.map(r=>r.descriptionZh||r.zh||r.nameZh||r.en).join('；')||'Unknown at this checkpoint',evidenceIds:final?ending.refs.map(ref):last.map(r=>r.id),unknowns:final?list(ending.unknowns):[],domains:DOMAINS.map(domain=>{
    const records=rows.filter(r=>(r.domain===domain||r.impact?.domains?.includes(domain))).slice(-2);
    return {domain,summary:records.map(r=>r.descriptionZh||r.zh||r.nameZh||r.en).join('；')||'Not resolved at this checkpoint',evidenceIds:records.map(r=>r.id),status:records.length?'uncertain':'unknown'};
   })};
  });
  return {version:3,year,conditions:[...lineageRoots,...conditions],regions,processes:REGIONS.map(region=>({id:'process:'+runId+':'+region,region,domain:'society',description:regions.find(r=>r.region===region).summary,causes:regions.find(r=>r.region===region).evidenceIds,status:'conditional',lastReviewed:year})),extinction:null};
 }
 const genesis=state(firstYear,false,false);
 const snapshots=checked.periods.map(p=>({year:p.to,window:{from:firstYear,to:p.to},state:state(p.to,p.to===LAST_YEAR),eventIds:events.filter(e=>tick(e.year)<=tick(p.to)).map(e=>e.id),summary:p.t,quiet:p.quiet||null}));
 const facts=DOMAINS.map((domain,i)=>({id:'setting:'+runId+':'+i,firstYear:LAST_YEAR,nameEn:domain,nameZh:domain,descriptionEn:raw.setting[domain],descriptionZh:raw.setting[domain],kind:'world-setting',origin:'derived',certainty:'conditional',evidenceIds:events.filter(e=>e.domain===domain).map(e=>e.id)}));
 return {id:runId,parentId,anchorYear:firstYear,timeMode:actions[0].mode,transitionEndYear:actions[0].endYear,timeBasisEn:actions[0].temporalBasis,timeBasisZh:actions[0].temporalBasis,prompt,type:actions[0].kind,titleEn:raw.title,titleZh:raw.title,summaryEn:raw.summary,summaryZh:raw.summary,createdAt:new Date().toISOString(),events,facts,knowledge:[],inherited:{events:inheritedEvents,facts:inherited.facts},impacts:[],certainty:'conditional',image:null,
  simulation:{version:3,engine:'Chronicle Minute',resolution:'macro',textLanguage:lang,referenceYears:[...inherited.events,...inherited.facts].map(r=>({id:r.id,year:recordYear(r)})),actions:finalActions,genesis,snapshots,milestoneIds,completedThrough:LAST_YEAR,fullEventCount:events.length,worldRegions:REGIONS,setting:raw.setting,limits:list(raw.limits),quality:{status:'reviewed',review},timing,graph:copy(raw),admission:{...assessment,autoComplete:timing.autoComplete}}};
}
