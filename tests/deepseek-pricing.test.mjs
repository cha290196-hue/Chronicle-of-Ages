import test from 'node:test';
import assert from 'node:assert/strict';
import {
 deepseekModelTier,usageBillingProvider,deepseekBillingPeriod,deepseekTokenQuote,
 DEEPSEEK_RATES_CNY,DEEPSEEK_PRICE_SOURCE
} from '../src/deepseek-pricing.mjs';
import {
 normalizeProviderUsage,readUsageMeter,recordRequestUsage,summarizeUsage,
 setUsagePrice,clearUsageMeter
} from '../src/usage-meter.mjs';
import {renderUsageDashboard} from '../src/usage-dashboard.mjs';
import {readFile} from 'node:fs/promises';

const storage=()=>{const m=new Map();return {
 getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)
}};
const near=(a,b,tol=1e-10)=>assert.ok(Math.abs(a-b)<tol,`expected ${a}≈${b}`);
const quoted=(time,model='deepseek-flash',usage={input:1000,output:200,cached:400,missed:600})=>
 deepseekTokenQuote({provider:'deepseek',model,channel:'text',time,usage});
const off='2026-11-08T02:00:00.000Z'; // Sunday, off-peak
const peak='2026-11-09T01:30:00.000Z'; // Monday 09:30 Beijing, peak

test('published 2026 DeepSeek RMB rates distinguish Flash, Pro and three token categories',()=>{
 assert.deepEqual(DEEPSEEK_RATES_CNY['deepseek-flash'].offpeak,{hit:.02,miss:1,output:4});
 assert.deepEqual(DEEPSEEK_RATES_CNY['deepseek-flash'].peak,{hit:.04,miss:2,output:8});
 assert.deepEqual(DEEPSEEK_RATES_CNY['deepseek-v4-pro'].offpeak,{hit:.15,miss:4.5,output:13.5});
 assert.deepEqual(DEEPSEEK_RATES_CNY['deepseek-v4-pro'].peak,{hit:.30,miss:9,output:27});
 assert.equal(DEEPSEEK_PRICE_SOURCE,'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/');
 assert.equal(deepseekModelTier('deepseek','deepseek-flash'),'deepseek-flash');
 assert.equal(deepseekModelTier('deepseek','deepseek-v4-flash'),'deepseek-flash');
 assert.equal(deepseekModelTier('deepseek','deepseek-v4-flash-vision-exp'),'deepseek-flash');
 assert.equal(deepseekModelTier('deepseek','deepseek-v4-pro'),'deepseek-v4-pro');
 assert.equal(deepseekModelTier('deepseek','unknown-model'),null);
});
test('official host recognition never applies DeepSeek rate to proxy or another billing provider',()=>{
 assert.equal(usageBillingProvider('deepseek','https://api.deepseek.com/chat/completions'),'deepseek');
 assert.equal(usageBillingProvider('custom','https://api.deepseek.com/chat/completions'),'deepseek');
 assert.equal(usageBillingProvider('deepseek','https://api.proxy-provider.example/chat/completions'),'custom');
 assert.equal(usageBillingProvider('custom','https://fake-api.deepseek.com.evil.example/chat/completions'),'custom');
 assert.equal(usageBillingProvider('openrouter','https://openrouter.ai/api/v1/chat/completions'),'openrouter');
 assert.equal(deepseekTokenQuote({provider:'openrouter',model:'deepseek-flash',time:peak,usage:{input:1,output:1}}),null);
});
test('peak-hour transitions use Beijing local times and exempt 2026 national holidays',()=>{
 assert.equal(deepseekBillingPeriod(peak).period,'peak');
 assert.equal(deepseekBillingPeriod('2026-11-09T03:59:59Z').period,'peak');
 assert.equal(deepseekBillingPeriod('2026-11-09T04:00:00Z').period,'offpeak');
 assert.equal(deepseekBillingPeriod('2026-11-09T05:59:59Z').period,'offpeak');
 assert.equal(deepseekBillingPeriod('2026-11-09T06:00:00Z').period,'peak');
 assert.equal(deepseekBillingPeriod('2026-11-09T10:00:00Z').period,'offpeak');
 assert.equal(deepseekBillingPeriod(off).period,'offpeak');
 assert.equal(deepseekBillingPeriod('2026-10-01T01:30:00Z').period,'offpeak');
 assert.equal(deepseekBillingPeriod('2026-10-01T01:30:00Z').holiday,true);
 assert.equal(deepseekBillingPeriod('2026-02-16T01:30:00Z').period,'offpeak');
 assert.equal(deepseekBillingPeriod('2026-09-20T01:30:00Z').period,'offpeak','weekend makeup work remains off-peak');
 assert.equal(deepseekBillingPeriod('2027-11-08T01:30:00Z').holidayCalendarVerified,false);
});
test('a precise API cache breakdown gives precise official Flash/Pro peak/offpeak estimates',()=>{
 const flashOff=quoted(off),flashPeak=quoted(peak),proOff=quoted(off,'deepseek-v4-pro'),proPeak=quoted(peak,'deepseek-v4-pro');
 near(flashOff.estimatedCny,(400*.02+600*1+200*4)/1000000);
 near(flashPeak.estimatedCny,(400*.04+600*2+200*8)/1000000);
 near(proOff.estimatedCny,(400*.15+600*4.5+200*13.5)/1000000);
 near(proPeak.estimatedCny,(400*.30+600*9+200*27)/1000000);
 assert.ok(flashOff.exact&&flashPeak.exact&&proOff.exact&&proPeak.exact);
 assert.equal(flashPeak.minCny,flashPeak.maxCny);
});
test('DeepSeek provider cache fields are recognized at top level and cache-miss automatically derived',()=>{
 const usage=normalizeProviderUsage({usage:{
  prompt_tokens:1000,completion_tokens:200,total_tokens:1200,
  prompt_cache_hit_tokens:400,prompt_cache_miss_tokens:600
 }});
 assert.equal(usage.cached,400);
 assert.equal(usage.missed,600);
 near(deepseekTokenQuote({provider:'deepseek',model:'deepseek-flash',time:peak,usage}).estimatedCny,
  (400*.04+600*2+200*8)/1000000);
 const missingMiss={...usage};delete missingMiss.missed;
 assert.equal(quoted(peak,'deepseek-flash',missingMiss).miss,600);
});
test('missing cache information yields realistic bounds, not guessed precise charges',()=>{
 const x=quoted(peak,'deepseek-v4-pro',{input:1000,output:300,cached:null});
 assert.equal(x.exact,false);
 assert.equal(x.estimatedCny,null);
 near(x.minCny,(1000*.3+300*27)/1000000);
 near(x.maxCny,(1000*9+300*27)/1000000);
 assert.equal(quoted(peak,'deepseek-flash',{input:null,output:30}),null);
 assert.equal(quoted(peak,'deepseek-flash',{input:100,output:null}),null);
 const inconsistent=quoted(off,'deepseek-flash',{input:1000,output:300,cached:800,missed:900});
 assert.equal(inconsistent.exact,false);
});
test('new requests are automatically priced and aggregated in CNY, with original provider token accounting retained',()=>{
 const old=globalThis.localStorage;globalThis.localStorage=storage();
 try{
  const payload={usage:{prompt_tokens:1000,completion_tokens:200,
   prompt_cache_hit_tokens:400,prompt_cache_miss_tokens:600,total_tokens:1200}};
  const entry=recordRequestUsage({provider:'deepseek',model:'deepseek-flash',purpose:'simulation',success:true,payload}).entry;
  assert.ok(entry.officialDeepSeek);
  const quote=entry.officialDeepSeek.estimatedCny;
  const sum=summarizeUsage();
  near(sum.deepseekEstimatedCny,quote);
  near(sum.deepseekMinCny,quote);
  near(sum.deepseekMaxCny,quote);
  assert.equal(sum.deepseekExactCalls,1);
  assert.equal(sum.deepseekUnpricedCalls,0);
  assert.equal(sum.totals.totalTokens,1200);
  assert.equal(readUsageMeter().totals.deepseekPricedCalls,1,'no double accounting on read');
  setUsagePrice({provider:'deepseek',model:'deepseek-flash',inputPerMillion:999,outputPerMillion:999});
  assert.equal(summarizeUsage().estimatedUsd,0,'official DeepSeek overrides obsolete manual USD prices');
  const html=renderUsageDashboard({lang:'zh',provider:'deepseek',model:'deepseek-flash',
   endpoint:'https://api.deepseek.com/chat/completions'});
  assert.match(html,/DeepSeek 官方价格/);
  assert.match(html,/缓存命中/);
  assert.match(html,/官方价格自动测算/);
  assert.match(html,/¥/);
  assert.doesNotMatch(html,/id="usage-price-input"/,'official DeepSeek does not require manual rate fields');
  const costBefore=summarizeUsage().deepseekEstimatedCny;
  assert.equal(clearUsageMeter(),true);
  assert.equal(summarizeUsage().deepseekEstimatedCny,0);
  assert.ok(costBefore>0);
 }finally{globalThis.localStorage=old}
});
test('older local usage records can be repriced from retained timestamped entries once without changing tokens',()=>{
 const old=globalThis.localStorage;const store=storage();globalThis.localStorage=store;
 try{
  const usage={input:1000,output:200,total:1200,cached:400,reasoning:0,cost:null};
  const modelKey=JSON.stringify(['deepseek','deepseek-flash','text']);
  const bucket={provider:'deepseek',model:'deepseek-flash',channel:'text',calls:1,success:1,failed:0,meteredCalls:1,
   unmeteredCalls:0,inputTokens:1000,outputTokens:200,totalTokens:1200,
   cachedInputTokens:400,reasoningOutputTokens:0,providerCostUsd:0,providerCostCalls:0,
   unpricedInputTokens:1000,unpricedOutputTokens:200};
  const record={version:1,totals:{...bucket},models:{[modelKey]:bucket},
   recent:[{time:peak,provider:'deepseek',model:'deepseek-flash',channel:'text',purpose:'simulation',success:true,usage}]};
  store.setItem('chronicle-of-ages-usage-v1',JSON.stringify(record));
  const once=readUsageMeter();
  near(once.totals.deepseekEstimatedCny,(400*.04+600*2+200*8)/1000000);
  const twice=readUsageMeter();
  near(twice.totals.deepseekEstimatedCny,once.totals.deepseekEstimatedCny);
  assert.equal(twice.totals.totalTokens,1200);
  assert.equal(twice.deepseekPricingV2,true);
 }finally{globalThis.localStorage=old}
});
test('legacy requests older than retained history or without cache counts remain explicitly uncertain',()=>{
 const old=globalThis.localStorage;const store=storage();globalThis.localStorage=store;
 try{
  recordRequestUsage({provider:'deepseek',model:'deepseek-v4-pro',success:true,
   payload:{usage:{prompt_tokens:1000,completion_tokens:100}}});
  const sum=summarizeUsage();
  assert.equal(sum.deepseekBoundedCalls,1);
  assert.equal(sum.deepseekExactCalls,0);
  assert.ok(sum.deepseekMinCny<sum.deepseekMaxCny);
  const html=renderUsageDashboard({lang:'zh',provider:'deepseek',model:'deepseek-v4-pro',endpoint:'https://api.deepseek.com/chat/completions'});
  assert.match(html,/缺少缓存明细/);
  assert.match(html,/¥/);
  assert.match(html,/DeepSeek 官方定价/);
 }finally{globalThis.localStorage=old}
});
test('settings refreshes rate table from provider/model/endpoint instead of forcing manually entered DeepSeek prices',async()=>{
 const app=await readFile('src/app.js','utf8');
 const doc=await readFile('src/usage-dashboard.mjs','utf8');
 assert.ok(app.includes("endpoint:$('setting-endpoint')?.value||config.endpoint"));
 assert.match(app,/function refreshUsagePricing\(\)\{refreshUsageDashboard\(\)\}/);
 assert.match(doc,/deepseekModelTier\(billingProvider,model\)/);
 assert.match(doc,/DEEPSEEK_RATES_CNY\[deepseekTier\]/);
});
