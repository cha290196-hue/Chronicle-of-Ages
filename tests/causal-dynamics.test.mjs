import test from 'node:test';
import assert from 'node:assert/strict';
import {compileSCM,stepSCM,compareCounterfactuals,seededRandom,effectiveSampleSize,systematicResample,particleFilter} from '../src/causal-dynamics.mjs';

const system=compileSCM([
 {id:'rain',equation:({exogenous})=>exogenous.rain??2,units:'mm'},
 {id:'food',parents:['rain'],equation:({parents})=>parents.rain*3,min:0,units:'kg'},
 {id:'population',parents:['food'],laggedParents:['population'],equation:({parents,lagged})=>lagged.population+parents.food,min:0}
],{invariants:[state=>state.food>=0&&state.population>=0]});

test('SCM enforces causal topological order and explicit temporal feedback',()=>{
 assert.deepEqual(system.ids,['rain','food','population']);
 const state=stepSCM({system,previous:{population:10},year:100});
 assert.deepEqual(state,{rain:2,food:6,population:16});
 assert.throws(()=>compileSCM([{id:'a',parents:['b'],equation:()=>1},{id:'b',parents:['a'],equation:()=>2}]),/SCM_CYCLE/);
 assert.throws(()=>stepSCM({system,previous:{},year:100}),/MISSING_LAGGED_STATE/);
});

test('do-intervention changes a variable and propagates through dependent equations',()=>{
 const action={target:'rain',startYear:101,endYear:101,value:10,units:'mm'};
 const worlds=compareCounterfactuals({system,initialState:{population:10},from:100,to:103,interventions:[action]});
 assert.equal(worlds[0].delta.population,0);
 assert.equal(worlds[1].counterfactual.population-worlds[1].baseline.population,24);
 assert.equal(worlds[3].delta.population,24);
 assert.deepEqual(worlds.map(x=>x.year),[100,101,102,103]);
});

test('SCM checks units, finite quantities and trusted invariants',()=>{
 assert.throws(()=>stepSCM({system,previous:{population:10},year:101,interventions:[{target:'rain',startYear:101,value:10,units:'seconds'}]}),/UNIT_MISMATCH/);
 assert.throws(()=>stepSCM({system,previous:{population:10},year:101,interventions:[{target:'rain',startYear:101,value:-2}]}),/SCM_DOMAIN_VIOLATION|SCM_INVARIANT_FAILURE/);
 assert.throws(()=>stepSCM({system:compileSCM([{id:'bad',equation:()=>NaN}]),year:101}),/NONFINITE_SCM_VALUE/);
});

test('seeded sampling and systematic resampling are reproducible',()=>{
 const first=seededRandom(17),second=seededRandom(17);
 assert.deepEqual([first(),first(),first()],[second(),second(),second()]);
 assert.equal(effectiveSampleSize([.25,.25,.25,.25]),4);
 assert.ok(effectiveSampleSize([.97,.01,.01,.01])<1.1);
 const a=systematicResample([1,2,3,4],[.97,.01,.01,.01],seededRandom(10));
 const b=systematicResample([1,2,3,4],[.97,.01,.01,.01],seededRandom(10));
 assert.deepEqual(a,b);
 assert.ok(a.every(x=>x===1));
});

test('particle filter only computes weights from supplied observational likelihoods',()=>{
 const args={initialParticles:[{x:0},{x:1},{x:2},{x:3}],observations:[{year:1234,value:2},{year:1235,value:3}],seed:19,
  transition:(state)=>({x:state.x+1}),
  likelihood:(state,obs)=>Math.exp(-.5*(state.x-obs)**2)};
 const a=particleFilter(args),b=particleFilter(args);
 assert.deepEqual(a,b);
 assert.equal(a.diagnostics.length,2);
 assert.equal(a.weights.reduce((x,y)=>x+y),1);
 assert.match(a.interpretation,/only if/);
 assert.throws(()=>particleFilter({...args,likelihood:()=>0}),/ZERO_OBSERVATION_SUPPORT/);
});