import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {simulateOmega} from '../src/chronicle-adapter.mjs';
import {callChat} from '../src/core.js';
import {readUsageMeter,recordRequestUsage,summarizeUsage,groupStageTimings} from '../src/usage-meter.mjs';
import {renderUsageDashboard} from '../src/usage-dashboard.mjs';

const memoryStorage=()=>{const entries=new Map();return {
 getItem:k=>entries.get(k)??null,setItem:(k,v)=>entries.set(k,String(v)),
 removeItem:k=>entries.delete(k)
}};
const intervention={intent:'edit',valid:true,operations:[{
 kind:'historical_change',scope:'earth',mode:'point',startYear:1644,
 endYear:1644,target:'Earth political divergence',value:'changed'
}]};
const event=year=>({
 id:'history-'+year,year,en:'World development '+year,zh:'历史变化 '+year,
 region:'Europe',threadKey:'european-institutions-'+year,
 category:'governance',significance:'major',scope:'regional',
 relationToIntervention:'direct',certainty:'low',causes:['intervention:1'],
 requires:[],assumptions:[]
});

test('all chronological historical calls reuse a long invariant prefix while preserving every causal rule and dynamic fact',async()=>{
 const seen=[],stages=[];
 const result=await simulateOmega({
  prompt:'In 1644 Earth diverges politically',config:{},makeId:()=> 'branch-one',
  maxWindows:6,callChat:async(_config,messages,options)=>{
   const text=messages.at(-1).content;stages.push(options.stage);
   if(text.includes('Classify user input into edit'))return intervention;
   if(text.includes('Summarize the preferred scenario'))return {
    titleEn:'One Earth',titleZh:'另一世界',
    summaryEn:'Historical worldline',summaryZh:'完整历史',impacts:[]
   };
   assert.match(text,/Propose counterfactual events for scenario 1, window \[/);
   assert.equal(options.stage,'historical-window');
   seen.push(text);
   const match=text.match(/window \[(-?\d+), (-?\d+)\]/);
   return {events:[event(Number(match[1]))],facts:[],summary:'Independent historic events'};
  }
 });
 assert.equal(seen.length,6,'no unnecessary second full simulation');
 assert.equal(stages[0],'interpretation');
 assert.equal(stages.at(-1),'synthesis');
 const prefix=seen[0].slice(0,1800);
 assert.ok(seen.every(text=>text.startsWith(prefix)),'stable 1800-character prefix for repeated DeepSeek caching');
 assert.ok(seen[0].indexOf('Propose counterfactual events for scenario')>1800);
 for(const text of seen){
  for(const phrase of [
   'WORLD','Earth','INDEPENDENT events','pre-fork history',
   'never invent a cause reference','never 0','Valid causal reference IDs',
   'relationToIntervention','Interventions (do-operations):','Return JSON',
   'Physical-constant counterfactuals'
  ])assert.ok(text.toLowerCase().includes(phrase.toLowerCase()),'Missing original constraint: '+phrase);
 }
 assert.equal(result.worldline.events.length,6);
 assert.equal(result.worldline.omega.scenarios,1);
 assert.deepEqual(result.analysis.alternatives,[]);
 assert.equal(result.analysis.preferred.audit.rejected,0);
});

test('per-stage API timing measures only request latency and never persists prompts or API keys',()=>{
 const before=globalThis.localStorage;const local=memoryStorage();globalThis.localStorage=local;
 try{
  recordRequestUsage({provider:'deepseek',model:'deepseek-flash',stage:'historical-window',
   purpose:'simulation',elapsedMs:1400,success:true,
   payload:{usage:{prompt_tokens:1000,completion_tokens:200,prompt_cache_hit_tokens:600,prompt_cache_miss_tokens:400}}});
  recordRequestUsage({provider:'deepseek',model:'deepseek-flash',stage:'historical-window',
   purpose:'simulation',elapsedMs:2300,success:false});
  recordRequestUsage({provider:'deepseek',model:'deepseek-flash',stage:'world-coverage',
   purpose:'simulation',elapsedMs:900,success:true,
   payload:{usage:{prompt_tokens:700,completion_tokens:50}}});
  const state=readUsageMeter(),summary=summarizeUsage();
  assert.equal(state.totals.calls,3);
  assert.equal(summary.timedCalls,3);
  assert.equal(summary.averageElapsedMs,(1400+2300+900)/3);
  assert.equal(state.totals.maxElapsedMs,2300);
  assert.equal(state.totals.totalTokens,1950);
  const groups=groupStageTimings(state.recent);
  const historic=groups.find(r=>r.stage==='historical-window');
  assert.equal(historic.calls,2);
  assert.equal(historic.failures,1);
  assert.equal(historic.averageMs,1850);
  assert.equal(groups.find(r=>r.stage==='world-coverage').elapsedMs,900);
  const html=renderUsageDashboard({lang:'zh',provider:'deepseek',
   model:'deepseek-flash',endpoint:'https://api.deepseek.com/chat/completions'});
  assert.match(html,/推演各阶段的真实等待时间/);
  assert.match(html,/历史时段推演/);
  assert.match(html,/全球覆盖补充/);
  assert.match(html,/1\.5s/);
  const stored=local.getItem('chronicle-of-ages-usage-v1');
  assert.doesNotMatch(stored,/password|secret|authorization|user message|prompt content/);
 }finally{globalThis.localStorage=before}
});

test('actual DeepSeek API bridge tags latency separately for initial call and recovery retry',async()=>{
 const beforeFetch=globalThis.fetch,beforeStorage=globalThis.localStorage;
 globalThis.localStorage=memoryStorage();let count=0;
 globalThis.fetch=async()=>{
  count++;await new Promise(resolve=>setTimeout(resolve,12));
  return {ok:true,status:200,json:async()=>({
   choices:[{finish_reason:'stop',message:{content:count===1?'   ':'{"events":[{"id":"retained"}],"facts":[]}'}}],
   usage:{prompt_tokens:250,completion_tokens:40,total_tokens:290}
  })};
 };
 try{
  const result=await callChat({
   provider:'deepseek',endpoint:'https://api.deepseek.com/chat/completions',
   model:'deepseek-flash',key:'test-only-key'
  },[{role:'user',content:'Return JSON with history events, no omissions'}],
  {json:true,purpose:'simulation',stage:'historical-window',maxTokens:4300});
  assert.equal(result.events[0].id,'retained');
  const rows=readUsageMeter().recent;
  assert.equal(rows.length,2);
  assert.ok(rows.every(x=>x.stage==='historical-window'));
  assert.ok(rows.every(x=>x.elapsedMs>=10));
  assert.ok(rows.every(x=>x.usage.total===290));
  assert.ok(rows.every(x=>!('key' in x)&&!('messages' in x)));
 }finally{globalThis.fetch=beforeFetch;globalThis.localStorage=beforeStorage}
});

test('the user-facing performance dashboard includes real latency, and core causal guardrails remain',async()=>{
 const [usage,adapter,kernel,core]=await Promise.all([
  readFile('src/usage-dashboard.mjs','utf8'),readFile('src/chronicle-adapter.mjs','utf8'),
  readFile('src/ucm-omega.mjs','utf8'),readFile('src/core.js','utf8')
 ]);
 assert.match(usage,/stageTimings/);
 assert.match(usage,/Measured latency by simulation stage/);
 assert.match(adapter,/'historical-window'/);
 assert.match(kernel,/GLOBAL_CAUSAL_AUDIT_FAILED/);
 assert.match(core,/scenarioCount:1,maxWindows:6/);
 assert.doesNotMatch(kernel,/const jobs=Array\.from\(\{length:parallelism/);
});
