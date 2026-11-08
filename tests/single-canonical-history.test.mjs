import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runMatrix} from '../src/ucm-omega.mjs';
import {simulateOmega} from '../src/chronicle-adapter.mjs';

const interpretation={
 intent:'edit',valid:true,
 operations:[{
  kind:'historical_change',scope:'earth',mode:'point',startYear:1644,
  endYear:1644,target:'A historical divergence',value:'changed'
 }]
};
const event=(state)=>({
 id:`canonical:${state.window.from}`,year:state.window.from,
 en:`World event at ${state.window.from}`,zh:`世界事件 ${state.window.from}`,
 descriptionEn:'Audited counterfactual development',
 descriptionZh:'经审核的推演事件',
 category:'governance',region:'East Asia',
 threadKey:`global-development-${state.window.from}`,
 relationToIntervention:'direct',
 significance:'major',scope:'regional',certainty:'low',
 causes:['intervention:1'],requires:[],assumptions:[]
});

test('production adapter performs ONE entire historical scenario, not two alternatives',async()=>{
 const requests=[],prompt='In 1644 a historical divergence changes global development';
 const output=await simulateOmega({
  prompt,branches:[],baseline:[],parentId:null,config:{},
  makeId:()=> 'worldline-one',maxWindows:6,
  callChat:async (_config,messages,options)=>{
   const user=messages.at(-1).content;
   requests.push({user,options});
   if(user.includes('Classify user input'))return interpretation;
   if(user.includes('Summarize the preferred scenario'))return {
    titleEn:'Alternate Earth',titleZh:'变化后的地球',
    summaryEn:'One coherent worldline through 2026',
    summaryZh:'一条延续至 2026 年的完整世界线',impacts:[]
   };
   const m=user.match(/scenario (\d+), window \[(-?\d+), (-?\d+)\]/);
   assert.ok(m,'each proposal must describe one historical window');
   assert.equal(+m[1],1,'a second complete trajectory must never start');
   const win={from:+m[2],to:+m[3]};
   return {events:[event({window:win})],facts:[],summary:`Continuity to ${win.to}`};
  }
 });
 assert.equal(requests.length,8,'1 interpretation + 6 chronological windows + 1 synthesis');
 assert.equal(output.worldline.events.length,6);
 assert.equal(output.worldline.facts.length,0);
 assert.equal(output.analysis.preferred.snapshots.length,6);
 assert.deepEqual(output.analysis.alternatives,[]);
 assert.deepEqual(output.analysis.preferred.events.map(e=>e.year),
  [...output.analysis.preferred.events.map(e=>e.year)].sort((a,b)=>a-b));
 assert.equal(output.worldline.anchorYear,1644);
 assert.equal(output.worldline.parentId,null);
 assert.equal(output.worldline.omega?.scenarios,1);
 assert.equal(output.worldline.summaryZh,'一条延续至 2026 年的完整世界线');
 assert.equal(requests[0].options.purpose,'simulation');
});

test('kernel defaults to a single canonical chronological run without dropping hard causal audits',async()=>{
 const requests=[],signal=new AbortController().signal;
 const outcome=await runMatrix({interpretation,signal,maxWindows:6,
  propose:async state=>{
   requests.push({scenario:state.scenario,window:state.window});
   return {events:[event(state)]};
  }
 });
 assert.equal(requests.length,6);
 assert.ok(requests.every(r=>r.scenario===1));
 assert.deepEqual(outcome.alternatives,[]);
 assert.equal(outcome.preferred.audit.rejected,0);
 assert.equal(outcome.preferred.events.length,6);
 assert.equal(outcome.preferred.snapshots.length,6);
 assert.ok(outcome.preferred.audit.score>0);
});

test('the public simulate route invokes one full trajectory and no parallel-ensemble progress UI',async()=>{
 const [core,adapter,kernel,app]=await Promise.all([
  readFile('src/core.js','utf8'),
  readFile('src/chronicle-adapter.mjs','utf8'),
  readFile('src/ucm-omega.mjs','utf8'),
  readFile('src/app.js','utf8')
 ]);
 assert.match(core,/callChat,makeId,scenarioCount:1,maxWindows:6/);
 assert.match(adapter,/scenarioCount=1,maxWindows=6/);
 assert.match(kernel,/scenarioCount=1,maxWindows=6/);
 assert.doesNotMatch(kernel,/maxParallelScenarios|parallelScenarios|const jobs=Array\.from/);
 assert.doesNotMatch(app,/条情景并行|scenarios parallel/);
});
