import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {simulateOmega} from '../src/chronicle-adapter.mjs';
import {runAdaptiveWindow} from '../src/adaptive-propagation.mjs';
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

test('a confirmed full 8192-token DeepSeek cutoff skips an identical doomed retry and preserves history through subdivision',async()=>{
 const previousFetch=globalThis.fetch,previousStorage=globalThis.localStorage;
 globalThis.localStorage=memoryStorage();let calls=0,truncated=0;
 globalThis.fetch=async(_url,options)=>{
  calls++;const body=JSON.parse(options.body);
  const range=body.messages.at(-1).content.match(/window \[(-?\d+), (-?\d+)\]/);
  assert.ok(range);assert.equal(body.max_tokens,8192);
  if(+range[1]===1644&&+range[2]===2026){
   truncated++;
   return {ok:true,status:200,json:async()=>({
    choices:[{finish_reason:'length',message:{content:'{"events":[{"id":"partial"'} }],
    usage:{prompt_tokens:300,completion_tokens:8192,total_tokens:8492}
   })};
  }
  return {ok:true,status:200,json:async()=>({
   choices:[{finish_reason:'stop',message:{content:JSON.stringify({events:[{year:+range[1],id:'year-'+range[1]}],facts:[]})}}],
   usage:{prompt_tokens:400,completion_tokens:180,total_tokens:580}
  })};
 };
 try{
  const result=await runAdaptiveWindow({
   window:{from:1644,to:2026},
   execute:(window)=>callChat({
    provider:'deepseek',endpoint:'https://api.deepseek.com/chat/completions',
    model:'deepseek-flash',key:'mock-key'
   },[{role:'system',content:'Generate JSON full history.'},{
    role:'user',content:`Propose historical events for window [${window.from}, ${window.to}]`
   }],{json:true,purpose:'simulation',stage:'historical-window',maxTokens:4300})
  });
  assert.equal(truncated,1,'full-size prompt was not wasted on an identical retry');
  assert.equal(calls,3,'one truncated parent and two valid smaller historical windows');
  assert.equal(result.expansions,1);
  assert.equal(result.results.length,2);
  assert.deepEqual(result.results.map(r=>r.events[0].year),[1644,1836]);
  assert.equal(readUsageMeter().totals.calls,3,'all consumed tokens remain counted');
 }finally{globalThis.fetch=previousFetch;globalThis.localStorage=previousStorage}
});

test('the user-facing performance dashboard includes real latency, and core causal guardrails remain',async()=>{
 const [usage,adapter,kernel,core]=await Promise.all([
  readFile('src/usage-dashboard.mjs','utf8'),readFile('src/world-simulation.mjs','utf8'),
  readFile('src/ucm-omega.mjs','utf8'),readFile('src/core.js','utf8')
 ]);
 assert.match(usage,/stageTimings/);
 assert.match(usage,/Measured latency by simulation stage/);
 assert.match(adapter,/'historical-window'/);
 assert.match(kernel,/GLOBAL_CAUSAL_AUDIT_FAILED/);
 assert.match(adapter,/validateSemanticReview/);assert.match(adapter,/initializeWorld/);
 assert.doesNotMatch(kernel,/const jobs=Array\.from\(\{length:parallelism/);
});
