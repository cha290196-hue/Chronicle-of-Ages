import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readUsageMeter,clearUsageMeter,recordRequestUsage,setUsagePrice,readUsagePricing,
 normalizeProviderUsage,summarizeUsage,meterRows} from '../src/usage-meter.mjs';
import {renderUsageDashboard} from '../src/usage-dashboard.mjs';
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
  assert.match(html,/Other reported costs \(USD\)<\/span><strong>—/);
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
 globalThis.fetch=async()=>{
  calls++;
  const content=calls===1?'{"events":[{"id":"partial"':'{"events":[],"facts":[]}';
  return {ok:true,status:200,json:async()=>({
   choices:[{finish_reason:calls===1?'length':'stop',message:{content}}],
   usage:{prompt_tokens:100+calls,completion_tokens:20+calls,total_tokens:120+2*calls}
  })};
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
test('finish_reason length on a syntactically valid JSON body is still treated as incomplete output',async()=>{
 const oldFetch=globalThis.fetch,oldStorage=globalThis.localStorage;
 globalThis.localStorage=memoryStorage();let calls=0;
 globalThis.fetch=async()=>{
  calls++;
  return {ok:true,status:200,json:async()=>({
   choices:[{finish_reason:calls===1?'length':'stop',message:{content:'{"events":[],"facts":[]}'}}],
   usage:{prompt_tokens:100,completion_tokens:100,total_tokens:200}
  })};
 };
 try{
  assert.deepEqual(await callChat({provider:'custom',endpoint:'https://example.org/chat',model:'test',key:'fake'},
   [{role:'user',content:'structured output'}],{json:true,purpose:'simulation'}),{events:[],facts:[]});
  assert.equal(calls,2,'valid JSON at a hard output cutoff must be retried, not accepted prematurely');
 }finally{globalThis.fetch=oldFetch;globalThis.localStorage=oldStorage}
});