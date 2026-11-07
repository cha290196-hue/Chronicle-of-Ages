import test from 'node:test';
import assert from 'node:assert/strict';
import {
 validYear,tick,untick,compileInterventions,resolveAncestry,adaptiveWindows,
 auditBatch,runMatrix,toLegacyWorldline,evaluateScenario
} from '../src/ucm-omega.mjs';

const op=(year=1234,extra={})=>({kind:'earth_intrusion',scope:'earth',mode:'point',startYear:year,target:'Arrival on Earth',value:'yes',...extra});
const fact=(id,year,extra={})=>({id,firstYear:year,nameEn:id,origin:'derived',...extra});
const event=(id,year,causes,extra={})=>({id,year,en:id,causes,category:'society',...extra});
const window={from:1234,to:1400};

test('BCE to CE years remain consecutive and never manufacture year 0',()=>{
 assert.ok(!validYear(0));assert.equal(tick(-1),0);assert.equal(tick(1),1);
 assert.equal(untick(0),-1);assert.equal(untick(1),1);
 const windows=adaptiveWindows(-10,10,{maxWindows:5});
 assert.equal(windows[0].from,-10);assert.equal(windows.at(-1).to,10);
 for(let i=1;i<windows.length;i++)assert.equal(tick(windows[i].from),tick(windows[i-1].to)+1);
});

test('all interventions must be explicitly Earth-anchored and properly typed',()=>{
 assert.throws(()=>compileInterventions({operations:[{...op(),scope:'mars'}]}),/NOT_EARTH_ANCHORED/);
 assert.throws(()=>compileInterventions({operations:[{...op(),startYear:0}]}),/INVALID_YEAR/);
 assert.throws(()=>compileInterventions({operations:[{...op(),kind:'branch_fact'}]}),/UNKNOWN_BRANCH_FACT/);
 assert.throws(()=>compileInterventions({operations:[{...op(),kind:'physical_constant',scope:'universe'}]}),/PHYSICAL_UNITS_REQUIRED/);
 assert.equal(compileInterventions({operations:[{...op(),kind:'physical_constant',scope:'universe',units:'m/s'}]})[0].kind,'physical_constant');
 assert.throws(()=>compileInterventions({operations:[{...op(),startYear:100}]},{parentAnchor:1234}),/ANCHOR_PRECEDES_PARENT/);
});

test('gradual change requires onset and establishment years; point remains discrete',()=>{
 assert.throws(()=>compileInterventions({operations:[op(800,{mode:'gradual',endYear:800})]}),/INVALID_TIME_RANGE/);
 const a=compileInterventions({operations:[op(870,{mode:'gradual',endYear:908})]});
 assert.deepEqual([a[0].startYear,a[0].endYear,a[0].mode],[870,908,'gradual']);
 const b=compileInterventions({operations:[op(900,{mode:'point',endYear:901})]});
 assert.equal(b[0].endYear,900);
});

test('contradictory overlapping edits to the same target are rejected',()=>{
 assert.throws(()=>compileInterventions({operations:[op(200,{target:'X',value:1}),op(200,{target:'X',value:2})]}),/CONTRADICTORY_INTERVENTIONS/);
 assert.equal(compileInterventions({operations:[op(200,{target:'X',value:1}),op(210,{target:'X',value:2})]}).length,2);
});

test('root A remains unchanged and child C inherits only effective pre-fork events',()=>{
 const baseline=[event('real-before',100,['sample'],{origin:'recorded'}),event('real-after',500,['sample'],{origin:'recorded'})];
 const a={id:'B',parentId:null,anchorYear:200,events:[event('b1',250,['intervention:1']),event('b2',600,['b1'])],facts:[fact('f-b',300)]};
 const b={id:'C',parentId:'B',anchorYear:400,events:[event('c1',420,['b1'])],facts:[]};
 const snap=resolveAncestry({baseline,branches:[a,b],parentId:'C',atYear:450});
 assert.deepEqual(snap.events.map(x=>x.id),['real-before','b1','c1']);
 assert.deepEqual(snap.facts.map(x=>x.id),['f-b']);
 assert.deepEqual(baseline.map(x=>x.id),['real-before','real-after']);
 assert.deepEqual(snap.ancestry,['B','C']);
});

test('broken ancestry and worldline cycles fail closed',()=>{
 assert.throws(()=>resolveAncestry({branches:[{id:'B',parentId:'missing',anchorYear:200}],parentId:'B',atYear:300}),/BROKEN_WORLDLINE_ANCESTRY/);
 assert.throws(()=>resolveAncestry({branches:[{id:'B',parentId:'C',anchorYear:200},{id:'C',parentId:'B',anchorYear:201}],parentId:'C',atYear:300}),/WORLDLINE_CYCLE/);
});

test('causal graph accepts resolved multi-hop chains, rejects retrocausality and missing causes',()=>{
 const proposal={events:[event('e1',1234,['intervention:1']),event('e2',1240,['e1'])]};
 const actions=compileInterventions({operations:[op()]});
 const good=auditBatch({proposal,window,actions});
 assert.deepEqual(good.events.map(x=>x.id),['e1','e2']);
 const bad=auditBatch({proposal:{events:[event('future',1236,['intervention:1']),event('past',1234,['future']),event('unknown',1300,['invented'])]},window,actions});
 assert.equal(bad.events.length,1);
 assert.deepEqual(new Set(bad.rejected.map(x=>x.reason)),new Set(['CAUSE_IN_FUTURE','UNKNOWN_CAUSE']));
});

test('same-year cycle is rejected and invalid descendants are not silently accepted',()=>{
 const actions=compileInterventions({operations:[op()]});
 const res=auditBatch({proposal:{events:[event('x',1234,['y']),event('y',1234,['x']),event('z',1235,['y'])]},window,actions});
 assert.equal(res.events.length,0);
 assert.ok(res.rejected.length>=3);
});

test('unknown or future prerequisites and invalid resource balances are rejected',()=>{
 const actions=compileInterventions({operations:[op()]});
 const p={events:[event('x',1250,['intervention:1'],{requires:['steam-engine']}),event('y',1250,['intervention:1'],{resourceBalance:{grain:-1}})]};
 const out=auditBatch({proposal:p,window,actions,knownFacts:[fact('steam-engine',1300)]});
 assert.equal(out.events.length,0);
 assert.deepEqual(new Set(out.rejected.map(x=>x.reason)),new Set(['PREREQUISITE_IN_FUTURE','INVALID_RESOURCE_BALANCE']));
});

test('interval facts cannot assert conflicting values simultaneously',()=>{
 const out=auditBatch({proposal:{events:[],facts:[fact('a',1250,{exclusiveKey:'state:rome',value:'republic'}),fact('b',1260,{exclusiveKey:'state:rome',value:'empire'})]},window});
 assert.deepEqual(out.facts.map(x=>x.id),['a']);
 assert.equal(out.rejected[0].reason,'EXCLUSIVE_FACT_CONFLICT');
});

test('ensemble generates independent proposals, auditable alternatives, legacy worldline',async()=>{
 const calls=[];
 const interpretation={operations:[op(1234)]};
 const result=await runMatrix({interpretation,baseline:[],scenarioCount:2,maxWindows:3,
  propose:async ({scenario,window,allowedCauseIds,repairReasons})=>{
   calls.push({scenario,window,repairReasons});
   const id=`s${scenario}-y${window.from}`;
   return {events:[event(id,window.from,[allowedCauseIds[0]])],facts:[fact(`f${scenario}-${window.from}`,window.from)]};
  }});
 assert.equal(calls.length,6);
 assert.equal(result.preferred.events.length,3);
 assert.equal(result.alternatives.length,1);
 assert.match(result.evaluation,/not a probability/);
 const branch=toLegacyWorldline(result,{id:'B',prompt:'In 1234 aliens land on Earth'});
 assert.equal(branch.anchorYear,1234);assert.equal(branch.parentId,null);
 assert.equal(branch.events.length,3);assert.equal(branch.omega.scenarios,2);
 assert.equal(branch.certainty,'low');
 assert.ok(evaluateScenario(result.preferred).score<=200);
});

test('failed generation triggers one repair attempt, and cancellation prevents more work',async()=>{
 let calls=0;
 const result=await runMatrix({interpretation:{operations:[op()]},scenarioCount:1,maxWindows:1,
  propose:async state=>{calls++;return state.repairAttempt?{events:[event('fixed',state.window.from,['intervention:1'])]}:{events:[event('bad',state.window.from,['no-such-id'])]}}});
 assert.equal(calls,2);
 assert.deepEqual(result.preferred.events.map(x=>x.id),['fixed']);
 const signal={aborted:true};
 await assert.rejects(()=>runMatrix({interpretation:{operations:[op()]},propose:async()=>({}),signal}),/ABORTED/);
});

test('rejected facts invalidate dependent events transitively',()=>{
 const a=compileInterventions({operations:[op()]});
 const known=[fact('existing',1234,{exclusiveKey:'state:x',value:'on'})];
 const p={events:[event('depends',1250,['intervention:1'],{requires:['contradicting']}),event('downstream',1260,['depends'])],facts:[fact('contradicting',1240,{exclusiveKey:'state:x',value:'off'})]};
 const r=auditBatch({proposal:p,window,knownFacts:known,actions:a});
 assert.deepEqual(r.events,[]);
 assert.equal(r.facts.length,0);
 assert.ok(r.rejected.some(x=>x.reason==='UNSATISFIED_DEPENDENCY'));
});