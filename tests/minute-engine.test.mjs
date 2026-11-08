import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateMinute,minuteModelConfig} from '../src/minute-simulation.mjs';
import {simulate,sanitizeWorldline,worldEvents,callChat,explainError} from '../src/core.js';
import {validateMacro,assembleMacro,materializePeriods,applyMacroEdits,checkpointYears} from '../src/minute-world.mjs';
import {compileInterventions,tick,untick,resolveAncestry} from '../src/worldline-contract.mjs';
import {stateAt} from '../src/world-model.mjs';
import {admission,macro,review,minuteChat,clone} from './fixtures/minute-world.mjs';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const args=(extra={})=>({prompt:'公元1024年发生重大制度改变',makeId:()=> 'test-world',autoComplete:true,callChat:minuteChat(),...extra});
const validate=w=>validateMacro(w,{firstYear:1024,actions:compileInterventions(admission()).map((a,i)=>({...a,id:'intervention:'+(i+1)}))});

test('complete public flow uses two bounded calls, full horizon, causal ledger and persistent round trip',async()=>{
 const calls=[];const {worldline:w}=await simulateMinute(args({callChat:minuteChat({calls})}));
 assert.deepEqual(calls.map(x=>x.options.stage),['minute-world','minute-review']);
 assert.deepEqual(calls.map(x=>[x.options.profile,x.options.reasoning,x.options.maxTokens]),[['minute',false,7600],['minute',false,2800]]);
 assert.equal(w.anchorYear,1024);assert.equal(w.simulation.completedThrough,2026);assert.equal(w.simulation.timing.completed,true);
 assert.equal(w.simulation.snapshots.at(-1).year,2026);assert.equal(w.simulation.snapshots.at(-1).state.regions.length,7);
 assert.ok(w.events.some(e=>e.relationToIntervention==='independent'));assert.ok(w.simulation.milestoneIds.length);
 assert.equal(w.events.find(e=>e.id.endsWith(':e1')).causes.some(id=>id.startsWith('background:')),true);
 assert.equal(sanitizeWorldline(w)?.simulation.version,3);
 assert.equal(worldEvents([w],w).filter(e=>e.year>=w.anchorYear).some(e=>e.origin==='recorded'),false);
});
test('checkpoint states exclude later history and genesis excludes generated same-year outcomes',async()=>{
 const {worldline:w}=await simulateMinute(args());
 assert.ok(!JSON.stringify(w.simulation.genesis).includes('Autonomous regional development'));
 const s=stateAt(w.simulation,1600);assert.equal(s.year,1500);
 const serialized=JSON.stringify(s);assert.ok(!serialized.includes('Conditional macro development 2'));
 assert.equal(stateAt(w.simulation,1000),null);assert.equal(stateAt(w.simulation,2026).year,2026);
});
test('calendar has no year zero and checkpoint list covers ancient and endpoint forks',()=>{
 assert.equal(untick(tick(-1)+1),1);assert.deepEqual(checkpointYears(2026),[2026]);
 assert.deepEqual(checkpointYears(30),[500,1000,1500,1750,1900,1950,2000,2026]);assert.throws(()=>tick(0));
});
test('cycle, future and missing prerequisite references fail in one unified DAG',()=>{
 const w=macro();w.events[0].c=['e2'];assert.throws(()=>validate(w),/MINUTE_FUTURE_CAUSE/);
 w.events[0].c=['nonexistent'];assert.throws(()=>validate(w),/MINUTE_UNKNOWN_CAUSE/);
 w.events[0].c=['autonomous'];w.events.at(-1).y=w.events[0].y;w.events.at(-1).c=['e1'];assert.throws(()=>validate(w),/MINUTE_CAUSAL_CYCLE/);
});
test('world coverage, temporal coverage, domain coverage and unsupported quiet gaps are checked',()=>{
 for(const change of [w=>w.regions.pop(),w=>w.periods.pop(),w=>delete w.setting.culture,w=>{w.periods[1].refs=['b1'];w.periods[1].quiet=null;}]){const w=macro();change(w);assert.throws(()=>validate(w),/MINUTE_/);}
 const w=macro();w.periods[1].refs=['b1'];w.periods[1].quiet='No additional supported milestone is resolved in this interval';assert.doesNotThrow(()=>validate(w));
});
test('review repairs actual IDs once and complete graph is revalidated',async()=>{
 const draft={admission:admission(),world:macro()};draft.world.events[0].c=['bad'];const check={...review(),verdict:'repair',edits:{events:[macro().events[0]]}};
 const {worldline:w}=await simulateMinute(args({callChat:minuteChat({draft,check})}));assert.equal(w.simulation.quality.review.verdict,'repair');
 check.edits={drop:['e1']};await assert.rejects(()=>simulateMinute(args({callChat:minuteChat({draft,check})})),/MINUTE_UNKNOWN_CAUSE/);
 assert.throws(()=>applyMacroEdits(macro(),{drop:['intervention:1']}),/MINUTE_REVIEW_INVALID/);
});
test('rubber-stamp review cannot override structural failures or negative content checks',async()=>{
 const draft={admission:admission(),world:macro()};draft.world.events[0].c=['bad'];
 await assert.rejects(()=>simulateMinute(args({callChat:minuteChat({draft})})),/MINUTE_REVIEW_INVALID/);
 const check=review();check.checks.causality=false;await assert.rejects(()=>simulateMinute(args({callChat:minuteChat({check})})),/MINUTE_REVIEW_REJECTED/);
});
test('auto defaults are explicit; manual mode asks before review and accepts supplied answers',async()=>{
 const draft={admission:admission(),world:macro()};draft.admission.completions=[{field:'time',en:'Chosen initial date',zh:'所选初始时间'}];
 const {worldline:w}=await simulateMinute(args({callChat:minuteChat({draft})}));assert.equal(w.simulation.admission.completions.length,1);
 const calls=[];await assert.rejects(()=>simulateMinute(args({autoComplete:false,callChat:minuteChat({draft,calls})})),e=>e.code==='INTERVENTION_CLARIFY'&&e.questions.length===1);assert.equal(calls.length,1);
 const clarification={question:'何时？',answer:'公元1024年'};const resumed=[];await simulateMinute(args({prompt:'改变制度',autoComplete:false,clarifications:[clarification],callChat:minuteChat({calls:resumed})}));assert.deepEqual(resumed[0].context.clarifications,[clarification]);
});
test('invalid relevance, arbitrary butterfly, unsupported physics and explicit date changes are refused',async()=>{
 for(const [change,code] of [[a=>a.earthRelevance='none','NOT_EARTH_ANCHORED'],[a=>a.materiality='negligible','INTERVENTION_NEGLIGIBLE'],[a=>a.causalBridge.push({mechanism:'Invented chain',support:'user-premise'}),'UNSUPPORTED_CAUSAL_BRIDGE'],[a=>a.operations[0].kind='physical_constant','UNSUPPORTED_PHYSICAL_MODEL'],[a=>a.operations[0].startYear=1025,'EXPLICIT_YEAR_MISMATCH']]){const a=admission();change(a);await assert.rejects(()=>simulateMinute(args({callChat:minuteChat({draft:{admission:a,world:macro()}})})),e=>e.code===code);}
});
test('hard deadline and user cancel return promptly even when an adapter ignores cancellation',async()=>{
 const start=performance.now();await assert.rejects(()=>simulateMinute(args({budgetMs:1000,callChat:()=>new Promise(()=>{})})),e=>e.code==='MINUTE_DEADLINE');assert.ok(performance.now()-start<1800);
 const controller=new AbortController();const p=simulateMinute(args({signal:controller.signal,callChat:()=>new Promise(()=>{})}));controller.abort();await assert.rejects(()=>p,e=>e.name==='AbortError');
});
test('children inherit only pre-fork records and reject edits to future discoveries',async()=>{
 const parent=(await simulateMinute(args())).worldline;parent.knowledge=[{id:'later',firstYear:1950,nameEn:'Future policy'}];
 const lineage=resolveAncestry({branches:[parent],parentId:parent.id,atYear:1750});assert.ok(!lineage.facts.some(f=>f.id==='later'));assert.ok(lineage.events.every(e=>e.year<1750));
 const a=admission(1750);a.operations[0]={...a.operations[0],kind:'branch_fact',parentFactId:'later'};
 await assert.rejects(()=>simulateMinute(args({prompt:'公元1750年修改该政策',branches:[parent],parentId:parent.id,callChat:minuteChat({year:1750,draft:{admission:a,world:macro(1750)}})})),/UNKNOWN_BRANCH_FACT/);
});
test('provider receives real small ceilings, low reasoning and no hidden retry in bounded profile',async()=>{
 const original=globalThis.fetch,bodies=[];globalThis.fetch=async(url,o)=>{bodies.push(JSON.parse(o.body));return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:'{}'}}]})}};
 const config={provider:'deepseek',endpoint:'https://api.deepseek.com/chat/completions',model:'deepseek-chat',key:'test-only'};
 try{await callChat(config,[],{json:true,maxTokens:7600,reasoning:true,profile:'minute'});await callChat(config,[],{json:true,maxTokens:2000,reasoning:false,profile:'minute'});assert.deepEqual(bodies.map(b=>b.max_tokens),[7600,2000]);assert.equal(bodies[0].reasoning_effort,'low');assert.equal(bodies[1].thinking.type,'disabled');
 globalThis.fetch=async()=>({ok:true,json:async()=>({choices:[{finish_reason:'length',message:{content:'{}'}}]})});await assert.rejects(()=>callChat(config,[],{json:true,profile:'minute'}),e=>e.reason==='truncated');
 }finally{globalThis.fetch=original;}
});
test('public entry reaches new algorithm and frozen archive has exact digest',async()=>{
 const adapter=await readFile('src/chronicle-adapter.mjs','utf8');assert.ok(adapter.includes('./minute-simulation.mjs'));assert.ok(!adapter.includes('ucm-omega'));
 const bytes=await readFile('archive/ucm-omega-v2/source-f3f0266.zip');assert.equal(createHash('sha256').update(bytes).digest('hex'),'cdac81ca795b032dc988dae224e88a69fc1707b9b8039880d6529bea5a4e199c');
 assert.match(explainError({code:'MINUTE_DEADLINE'},'zh'),/未保存/);
});

test('legacy v2 saved worlds remain readable without invoking an old generator',async()=>{
 const {worldline:w}=await simulateMinute(args());const legacy=clone(w);legacy.simulation.version=2;delete legacy.simulation.graph;delete legacy.simulation.timing;delete legacy.simulation.quality;legacy.simulation.genesis.version=2;
 assert.equal(sanitizeWorldline(legacy)?.simulation.version,2);assert.equal(sanitizeWorldline({...w,simulation:{...w.simulation,completedThrough:2000}}),null);
});
test('review cannot mutate immutable interventions; invalid imported DAGs are rejected',async()=>{
 const {worldline:w}=await simulateMinute(args());const corrupt=clone(w);corrupt.simulation.graph.events[0].c=['missing'];assert.equal(sanitizeWorldline(corrupt),null);
 const edits={conditions:[{id:'intervention:1',y:1024,t:'Override premise',r:['global'],k:'politics'}]};assert.throws(()=>validate(applyMacroEdits(macro(),edits)),/MINUTE_BACKGROUND_INVALID/);
});

test('official provider routes one fast world and one stronger short review; custom models remain explicit',()=>{
 const c={provider:'deepseek',endpoint:'https://api.deepseek.com/chat/completions',model:'deepseek-v4-pro'};
 assert.equal(minuteModelConfig(c,'minute-world').model,'deepseek-flash');assert.equal(minuteModelConfig(c,'minute-review').model,'deepseek-v4-pro');
 const custom={...c,provider:'custom'};assert.equal(minuteModelConfig(custom,'minute-world'),custom);assert.equal(c.model,'deepseek-v4-pro');
});

test('regional trajectories share one graph while remaining causally independent of the edit',()=>{
 const w=macro(),independent=w.events.find(e=>e.id==='autonomous');independent.r=['global'];
 const tracks=['east-asia','south-asia','west-central-asia','europe','africa','americas','oceania'].map((r,i)=>({r,events:[{...independent,id:'regional'+i}],quiet:null,refs:[]}));
 const assembled=assembleMacro({...w,trajectories:tracks,effects:w.events.filter(e=>e.id!=='autonomous')});assert.equal(assembled.trajectories.length,7);assert.doesNotThrow(()=>validate(materializePeriods(assembled,1024)));
 assembled.events.find(e=>e.id==='regional0').c=['intervention:1'];assert.throws(()=>validate(materializePeriods(assembled,1024)),/MINUTE_TRAJECTORIES_INVALID/);
});
test('period projection uses actual event years, retaining explicit explanations for empty intervals',()=>{
 const w=macro();w.events=w.events.filter(e=>e.y!==1750);w.events.find(e=>e.id==='e3').c=['e1'];const blank=materializePeriods(w,1024);assert.throws(()=>validate(blank),/MINUTE_TEMPORAL_COVERAGE_INVALID/);
 w.quietPeriods=[{to:1750,t:'No further supported macro milestone is resolved in this interval',refs:['b1']}];assert.doesNotThrow(()=>validate(materializePeriods(w,1024)));
});

test('milestones have no nine-event cap and remain a subset of accepted events',async()=>{
 const w=macro();for(let i=0;i<15;i++)w.events.push({...w.events[0],id:'extra'+i,y:1600+i});
 const {worldline:out}=await simulateMinute(args({callChat:minuteChat({draft:{admission:admission(),world:w}})}));
 assert.ok(out.simulation.milestoneIds.length>9);assert.ok(out.simulation.milestoneIds.every(id=>out.events.some(e=>e.id===id)));
});

test('nullable optional review fields preserve the candidate title, summary and quiet explanations',()=>{
 const w=macro();w.quietPeriods=[{to:1750,t:'Supported quiet',refs:['b1']}];const out=applyMacroEdits(w,{title:null,summary:null,regions:[],trajectories:[],quietPeriods:[],setting:null});
 assert.equal(out.title,w.title);assert.equal(out.summary,w.summary);assert.deepEqual(out.trajectories,w.trajectories);assert.deepEqual(out.quietPeriods,w.quietPeriods);
});

test('review issues may address a setting field as well as event IDs',async()=>{
 const check={...review(),verdict:'repair',issues:[{id:'setting',reason:'Unsupported endpoint setting'}],edits:{setting:{politics:'A corrected conditional institutional setting'}}};
 const {worldline:w}=await simulateMinute(args({callChat:minuteChat({check})}));assert.equal(w.simulation.setting.politics,check.edits.setting.politics);
});

test('regional origins qualify as world milestones only through realized causal transmission',()=>{
 const w=macro();w.events[0].r=['europe'];w.events[0].s=3;const out=validate(w);assert.ok(out.milestones.some(e=>e.id==='e1'));assert.ok(out.reach.get('e1').has('africa'));
 const isolated={id:'isolated',y:1600,t:'Regional only',d:'A significant regional change with no modeled transmission to other regions.',c:['b1'],r:['europe'],k:'culture',s:3};w.events.push(isolated);assert.ok(!validate(w).milestones.some(e=>e.id==='isolated'));
});
