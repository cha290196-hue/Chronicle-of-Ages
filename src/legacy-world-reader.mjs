/** Version-3 storage validation only; never used to judge new model output. */
import {validYear,tick,untick,LAST_YEAR,MatrixError} from './calendar.mjs';
export const REGIONS=['east-asia','south-asia','west-central-asia','europe','africa','americas','oceania'];
export const DOMAINS=['politics','economy','society','science-technology','environment','culture'];
export const CHECKPOINTS=[-1000,1,500,1000,1500,1750,1900,1950,2000,2026];
const list=x=>Array.isArray(x)?x:[];
const text=x=>typeof x==='string'?x.trim():'';
const unique=x=>[...new Set(x)];
const fail=(code,detail)=>{throw Object.assign(new MatrixError(code),{diagnostic:detail})};
export const checkpointYears=year=>CHECKPOINTS.filter(y=>tick(y)>tick(year)||y===LAST_YEAR);
const recordYear=x=>x.year??x.firstYear??x.startYear;

export function validateMacro(raw,{firstYear,actions,inherited={events:[],facts:[]},requireRegionalDomains=false}){
 if(!raw||!text(raw.title)||!text(raw.summary)||!Array.isArray(raw.conditions)||!Array.isArray(raw.events)||!raw.events.length)fail('MINUTE_STRUCTURE_INVALID','Missing title, summary or event ledger');
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
 if(requireRegionalDomains||regions.some(r=>r.domains))for(const r of regions){
  if(!Array.isArray(r.domains)||r.domains.length!==DOMAINS.length||new Set(r.domains.map(d=>d.k)).size!==DOMAINS.length||DOMAINS.some(k=>!r.domains.some(d=>d.k===k&&text(d.t)&&list(d.refs).length&&d.refs.every(id=>records.has(id)))))fail('MINUTE_REGIONAL_DOMAINS_INVALID',{region:r.r,reason:'Every region needs six substantive domain states and existing evidence refs'});
 }
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
