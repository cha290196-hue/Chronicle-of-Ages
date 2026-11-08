import test from 'node:test';
import assert from 'node:assert/strict';
import {runMatrix} from '../src/ucm-omega.mjs';
import {simulateOmega} from '../src/chronicle-adapter.mjs';
import {readFile} from 'node:fs/promises';

const edit={operations:[{kind:'historical_change',scope:'earth',mode:'point',startYear:1600,
 target:'A different world politics',value:'changed'}]};
const event=(scenario,window)=>({id:`s${scenario}-w${window.from}`,year:window.from,
 en:`Regional institutional change in scenario ${scenario}`,
 zh:`历史进程 ${scenario}`,
 category:'governance',region:'Europe',threadKey:'global-institutions',
 scope:'regional',significance:'major',relationToIntervention:'direct',
 causes:['intervention:1']});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const deadline=(promise,ms=1200)=>Promise.race([
 promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error('CONCURRENCY_DEADLINE')),ms))
]);

test('both independent scenarios start before either completes; each timeline remains chronological',async()=>{
 const entered=new Set(),active=new Set(),orders=[[],[]];
 let release;const startGate=new Promise(resolve=>release=resolve);
 const work=runMatrix({interpretation:edit,scenarioCount:2,maxWindows:3,
  propose:async state=>{
   assert.ok(!active.has(state.scenario),'no parallel windows within the same worldline');
   active.add(state.scenario);
   if(state.windowIndex===0){
    entered.add(state.scenario);
    if(entered.size===2)release();
    await startGate;
   }
   orders[state.scenario-1].push(state.window.from);
   await Promise.resolve();
   active.delete(state.scenario);
   return {events:[event(state.scenario,state.window)]};
  }
 });
 const result=await deadline(work);
 assert.deepEqual([...entered].sort(),[1,2]);
 assert.equal(orders[0].length,3);
 assert.equal(orders[1].length,3);
 assert.deepEqual(orders[0],[...orders[0]].sort((a,b)=>a-b));
 assert.deepEqual(orders[1],[...orders[1]].sort((a,b)=>a-b));
 assert.equal(result.preferred.events.length,3);
 assert.equal(result.alternatives[0].events.length,3);
});

test('parallel and sequential schedules preserve the same accepted events, facts, audits and ranking',async()=>{
 const produce=async state=>({
  events:[{...event(state.scenario,state.window),en:'Standalone autonomous change',relationToIntervention:'direct'}],
  facts:[{id:`f${state.scenario}-${state.window.from}`,firstYear:state.window.from,
   nameEn:'Institutional state',nameZh:'制度状态',kind:'institution',certainty:'medium'}]
 });
 const serial=await runMatrix({interpretation:edit,scenarioCount:2,maxWindows:4,maxParallelScenarios:1,propose:produce});
 const parallel=await runMatrix({interpretation:edit,scenarioCount:2,maxWindows:4,maxParallelScenarios:2,propose:produce});
 assert.deepEqual(parallel,serial,'concurrency does not omit, downgrade or reorder scenario knowledge');
 assert.equal(parallel.preferred.events.length,4);
 assert.equal(parallel.preferred.facts.length,4);
});

test('pool is bounded to at most two in-flight scenarios even if five alternatives are requested',async()=>{
 let inflight=0,maxInflight=0,completed=0;
 const result=await runMatrix({interpretation:edit,scenarioCount:5,maxWindows:1,maxParallelScenarios:2,
  propose:async state=>{
   inflight++;maxInflight=Math.max(maxInflight,inflight);
   await delay(14);
   inflight--;completed++;
   return {events:[event(state.scenario,state.window)]};
  }
 });
 assert.equal(maxInflight,2);
 assert.equal(inflight,0);
 assert.equal(completed,5);
 assert.equal(result.alternatives.length,4);
});

test('global failure aborts sibling requests and never returns a partially generated timeline',async()=>{
 const started=new Set(),aborted=new Set();
 let release;const gate=new Promise(resolve=>release=resolve);
 const promise=runMatrix({interpretation:edit,scenarioCount:2,maxWindows:1,
  propose:async state=>{
   started.add(state.scenario);
   if(started.size===2)release();
   await gate;
   if(state.scenario===1)throw new Error('UPSTREAM_DATA_FAILURE');
   return await new Promise((resolve,reject)=>{
    if(state.signal.aborted){aborted.add(state.scenario);reject(new Error('ABORTED'));return}
    state.signal.addEventListener('abort',()=>{
     aborted.add(state.scenario);reject(new Error('ABORTED'))
    },{once:true});
   });
  }
 });
 await assert.rejects(()=>deadline(promise),/UPSTREAM_DATA_FAILURE/);
 assert.deepEqual([...started].sort(),[1,2]);
 assert.deepEqual([...aborted],[2]);
});

test('user cancellation aborts every active scenario and stops additional API work',async()=>{
 const controller=new AbortController(),started=new Set(),aborted=new Set();
 let release;const gate=new Promise(resolve=>release=resolve);
 const promise=runMatrix({interpretation:edit,scenarioCount:2,maxWindows:2,signal:controller.signal,
  propose:async state=>{
   started.add(state.scenario);
   if(started.size===2)release();
   return await new Promise((resolve,reject)=>{
    const mark=()=>{aborted.add(state.scenario);reject(new Error('ABORTED'))};
    if(state.signal.aborted)mark();
    else state.signal.addEventListener('abort',mark,{once:true});
   });
  }
 });
 await deadline(gate);
 controller.abort();
 await assert.rejects(()=>deadline(promise),/ABORTED/);
 assert.deepEqual([...aborted].sort(),[1,2]);
});

test('sequential mode remains selectable without losing historical window quality',async()=>{
 let active=0,peak=0;
 await runMatrix({interpretation:edit,scenarioCount:2,maxWindows:2,maxParallelScenarios:1,
  propose:async state=>{
   active++;peak=Math.max(peak,active);
   await delay(3);active--;
   return {events:[event(state.scenario,state.window)]};
  }});
 assert.equal(peak,1);
});

test('adapter passes coordinator signal into every expensive scenario request',async()=>{
 const controller=new AbortController(),seen=[],inference={...edit,intent:'edit',valid:true};
 let id=0;
 const {worldline,analysis}=await deadline(simulateOmega({
  prompt:'A nonhistorical alternative to 1600 Earth',baseline:[],branches:[],
  config:{},signal:controller.signal,scenarioCount:2,maxWindows:2,makeId:()=>`b${++id}`,
  callChat:async (_config,messages,options)=>{
   const user=messages.at(-1).content;
   if(user.includes('Classify user input'))return inference;
   if(user.includes('Summarize the preferred scenario'))return {
    titleEn:'New Earth',titleZh:'新世界',summaryEn:'Alternative',summaryZh:'另一世界',impacts:[]
   };
   const match=user.match(/scenario (\d+), window \[(-?\d+), (-?\d+)\]/);
   assert.ok(match,'actual scenario prompt must preserve its historical context');
   seen.push({scenario:+match[1],signal:options.signal});
   assert.notEqual(options.signal,controller.signal,
    'coordinator cancellation must have its own AbortSignal');
   assert.equal(options.signal.aborted,false);
   await Promise.resolve();
   return {events:[event(+match[1],{from:+match[2],to:+match[3]})]};
  }
 }));
 assert.equal(seen.length,4);
 assert.equal(new Set(seen.map(x=>x.signal)).size,1);
 assert.equal(worldline.events.length,2);
 assert.equal(analysis.alternatives.length,1);
});

test('the settings render preserves a visible concurrent progress indicator',async()=>{
 const app=await readFile('src/app.js','utf8');
 assert.match(app,/parallelScenarios/);
 assert.match(app,/s\.index.*s\.total/);
});
