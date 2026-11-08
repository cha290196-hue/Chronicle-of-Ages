/**
 * Client-local request usage accounting. This is not provider billing.
 * Only provider-supplied usage is counted as measured tokens. No request
 * prompts, assistant replies, endpoints or API keys are retained.
 */
import {deepseekModelTier,deepseekTokenQuote} from './deepseek-pricing.mjs';

export const USAGE_STORAGE_KEY='chronicle-of-ages-usage-v1';
export const PRICING_STORAGE_KEY='chronicle-of-ages-usage-pricing-v1';
const empty=()=>({calls:0,success:0,failed:0,meteredCalls:0,unmeteredCalls:0,
 inputTokens:0,outputTokens:0,totalTokens:0,cachedInputTokens:0,reasoningOutputTokens:0,
 providerCostUsd:0,providerCostCalls:0,unpricedInputTokens:0,unpricedOutputTokens:0,
 deepseekPricedCalls:0,deepseekExactCalls:0,deepseekBoundedCalls:0,
 deepseekEstimatedCny:0,deepseekMinCny:0,deepseekMaxCny:0});
const finite=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0?x:null;
const int=x=>{const n=finite(x);return n===null?null:Math.trunc(n)};
const safeText=x=>String(x||'').trim().slice(0,160);
const bucketKey=(provider,model,channel)=>JSON.stringify([provider,model,channel]);
const clonePlain=v=>JSON.parse(JSON.stringify(v));
const storageGet=(key)=>{try{return globalThis.localStorage?.getItem(key)||null}catch{return null}};
const storageSet=(key,value)=>{try{globalThis.localStorage?.setItem(key,JSON.stringify(value));return true}catch{return false}};
const signalChange=()=>{try{globalThis.dispatchEvent?.(new Event('chronicle-usage-updated'))}catch{}};
export function normalizeProviderUsage(payload){
 const usage=payload?.usage??payload?.response?.usage;
 if(!usage||typeof usage!=='object')return null;
 const input=int(usage.prompt_tokens??usage.input_tokens);
 const output=int(usage.completion_tokens??usage.output_tokens);
 const total=int(usage.total_tokens)??(input!==null&&output!==null?input+output:null);
 const cached=int(usage.prompt_cache_hit_tokens??usage.prompt_tokens_details?.cached_tokens??usage.input_tokens_details?.cached_tokens??usage.cached_tokens);
 const missed=int(usage.prompt_cache_miss_tokens??usage.input_tokens_details?.cache_miss_tokens);
 const reasoning=int(usage.completion_tokens_details?.reasoning_tokens??usage.output_tokens_details?.reasoning_tokens??usage.reasoning_tokens);
 const cost=finite(usage.cost??usage.total_cost??payload?.cost);
 if(input===null&&output===null&&total===null&&cost===null)return null;
 return {...{input,output,total,cached,reasoning,cost},...(missed!==null?{missed}:{})};
}
function accumulateDeepSeek(bucket,entry){
 const cost=entry.officialDeepSeek;
 if(!cost)return;
 bucket.deepseekPricedCalls=(bucket.deepseekPricedCalls||0)+1;
 if(cost.exact){
  bucket.deepseekExactCalls=(bucket.deepseekExactCalls||0)+1;
  bucket.deepseekEstimatedCny=(bucket.deepseekEstimatedCny||0)+cost.estimatedCny;
 }else bucket.deepseekBoundedCalls=(bucket.deepseekBoundedCalls||0)+1;
 bucket.deepseekMinCny=(bucket.deepseekMinCny||0)+cost.minCny;
 bucket.deepseekMaxCny=(bucket.deepseekMaxCny||0)+cost.maxCny;
}
function accumulate(bucket,entry){
 bucket.calls++;if(entry.success)bucket.success++;else bucket.failed++;
 if(entry.usage){
  bucket.meteredCalls++;
  bucket.inputTokens+=entry.usage.input??0;
  bucket.outputTokens+=entry.usage.output??0;
  bucket.totalTokens+=entry.usage.total??0;
  bucket.cachedInputTokens+=entry.usage.cached??0;
  bucket.reasoningOutputTokens+=entry.usage.reasoning??0;
  if(entry.usage.cost!==null){bucket.providerCostUsd+=entry.usage.cost;bucket.providerCostCalls++}
  else{bucket.unpricedInputTokens+=entry.usage.input??0;bucket.unpricedOutputTokens+=entry.usage.output??0}
 }else bucket.unmeteredCalls++;
 accumulateDeepSeek(bucket,entry);
}
export function readUsageMeter(){
 const raw=storageGet(USAGE_STORAGE_KEY);
 if(!raw)return {version:1,deepseekPricingV2:true,totals:empty(),models:{},recent:[]};
 try{
  const parsed=JSON.parse(raw);
  if(parsed.version!==1||!parsed.totals||!parsed.models||!Array.isArray(parsed.recent))throw Error('corrupted');
  // Upgrade existing local usage without throwing away historical counters.
  // Only the last 70 entries have timestamps/cache breakdown, so older
  // totals cannot safely be assigned a historical peak-hour tariff.
  if(!parsed.deepseekPricingV2){
   for(const entry of parsed.recent){
    entry.officialDeepSeek=deepseekTokenQuote({...entry});
    if(!entry.officialDeepSeek)continue;
    const bucket=parsed.models[bucketKey(entry.provider,entry.model,entry.channel)];
    if(bucket)accumulateDeepSeek(bucket,entry);
    accumulateDeepSeek(parsed.totals,entry);
   }
   parsed.deepseekPricingV2=true;
   storageSet(USAGE_STORAGE_KEY,parsed);
  }
  return parsed;
 }catch{return {version:1,deepseekPricingV2:true,totals:empty(),models:{},recent:[]}}
}
export function recordRequestUsage({provider='custom',model='unknown',channel='text',purpose='other',success=false,payload=null}={}){
 const state=readUsageMeter();
 const p=safeText(provider),m=safeText(model),ch=channel==='image'?'image':'text';
 const usage=normalizeProviderUsage(payload);
 const entry={time:new Date().toISOString(),provider:p,model:m,channel:ch,
  purpose:safeText(purpose),success:!!success,usage};
 entry.officialDeepSeek=deepseekTokenQuote(entry);
 const key=bucketKey(p,m,ch);
 if(!state.models[key])state.models[key]={provider:p,model:m,channel:ch,...empty()};
 accumulate(state.models[key],entry);accumulate(state.totals,entry);
 state.recent.unshift(entry);state.recent=state.recent.slice(0,300);
 const persisted=storageSet(USAGE_STORAGE_KEY,state);
 signalChange();
 return {entry,persisted};
}
export function readUsagePricing(){
 try{
  const raw=JSON.parse(storageGet(PRICING_STORAGE_KEY)||'{}');
  return raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
 }catch{return {}}
}
export function setUsagePrice({provider,model,channel='text',inputPerMillion,outputPerMillion}){
 const p=safeText(provider),m=safeText(model),ch=channel==='image'?'image':'text';
 if(!p||!m)throw Error('PRICE_MODEL_REQUIRED');
 const input=Number(inputPerMillion),output=Number(outputPerMillion);
 if(!Number.isFinite(input)||!Number.isFinite(output)||input<0||output<0||input>100000||output>100000)throw Error('INVALID_USAGE_PRICE');
 const all=readUsagePricing(),key=bucketKey(p,m,ch);
 all[key]={inputPerMillion:input,outputPerMillion:output};
 const persisted=storageSet(PRICING_STORAGE_KEY,all);
 signalChange();return persisted;
}
export function getUsagePrice(provider,model,channel='text',pricing=readUsagePricing()){
 return pricing[bucketKey(safeText(provider),safeText(model),channel)]||null;
}
export function meterRows(meter=readUsageMeter(),pricing=readUsagePricing()){
 return Object.values(meter.models||{}).map(row=>{
  const officialDeepSeek=deepseekModelTier(row.provider,row.model,row.channel);
  const price=officialDeepSeek?null:getUsagePrice(row.provider,row.model,row.channel,pricing);
  const estimated=price&&row.unpricedInputTokens!==undefined
   ?(row.unpricedInputTokens*price.inputPerMillion+row.unpricedOutputTokens*price.outputPerMillion)/1000000:null;
  return {...row,officialDeepSeekTier:officialDeepSeek,
   officialDeepSeekCny:row.deepseekEstimatedCny||0,
   officialDeepSeekMinCny:row.deepseekMinCny||0,
   officialDeepSeekMaxCny:row.deepseekMaxCny||0,
   officialDeepSeekExactCalls:row.deepseekExactCalls||0,
   officialDeepSeekBoundedCalls:row.deepseekBoundedCalls||0,
   officialDeepSeekUnpricedCalls:officialDeepSeek?Math.max(0,row.meteredCalls-(row.deepseekPricedCalls||0)):0,
   configuredPrice:price,estimatedUnbilledUsd:estimated,
   combinedKnownUsd:row.providerCostUsd+(estimated??0),
   missingPrice:!officialDeepSeek&&!price&&(row.meteredCalls-row.providerCostCalls)>0
  };
 }).sort((a,b)=>b.calls-a.calls);
}
export function summarizeUsage(meter=readUsageMeter(),pricing=readUsagePricing()){
 const rows=meterRows(meter,pricing);
 const estimate=rows.reduce((sum,r)=>sum+(r.estimatedUnbilledUsd??0),0);
 const deepseekRows=rows.filter(r=>r.officialDeepSeekTier);
 return {totals:clonePlain(meter.totals),rows,providerCostUsd:meter.totals.providerCostUsd,
  estimatedUsd:estimate,coveredUsd:meter.totals.providerCostUsd+estimate,
  deepseekPricedCalls:deepseekRows.reduce((n,r)=>n+(r.deepseekPricedCalls||0),0),
  deepseekExactCalls:deepseekRows.reduce((n,r)=>n+r.officialDeepSeekExactCalls,0),
  deepseekBoundedCalls:deepseekRows.reduce((n,r)=>n+r.officialDeepSeekBoundedCalls,0),
  deepseekUnpricedCalls:deepseekRows.reduce((n,r)=>n+r.officialDeepSeekUnpricedCalls,0),
  deepseekEstimatedCny:deepseekRows.reduce((n,r)=>n+r.officialDeepSeekCny,0),
  deepseekMinCny:deepseekRows.reduce((n,r)=>n+r.officialDeepSeekMinCny,0),
  deepseekMaxCny:deepseekRows.reduce((n,r)=>n+r.officialDeepSeekMaxCny,0),
  missingPriceModels:rows.filter(r=>r.missingPrice).length,
  unmeteredCalls:meter.totals.unmeteredCalls};
}
export function clearUsageMeter(){
 const ok=storageSet(USAGE_STORAGE_KEY,{version:1,deepseekPricingV2:true,totals:empty(),models:{},recent:[]});
 signalChange();return ok;
}
