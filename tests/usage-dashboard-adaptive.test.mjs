import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readUsageMeter,clearUsageMeter,recordRequestUsage,setUsagePrice,readUsagePricing,
 normalizeProviderUsage,summarizeUsage,meterRows} from '../src/usage-meter.mjs';
import {renderUsageDashboard} from '../src/usage-dashboard.mjs';
import {runAdaptiveWindow,WindowExpansionError} from '../src/adaptive-propagation.mjs';
import {runMatrix} from '../src/ucm-omega.mjs';
import {callChat,sanitizeWorldline} from '../src/core.js';

const op=(year=1644)=>({kind:'historical_change',scope:'earth',mode:'point',startYear:year,
 target:'Ming continuity',value:'survives'});
const event=(id,year)=>({id,year,en:'Causal event '+id,zh:'事件'+id,category:'science',causes:['intervention:1']});
const invalid=()=>{const e=new Error('INVALID_JSON');e.reason='truncated';return e};
function memoryStorage(){
 const data=new Map();
 return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
}

test('provider reported input/output/cached/reasoning tokens are counted once per actual response',()=>{
 const old=globalThis.localStorage;globalThis.localStorage=memoryStorage();
 try{
  assert.deepEqual(normalizeProviderUsage({usage:{prompt_tokens:1000,completion_tokens:500,total_tokens:1500,
   prompt_tokens_details:{cached_tokens:400},completion_tokens_details:{reasoning_tokens:200},cost:0.004}}),
  {input:1000,output:500,total:1500,cached:400,reasoning:200,cost:0.004});
  recordRequestUsage({provider:'openrouter',model:'model-A',success:true,
   payload:{usage:{prompt_tokens:1000,completion_tokens:500,total_tokens:1500,cost:0.004}}});
  recordRequestUsage({provider:'openrouter',model:'model-A',success:true,
   payload:{usage:{input_tokens:2000,output_tokens:1000}}});
  recordRequestUsage({provider:'openrouter',model:'model-A',success:false});
  const state=readUsageMeter();
  assert.equal(state.totals.calls,3);
  assert.equal(state.totals.failed,1);
  assert.equal(state.totals.meteredCalls,2);
  assert.equal(state.totals.unmeteredCalls,1);
  assert.equal(state.totals.totalTokens,4500);
  assert.equal(state.totals.providerCostUsd,0.004);
  const unknownPrice=summarizeUsage();
  assert.equal(unknownPrice.missingPriceModels,1);
  assert.equal(unknownPrice.estimatedUsd,0);
  assert.equal(setUsagePrice({provider:'openrouter',model:'model-A',inputPerMillion:1,outputPerMillion:4}),true);
  const summary=summarizeUsage();
  assert.ok(Math.abs(summary.estimatedUsd-0.006)<1e-10);
  assert.ok(Math.abs(summary.coveredUsd-0.010)<1e-10);
  assert.equal(meterRows()[0].calls,3);
  const html=renderUsageDashboard({lang:'zh',provider:'openrouter',model:'model-A'});
  assert.match(html,/用量与费用/);
  assert.match(html,/4,500/);
  assert.match(html,/0.0100/);
  assert.match(html,/id="usage-price-input"/);
  assert.doesNotMatch(html,/API key|Bearer sample/);
  assert.equal(clearUsageMeter(),true);
  assert.equal(readUsageMeter().totals.calls,0);
  assert.equal(readUsagePricing()[JSON.stringify(['openrouter','model-A','text'])].inputPerMillion,1,'reset preserves custom rates');
 }finally{globalThis.localStorage=old}
});
test('unreported provider usage is unknown, never synthesized from payload length',()=>{
 const old=globalThis.localStorage;globalThis.localStorage=memoryStorage();
 try{
  recordRequestUsage({provider:'custom',model:'no-usage',success:true,payload:{choices:[{message:{content:'123456'}}]}});
  const summary=summarizeUsage();
  assert.equal(summary.totals.meteredCalls,0);
  assert.equal(summary.totals.unmeteredCalls,1);
  assert.equal(summary.totals.totalTokens,0);
  const html=renderUsageDashboard({lang:'en',provider:'custom',model:'no-usage'});
  assert.match(html,/Provider-reported tokens/);
  assert.match(html,/Provider-reported cost<\/span><strong>—/);
 }finally{globalThis.localStorage=old}
});
test('invalid user prices are rejected and model content is never written to the usage ledger',()=>{
 const old=globalThis.localStorage;const store=memoryStorage();globalThis.localStorage=store;
 try{
  assert.throws(()=>setUsagePrice({provider:'custom',model:'m',inputPerMillion:-1,outputPerMillion:5}),/INVALID_USAGE_PRICE/);
  recordRequestUsage({provider:'custom',model:'m',success:false,payload:{secret:'my-api-key',prompt:'secret-query'}});
  assert.doesNotMatch(store.getItem('chronicle-of-ages-usage-v1'),/my-api-key|secret-query/);
 }finally{globalThis.localStorage=old}
});

test('each actual HTTP request and JSON-recovery retry is metered separately',async()=>{
 const oldFetch=globalThis.fetch,oldStorage=globalThis.localStorage;
 globalThis.localStorage=memoryStorage();let calls=0;
 globalThis.fetch=async()=>{calls++;const content=calls===1?'{"events":[{"id":"partial"': '{"events":[],"facts":[]}';
  return {ok:true,status:200,json:async()=>({choices:[{finish_reason:calls===1?'length':'stop',message:{content}}],
   usage:{prompt_tokens:100+calls,completion_tokens:20+calls,total_tokens:120+2*calls}})}};
 };
 try{
  const output=await callChat({provider:'custom',endpoint:'https://example.org/chat',model:'test',key:'fake'},
   [{role:'user',content:'Generate one coherent world'}],{json:true,purpose:'simulation'});
  assert.deepEqual(output,{events:[],facts:[]});
  assert.equal(calls,2);
  assert.equal(readUsageMeter().totals.calls,2);
  assert.equal(readUsageMeter().totals.totalTokens,246);
 }finally{globalThis.fetch=oldFetch;globalThis.localStorage=oldStorage}
});
test('adaptive time split preserves completed earlier partitions and valid later causal links',async()=>{
 let calls=0,splits=0;
 const result=await runMatrix({interpretation:{operations:[op()]},scenarioCount:1,maxWindows:1,
  propose:async ({window})=>{
   calls++;if(window.from===1644&&window.to===2026)throw invalid();
   const id='w'+window.from;
   return {events:[event(id,window.from)]};
  },onProgress:()=>{}});
 assert.equal(calls,3);
 assert.deepEqual(result.preferred.events.map(e=>e.id),['w1644','w1836']);
 assert.equal(result.preferred.snapshots.length,2);
 assert.ok(result.preferred.events.every(e=>e.salient===true));
 assert.ok(result.preferred.events.some(e=>e.year===1644));
});
test('single dense year subdivides by region and can subdivide its region further by domain',async()=>{
 const focusCalls=[];
 const result=await runAdaptiveWindow({window:{from:2026,to:2026},
  execute:async (_win,{focus})=>{
   focusCalls.push(focus);
   if(!focus||(focus.region==='Europe and adjacent interactions'&&!focus.domain))throw invalid();
   return focus.region+'-'+(focus.domain||'all');
  }});
 assert.equal(result.results.length,6,'regional focus 4, with one split into 3 subject passes');
 assert.ok(result.expansions>=2);
 assert.ok(focusCalls.some(x=>x?.region==='Europe and adjacent interactions'&&x.domain));
});
test('if a one-year subdomain cannot fit, the algorithm fails visibly rather than fabricate empty history',async()=>{
 await assert.rejects(()=>runAdaptiveWindow({
  window:{from:2026,to:2026},execute:async()=>{throw invalid()}
 }),error=>error instanceof WindowExpansionError&&error.code==='WINDOW_SCOPE_TOO_DENSE');
});
test('the global ledger preserves more than nine causally checked milestones without trimming',async()=>{
 const timeline=await runMatrix({interpretation:{operations:[op(2026)]},scenarioCount:1,maxWindows:1,
  propose:async()=>({events:Array.from({length:14},(_,i)=>event('m'+i,2026))})});
 assert.equal(timeline.preferred.events.length,14);
 assert.ok(timeline.preferred.events.some(e=>e.salient===false));
 assert.equal(sanitizeWorldline({...timeline.preferred,id:'B',anchorYear:2026,facts:[],knowledge:[]})?.events.length,14);
});
test('dashboard and adaptive statuses are connected to settings, archive and page layout',async()=>{
 const app=await readFile('src/app.js','utf8'),style=await readFile('assets/style.css','utf8');
 const omega=await readFile('src/ucm-omega.mjs','utf8'),adapter=await readFile('src/chronicle-adapter.mjs','utf8');
 assert.match(app,/id="usage-dashboard"/);
 assert.match(app,/data-action='save-usage-price'|action==='save-usage-price'/);
 assert.match(app,/refreshUsageDashboard/);
 assert.match(style,/\.usage-metrics\{/);
 assert.match(omega,/runAdaptiveWindow\(/);
 assert.match(omega,/GLOBAL_CAUSAL_AUDIT_FAILED/);
 assert.match(adapter,/scopedFocus/);
});
