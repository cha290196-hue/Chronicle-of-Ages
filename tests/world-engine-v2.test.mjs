import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateOmega} from '../src/chronicle-adapter.mjs';
import {admitIntervention,calendarYears} from '../src/historical-intent.mjs';
import {initializeWorld,causalContext,nextWorldWindow,auditTransition,selectMilestones,sanitizeSimulation,REGIONS} from '../src/world-model.mjs';
import {sanitizeWorldline,callChat} from '../src/core.js';
import {admission,worldChat,genesis,transition,semanticReview} from './fixtures/world-chat.mjs';
import {ModelJSONError} from '../src/structured-output.mjs';
const run=(chat,extra={})=>simulateOmega({prompt:'公元2020年制度改变',callChat:chat,config:{},makeId:()=> 'test-world',...extra});

test('explicit historical years preserve 1024 and reject model drift, year zero, troop counts',()=>{
 assert.deepEqual(calendarYears('公元1024年陨石撞击地球，军队1000人'),[1024]);
 assert.deepEqual(calendarYears('44 BCE and 1 AD'),[-44,1]);
 assert.deepEqual(calendarYears('1000 soldiers'),[]);
 assert.equal(admitIntervention(admission(1024),{prompt:'公元1024年陨石撞击地球'})[0].startYear,1024);
 assert.throws(()=>admitIntervention(admission(1025),{prompt:'公元1024年陨石撞击地球'}),/EXPLICIT_YEAR_MISMATCH/);
 assert.throws(()=>admitIntervention(admission(),{prompt:'公元0年'}),/INVALID_YEAR/);
});
test('nonsense, questions, negligible butterfly stories and unsupported bridges never create a world',async()=>{
 for(const change of [
  {intent:'irrelevant',decision:'reject'},
  {intent:'question'},
  {earthRelevance:'none'},
  {materiality:'negligible'},
  {causalBridge:[{mechanism:'Sneezing makes a tsunami by a mysterious chain',support:'speculative'}]}
 ]){
  const calls=[];await assert.rejects(run(worldChat({calls,overrides:{interpretation:()=>({...admission(),...change})}})));
  assert.deepEqual(calls.map(c=>c.options.stage),['interpretation']);
 }
});
test('an underspecified supernova asks for critical distance and time instead of guessing them',async()=>{
 const calls=[];
 await assert.rejects(run(worldChat({calls,overrides:{interpretation:()=>({...admission(),decision:'clarify',criticalUnknowns:['distance','date'],questions:[{zh:'发生在哪一年、距离地球多远？',en:'What year and Earth distance?'}]})}})),e=>e.code==='INTERVENTION_CLARIFY'&&e.questions.length===1);
 assert.equal(calls.length,1);
});
test('world genesis does not consume the 43 navigation milestones as its historical state',async()=>{
 const calls=[];const result=await run(worldChat({calls}),{baseline:[{id:'navigation-only-sentinel',year:2000,en:'Only a marker'}]});
 const initialization=calls.find(c=>c.options.stage==='world-initialization').context;
 assert.equal(JSON.stringify(initialization).includes('navigation-only-sentinel'),false);
 assert.equal(result.worldline.simulation.genesis.regions.length,7);
 assert.equal(result.worldline.simulation.version,2);
});
test('the production trajectory covers chronological windows, seven autonomous regions and real ledger milestones',async()=>{
 const calls=[];const {worldline:w}=await run(worldChat({calls}));
 assert.equal(w.anchorYear,2020);assert.equal(w.simulation.completedThrough,2026);
 assert.ok(w.events.length>=14);assert.equal(new Set(w.events.map(e=>e.region)).size,7);
 assert.ok(w.events.every(e=>e.relationToIntervention==='independent'));
 assert.ok(w.simulation.milestoneIds.every(id=>w.events.some(e=>e.id===id)));
 assert.equal(calls.filter(c=>c.options.stage==='interpretation').length,1);
 assert.equal(calls.filter(c=>c.options.stage==='synthesis').length,1);
 const windows=w.simulation.snapshots.map(s=>s.window);
 for(let i=1;i<windows.length;i++)assert.equal(windows[i].from,windows[i-1].to+1);
 assert.equal(windows.at(-1).to,2026);
 assert.ok(calls.every(c=>c.options.reasoning===true));
});
test('independent review rejects a relabeled Ming-only narrative instead of accepting cosmetic topic diversity',async()=>{
 const calls=[];
 await assert.rejects(run(worldChat({calls,overrides:{'world-review':()=>({...semanticReview(),verdict:'revise',sufficient:false,missingProcesses:['autonomous Europe, Africa and Americas'],densityReason:'Only a dynasty is advancing'})}})),/WORLD_COMPLETENESS_FAILED/);
 assert.equal(calls.filter(c=>c.options.stage==='causal-repair').length,2);
 assert.equal(calls.some(c=>c.options.stage==='synthesis'),false);
});
test('partial causal rejection triggers repair even when other valid events survive',async()=>{
 let windows=0,repairs=0;
 const chat=worldChat({overrides:{'historical-window':c=>{
  windows++;const p=transition(c);p.events.push({...p.events[0],id:c.idPrefix+'broken',causes:['missing'],links:[{causeId:'missing',mechanism:'Unprovided prerequisite',support:'supported-inference'}]});return p;
 },'causal-repair':c=>{repairs++;return transition(c)}}});
 const {worldline}=await run(chat);assert.equal(repairs,windows);assert.ok(worldline.events.length>=14);
 assert.ok(worldline.simulation.rejections.some(r=>r.reason==='UNKNOWN_CAUSE'));
});
test('empty long histories and empty final worlds cannot pass even a superficial pass verdict',async()=>{
 const chat=worldChat({year:1644,overrides:{'historical-window':empty,'causal-repair':empty}});
 function empty(c){const p=transition(c);p.events=[];p.processReviews=p.processReviews.map(r=>({...r,status:'stable',eventIds:[]}));p.stateUpdates=p.stateUpdates.map((r,i)=>({...r,evidenceIds:[c.world.records[i].id]}));return p}
 await assert.rejects(run(chat,{prompt:'明朝在1644年延续'}),/WORLD_COMPLETENESS_FAILED/);
});
test('poor genesis and unreviewed autonomous processes fail closed',()=>{
 const raw=genesis({year:2020,idPrefix:'b:'});
 assert.throws(()=>initializeWorld({...raw,regions:raw.regions.slice(1)},{year:2020}),/WORLD_REGIONS_INCOMPLETE/);
 const world=initializeWorld(raw,{year:2020});
 const c={world:causalContext({world}),window:{from:2020,to:2024},idPrefix:'e:'};
 const p=transition(c);p.processReviews=p.processReviews.slice(1);
 assert.ok(auditTransition({proposal:p,window:c.window,world}).issues.some(i=>i.reason==='PROCESS_NOT_REVIEWED'));
});
test('no global event is manufactured by the selector and minor/local changes remain in the full ledger',()=>{
 const p=transition({world:{processes:genesis({year:2020,idPrefix:'b:'}).processes},window:{from:2020,to:2024},idPrefix:'e:'});
 const local={...p.events[0],id:'local',impact:{regions:['east-asia'],domains:['politics'],mechanism:'A local office changes'}};
 assert.equal(selectMilestones([local]).length,0);
 assert.deepEqual(selectMilestones([local,...p.events]),p.events.map(e=>e.id));
});
test('subdivision retries only the failing period and summary recovery never repeats completed history',async()=>{
 const calls=[];let cutoff=true,summary=true;
 const chat=worldChat({calls,overrides:{'historical-window':c=>{if(cutoff){cutoff=false;throw new ModelJSONError('truncated')}return transition(c)},
  synthesis:()=>{if(summary){summary=false;throw new ModelJSONError('truncated')}}}});
 const {worldline}=await run(chat);
 assert.equal(worldline.simulation.snapshots[0].window.to,2022);
 assert.equal(calls.filter(c=>c.options.stage==='synthesis-recovery').length,1);
 assert.ok(calls.filter(c=>c.options.stage==='historical-window').length>worldline.simulation.snapshots.length);
});
test('archive round trips preserve the global state, action IDs and every causal edge',async()=>{
 const {worldline}=await run(worldChat());
 const restored=sanitizeWorldline(JSON.parse(JSON.stringify(worldline)));
 assert.deepEqual(restored.simulation,worldline.simulation);
 assert.deepEqual(restored.events.map(e=>e.causes),worldline.events.map(e=>e.causes));
 assert.ok(sanitizeSimulation(restored.simulation));
});
test('chronological planning stays annual at boundaries and crosses BCE/CE without year zero',()=>{
 assert.deepEqual(nextWorldWindow(2026),{from:2026,to:2026});
 const w=nextWorldWindow(-1,{first:true});assert.equal(w.to,4);
 assert.deepEqual(nextWorldWindow(1800,{processes:[{nextYear:1807}]}),{from:1800,to:1807});
});
test('DeepSeek production reasoning is explicitly enabled with sufficient output headroom',async()=>{
 const saved=globalThis.fetch;let body;
 globalThis.fetch=async(_,init)=>{body=JSON.parse(init.body);return {ok:true,json:async()=>({choices:[{message:{content:'{"ok":true}'}}]})}};
 try{await callChat({provider:'deepseek',endpoint:'https://api.deepseek.com/chat/completions',model:'deepseek-flash',key:'test'},[{role:'user',content:'JSON please'}],{json:true,reasoning:true,purpose:'simulation'});
  assert.equal(body.thinking.type,'enabled');assert.ok(body.max_tokens>=32768);
 }finally{globalThis.fetch=saved}
});
test('child forks inherit only effective history and retain distinct intervention roots',async()=>{
 const {worldline:parent}=await run(worldChat());
 const calls=[];
 const {worldline:child}=await simulateOmega({prompt:'公元2023年再次改变制度',branches:[parent],parentId:parent.id,
  config:{},callChat:worldChat({year:2023,calls}),makeId:()=> 'child'});
 assert.equal(child.parentId,parent.id);
 assert.ok(child.inherited.events.every(e=>e.year<2023));
 assert.notEqual(child.simulation.actions[0].id,parent.simulation.actions[0].id);
 assert.ok(child.simulation.genesis.conditions.some(c=>c.id===parent.simulation.actions[0].id));
 assert.equal(calls[0].context.selectedWorld.anchorYear,2020);
});
test('production keeps an invariant transition prefix while sending distinct current world states',async()=>{
 const calls=[];await run(worldChat({calls}));
 const historical=calls.filter(c=>c.options.stage==='historical-window');
 const prefix=m=>m.messages.at(-1).content.split('\nCONTEXT JSON:\n')[0];
 assert.ok(prefix(historical[0]).length>1500);
 assert.ok(historical.every(c=>prefix(c)===prefix(historical[0])));
 assert.notEqual(historical[0].context.window.from,historical[1].context.window.from);
 assert.notDeepEqual(historical[0].context.world.regions,historical[1].context.world.regions);
});
test('invalid v2 metadata is rejected and large legacy ledgers are not silently truncated',async()=>{
 const {worldline}=await run(worldChat());
 assert.equal(sanitizeWorldline({...worldline,simulation:{version:2,snapshots:[],genesis:{year:2020}}}),null);
 const large={...worldline,simulation:null,events:Array.from({length:1700},(_,i)=>({...worldline.events[0],id:'event-'+i}))};
 assert.equal(sanitizeWorldline(large).events.length,1700);
});
test('cancellation prevents subsequent stages and no partial worldline can be returned',async()=>{
 const controller=new AbortController(),calls=[];
 await assert.rejects(run(worldChat({calls}),{signal:controller.signal,onProgress:s=>{if(s.phase==='initialization')controller.abort()}}),e=>e.name==='AbortError');
 assert.equal(calls.some(c=>c.options.stage==='historical-window'),false);
});
