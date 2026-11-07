/**
 * Trusted, quantitative dynamics backend for UCM-Ω.
 * Implements structural equation intervention and bootstrap particle filtering.
 * NOT a universal physics model: coefficients, mechanisms and observations must
 * be supplied from researched/calibrated domain models. Never execute arbitrary
 * LLM/user-supplied JavaScript as structural equations.
 */
import {validYear,tick,untick,MatrixError} from './ucm-omega.mjs';

function assertYear(y){if(!validYear(y))throw new MatrixError('INVALID_YEAR');}
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const byId=x=>String(x?.id||'');

/** Compile a time-sliced acyclic SCM (contemporaneous edges form a DAG). */
export function compileSCM(nodes,{invariants=[]}={}){
 if(!Array.isArray(nodes)||!nodes.length)throw new MatrixError('EMPTY_CAUSAL_SYSTEM');
 const map=new Map();
 for(const node of nodes){
  if(!node?.id||map.has(node.id))throw new MatrixError('DUPLICATE_SCM_NODE',byId(node));
  if(typeof node.equation!=='function')throw new MatrixError('EQUATION_REQUIRED',byId(node));
  map.set(node.id,{...node,parents:[...(node.parents||[])],laggedParents:[...(node.laggedParents||[])]});
 }
 const visited=new Set(),visiting=new Set(),order=[];
 function walk(id){
  if(visited.has(id))return;
  if(visiting.has(id))throw new MatrixError('SCM_CYCLE',id);
  const node=map.get(id);if(!node)throw new MatrixError('UNKNOWN_SCM_PARENT',id);
  visiting.add(id);
  for(const parent of [...node.parents,...node.laggedParents])if(!map.has(parent))throw new MatrixError('UNKNOWN_SCM_PARENT',parent);
  for(const parent of node.parents)walk(parent);
  visiting.delete(id);visited.add(id);order.push(node);
 }
 for(const id of map.keys())walk(id);
 if(!Array.isArray(invariants)||invariants.some(f=>typeof f!=='function'))throw new MatrixError('INVALID_SCM_INVARIANTS');
 return Object.freeze({order,invariants:[...invariants],ids:[...map.keys()]});
}

function applicableIntervention(actions,node,year){
 const active=(actions||[]).filter(a=>a.target===node.id && validYear(a.startYear)
  &&tick(year)>=tick(a.startYear)
  &&(a.persistent || tick(year)<=tick(validYear(a.endYear)?a.endYear:a.startYear)));
 if(active.length>1 && active.some(a=>a.value!==active[0].value))throw new MatrixError('CONFLICTING_ACTIVE_DO',node.id);
 return active.at(-1)||null;
}

/** Evaluate one year of structural equations with optional do(X=x). */
export function stepSCM({system,previous={},year,interventions=[],exogenous={},parameters={}}){
 assertYear(year);
 if(!system?.order)throw new MatrixError('COMPILE_SCM_FIRST');
 const current={};
 for(const node of system.order){
  const action=applicableIntervention(interventions,node,year);
  if(action?.units && node.units && action.units!==node.units)throw new MatrixError('UNIT_MISMATCH',node.id);
  const parents=Object.fromEntries(node.parents.map(id=>[id,current[id]]));
  const lagged=Object.fromEntries(node.laggedParents.map(id=>[id,previous[id]]));
  if(Object.values(lagged).some(v=>!finite(v)))throw new MatrixError('MISSING_LAGGED_STATE',node.id);
  const value=action?Number(action.value):node.equation({parents,lagged,previous,year,exogenous,parameters});
  if(!finite(value))throw new MatrixError('NONFINITE_SCM_VALUE',node.id);
  if((finite(node.min)&&value<node.min)||(finite(node.max)&&value>node.max))throw new MatrixError('SCM_DOMAIN_VIOLATION',node.id);
  current[node.id]=value;
 }
 for(const invariant of system.invariants)if(invariant(current,previous,year)!==true)throw new MatrixError('SCM_INVARIANT_FAILURE');
 return Object.freeze(current);
}

/** Replay the same disturbances for baseline and intervention to compare potential outcomes. */
export function compareCounterfactuals({system,initialState={},from,to,interventions=[],exogenousByYear=()=>({}),parameters={}}){
 assertYear(from);assertYear(to);
 if(tick(to)<tick(from))throw new MatrixError('BACKWARD_SIMULATION');
 let baseline={...initialState},counterfactual={...initialState};const observations=[];
 for(let t=tick(from);t<=tick(to);t++){
  const year=untick(t),noise=exogenousByYear(year);
  baseline=stepSCM({system,previous:baseline,year,exogenous:noise,parameters});
  counterfactual=stepSCM({system,previous:counterfactual,year,interventions,exogenous:noise,parameters});
  observations.push({year,baseline,counterfactual,delta:Object.fromEntries(system.ids.map(id=>[id,counterfactual[id]-baseline[id]]))});
 }
 return observations;
}

/** Reproducible seeded PRNG; only for simulation, not for security. */
export function seededRandom(seed=1){
 let a=(Math.trunc(seed)>>>0)||1;
 return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
}
export function effectiveSampleSize(weights){
 const sum=weights.reduce((a,b)=>a+b,0);
 if(!(sum>0)||weights.some(x=>!finite(x)||x<0))throw new MatrixError('INVALID_PARTICLE_WEIGHTS');
 return sum**2/weights.reduce((a,b)=>a+b*b,0);
}
export function systematicResample(items,weights,random=seededRandom(1)){
 if(!Array.isArray(items)||!items.length||items.length!==weights.length)throw new MatrixError('INVALID_PARTICLE_SET');
 const total=weights.reduce((a,b)=>a+b,0);
 if(!(total>0)||weights.some(w=>!finite(w)||w<0))throw new MatrixError('INVALID_PARTICLE_WEIGHTS');
 const result=[];let i=0,c=weights[0]/total;
 const offset=random()/items.length;
 for(let j=0;j<items.length;j++){
  const u=offset+j/items.length;
  while(u>c && i<items.length-1){i++;c+=weights[i]/total;}
  result.push(structuredClone(items[i]));
 }
 return result;
}

/**
 * Bootstrap SMC: transition must sample a state from a real assumed dynamic model;
 * likelihood must derive from observed measurements with defensible error models.
 * Returns filtering samples, not a truth-certified historical counterfactual.
 */
export function particleFilter({initialParticles,observations=[],transition,likelihood,seed=1,essFraction=.5,onProgress=()=>{}}){
 if(!Array.isArray(initialParticles)||!initialParticles.length||initialParticles.length>10000)throw new MatrixError('INVALID_PARTICLE_SET');
 if(typeof transition!=='function'||typeof likelihood!=='function')throw new MatrixError('PARTICLE_CALLBACKS_REQUIRED');
 if(!(essFraction>0&&essFraction<=1))throw new MatrixError('INVALID_ESS_THRESHOLD');
 const random=seededRandom(seed),n=initialParticles.length;
 let particles=initialParticles.map(p=>structuredClone(p)),weights=Array(n).fill(1/n);
 const chronological=[...observations].sort((a,b)=>tick(a.year)-tick(b.year));
 const diagnostics=[];
 for(const observation of chronological){
  assertYear(observation.year);
  particles=particles.map((p,i)=>{
   const next=transition(p,observation.year,random,i);
   if(next===undefined||next===null)throw new MatrixError('INVALID_PARTICLE_TRANSITION');
   return next;
  });
  const logWeights=particles.map((p,i)=>{
   const prob=likelihood(p,observation.value,observation.year);
   if(!finite(prob)||prob<0)throw new MatrixError('INVALID_OBSERVATION_LIKELIHOOD');
   return prob>0&&weights[i]>0?Math.log(prob)+Math.log(weights[i]):-Infinity;
  });
  const max=Math.max(...logWeights);
  if(!Number.isFinite(max))throw new MatrixError('ZERO_OBSERVATION_SUPPORT');
  const unscaled=logWeights.map(w=>Math.exp(w-max)),normalizer=unscaled.reduce((a,b)=>a+b,0);
  weights=unscaled.map(w=>w/normalizer);
  const ess=effectiveSampleSize(weights);
  const didResample=ess<n*essFraction;
  diagnostics.push({year:observation.year,ess,particleCount:n,resampled:didResample});
  if(didResample){particles=systematicResample(particles,weights,random);weights=Array(n).fill(1/n);}
  onProgress({year:observation.year,ess,resampled:didResample});
 }
 return {particles,weights,diagnostics,
  interpretation:'Posterior samples are meaningful only if transition laws and observation likelihoods are calibrated to evidence.'};
}