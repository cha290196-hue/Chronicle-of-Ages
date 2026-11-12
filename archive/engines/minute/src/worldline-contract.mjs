/** Calendar, immutable intervention and lineage contracts; no model calls or history generator. */
export const FIRST_YEAR=-3200,LAST_YEAR=2026;
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

