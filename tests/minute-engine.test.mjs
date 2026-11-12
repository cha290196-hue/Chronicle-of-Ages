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

test('legacy Minute replay uses two bounded calls and preserves its causal ledger and stored format',async()=>{
 const calls=[];const {worldline:w}=await simulateMinute(args({callChat:minuteChat({calls})}));
 assert.deepEqual(calls.map(x=>x.options.stage),['minute-world','minute-review']);
 assert.equal(calls[1].context.interventions[0].id,'intervention:1');assert.ok(calls[1].context.recordYears.some(r=>r.id==='intervention:1'&&r.year===1024));
 assert.deepEqual(calls.map(x=>[x.options.profile,x.options.reasoning,x.options.maxTokens]),[['minute',false,65536],['minute',false,16384]]);
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
 check.edits={drop:['e1']};await assert.rejects(()=>simulateMinute(args({callChat:minuteChat({draft,check})})),/MINUTE_(UNKNOWN_CAUSE|REVIEW_INVALID)/);
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
test('provider receives output headroom, explicit non-thinking and no retry for length-limited output',async()=>{
 const original=globalThis.fetch,bodies=[];globalThis.fetch=async(url,o)=>{bodies.push(JSON.parse(o.body));return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:'{}'}}]})}};
 const config={provider:'deepseek',endpoint:'https://api.deepseek.com/chat/completions',model:'deepseek-chat',key:'test-only'};
 try{await callChat(config,[],{json:true,maxTokens:65536,reasoning:false,profile:'minute'});await callChat(config,[],{json:true,maxTokens:16384,reasoning:false,profile:'minute'});assert.deepEqual(bodies.map(b=>b.max_tokens),[65536,16384]);assert.equal(bodies[0].thinking.type,'disabled');assert.equal(bodies[1].thinking.type,'disabled');
 globalThis.fetch=async()=>({ok:true,json:async()=>({choices:[{finish_reason:'length',message:{content:'{}'}}]})});await assert.rejects(()=>callChat(config,[],{json:true,profile:'minute'}),e=>e.reason==='truncated');
 }finally{globalThis.fetch=original;}
});
test('public entry bypasses the archived engine and frozen archive has exact digest',async()=>{
 const adapter=await readFile('src/chronicle-adapter.mjs','utf8');assert.ok(adapter.includes('./prompt-world.mjs'));assert.ok(!adapter.includes('ucm-omega'));
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

test('all official inference stages use Flash and migrate retired saved profiles',()=>{
 const c={provider:'deepseek',endpoint:'https://api.deepseek.com/chat/completions',model:'deepseek-v4-pro'};
 assert.equal(minuteModelConfig(c,'minute-world').model,'deepseek-flash');assert.equal(minuteModelConfig(c,'minute-review').model,'deepseek-flash');
 const custom={...c,provider:'custom'};assert.equal(minuteModelConfig(custom,'minute-world').model,'deepseek-flash');assert.equal(c.model,'deepseek-v4-pro');
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

test('dynamic content accepts more than 80 events without truncating long prose on persistence',async()=>{
 const w=macro();for(let i=0;i<100;i++)w.events.push({...w.events[0],id:'wide'+i,y:1600+i});w.events[0].d='Detailed conditional history. '.repeat(300);w.summary='A developed global account. '.repeat(500);
 const {worldline:out}=await simulateMinute(args({callChat:minuteChat({draft:{admission:admission(),world:w}})}));const restored=sanitizeWorldline(out);
 assert.ok(out.events.length>80);assert.equal(restored.events.find(e=>e.id.endsWith(':e1')).descriptionZh,out.events.find(e=>e.id.endsWith(':e1')).descriptionZh.trim());assert.equal(restored.summaryZh,w.summary.trim());assert.equal(out.simulation.outputPolicy,'dynamic-earth-v1');
});
test('every new region has all six substantive domain states; a global paragraph cannot replace them',async()=>{
 const w=macro();w.regions[0].domains.pop();await assert.rejects(()=>simulateMinute(args({callChat:minuteChat({draft:{admission:admission(),world:w}})})),/MINUTE_REVIEW_INVALID/);
 const {worldline:out}=await simulateMinute(args());assert.equal(out.simulation.snapshots.at(-1).state.regions.reduce((n,r)=>n+r.domains.length,0),42);assert.ok(out.simulation.snapshots.at(-1).state.regions[0].domains.every(d=>d.summary.startsWith('Conditional')));
});

test('remaining time can correct a malformed audit without generating a second world',async()=>{
 const calls=[];const {worldline:w}=await simulateMinute(args({callChat:async(_,messages,o)=>{calls.push(o.stage);if(o.stage==='minute-world')return {admission:admission(),world:macro()};if(o.stage==='minute-review')return {verdict:'repair',issues:[{id:'e1',reason:'Missing edits in malformed audit'}]};return {...review(),verdict:'repair',edits:{events:[macro().events[0]]}};}}));
 assert.deepEqual(calls,['minute-world','minute-review','minute-repair']);assert.equal(w.simulation.timing.requests.length,3);assert.equal(w.simulation.timing.budgetMs,120000);
});

test('field-level audit corrections preserve all unchanged long prose and regional domains',()=>{
 const w=macro();w.events[0].d='Developed historical explanation. '.repeat(500);const prior=w.regions[0].domains.map(d=>({...d}));
 const out=applyMacroEdits(w,{events:[{id:'e1',c:['intervention:1','b1'],d:null}],regions:[{r:w.regions[0].r,domains:[{k:'politics',t:'Corrected political institutions'}]}]});
 assert.equal(out.events[0].d,w.events[0].d);assert.equal(out.events[0].t,w.events[0].t);assert.equal(out.regions[0].domains.length,6);assert.equal(out.regions[0].domains.find(d=>d.k==='economy').t,prior.find(d=>d.k==='economy').t);assert.equal(out.regions[0].domains.find(d=>d.k==='politics').t,'Corrected political institutions');
});

test('localized audit substitutions retain the surrounding full explanation and reject ambiguous matches',()=>{
 const w=macro(),source=w.events[0].d;const out=applyMacroEdits(w,{text:[{kind:'event',id:'e1',field:'d',from:'Established institutions',to:'Recorded institutions'}]});
 assert.equal(out.events[0].d,source.replace('Established institutions','Recorded institutions'));assert.deepEqual(out.events.slice(1),w.events.slice(1));
 assert.throws(()=>applyMacroEdits(w,{text:[{kind:'event',id:'e1',field:'d',from:'missing phrase',to:'anything'}]}),/MINUTE_TEXT_PATCH_INVALID/);
});

test('non-blocking uncertainty remains visible without weakening blocking rejection gates',async()=>{
 const check={...review(),notes:['Alternative later institutional paths remain possible']};const {worldline:w}=await simulateMinute(args({callChat:minuteChat({check})}));assert.ok(w.simulation.limits.includes(check.notes[0]));
 await assert.rejects(()=>simulateMinute(args({callChat:minuteChat({check:{verdict:'reject',reason:'Premise contradiction',issues:[{id:'e1',code:'PREMISE_CONTRADICTION'}]}})})),/MINUTE_REVIEW_REJECTED/);
});

test('chronology correction after audit receives only affected records and explicit eligible causes',async()=>{
 let correction;const w=macro(),description=w.events[0].d;
 const result=await simulateMinute(args({callChat:async(_,messages,o)=>{
  if(o.stage==='minute-world')return {admission:admission(),world:w};
  if(o.stage==='minute-review')return {verdict:'repair',issues:[{id:'e1',code:'FUTURE_CAUSE'}],notes:['Conditional institutional persistence'],edits:{events:[{id:'e1',c:['intervention:1','e2']}]}};
  correction=JSON.parse(messages.at(-1).content.split('\nCONTEXT JSON:\n')[1]);
  return {verdict:'repair',issues:[],edits:{events:[{id:'e1',c:['intervention:1','b1']}]}};
 }}));
 assert.equal(correction.world,undefined);assert.equal(correction.defects[0].event.id,'e1');assert.equal(correction.defects[0].forbiddenCause,'e2');assert.ok(!correction.defects[0].allowedCauseIds.includes('e2'));assert.ok(correction.defects[0].allowedCauseIds.includes('b1'));
 assert.equal(result.worldline.events.find(e=>e.id.endsWith(':e1')).descriptionZh,description);assert.ok(result.worldline.simulation.limits.includes('Conditional institutional persistence'));
});

test('causal field patches rebuild regional membership without deleting any history',async()=>{
 const w=macro();w.events.push({...clone(w.events.at(-1)),id:'changes-affiliation',d:'Existing regional development with its complete substantive explanation.'});
 const {worldline:out}=await simulateMinute(args({callChat:minuteChat({draft:{admission:admission(),world:w},check:{verdict:'repair',issues:[{id:'changes-affiliation',code:'CAUSAL_LINK'}],edits:{events:[{id:'changes-affiliation',c:['intervention:1','b1']}]}}})}));
 assert.equal(out.events.length,w.events.length);assert.equal(out.events.find(e=>e.id.endsWith(':changes-affiliation')).relationToIntervention,'direct');assert.ok(out.simulation.graph.trajectories.every(t=>!t.eventIds.includes('changes-affiliation')));assert.equal(out.events.find(e=>e.id.endsWith(':changes-affiliation')).descriptionZh,w.events.at(-1).d);
});
