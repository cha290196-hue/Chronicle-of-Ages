import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {simulatePromptWorld,explorePromptWorld,adaptPromptWorld,promptRequestOptions} from '../src/prompt-world.mjs';
import {simulate,exploreCore,sanitizeWorldline,worldEvents,worldFacts,callChat} from '../src/core.js';
import {mergeKnowledge,sanitizeKnowledge} from '../src/exploration-knowledge.mjs';

const config={provider:'deepseek',endpoint:'https://api.deepseek.com/chat/completions',model:'deepseek-flash',key:'test-only'};
const world=(count=1,prose='A developed conditional history.')=>({title:'A model-authored world',summary:prose,expandedInput:'The model chose an interpretation and its date.',
 fork:{year:700,mode:'point',explanation:'A model-chosen divergence.'},assumptions:['The model supplied the missing setting.'],narrative:prose,worldState:prose,
 events:Array.from({length:count},(_,i)=>({year:701+i,title:'Event '+i,text:prose,category:'model-chosen category',milestone:i%2===0})),facts:[]});
const args=extra=>({prompt:'如果这个思想没有出现',makeId:()=> 'world-1',config,lang:'zh',...extra});

test('generation uses one thinking response, with no admission, graph, fixed coverage or audit request',async()=>{
 const calls=[];
 const {worldline}=await simulatePromptWorld(args({autoComplete:false,budgetMs:1,callChat:async(c,m,o)=>{calls.push({c,m,o});return world()}}));
 assert.equal(calls.length,1);assert.equal(calls[0].o.stage,'prompt-world');assert.equal(calls[0].o.reasoning,true);assert.equal(calls[0].o.profile,'prompt-llm');
 assert.equal(calls[0].o.signal,undefined,'no engine deadline controller is substituted');
 const context=JSON.parse(calls[0].m[1].content);
 assert.equal(context.input,'如果这个思想没有出现');assert.equal(context.inputPolicy,undefined);assert.equal(context.regions,undefined);assert.equal(context.checkpointCandidates,undefined);
 assert.equal(worldline.anchorYear,700);assert.equal(worldline.simulation.version,4);assert.equal(worldline.simulation.graph,undefined);
});

test('model-chosen output volume and all long prose survive persistence without padding or quotas',async()=>{
 const prose='模型自主决定的完整正文📚。'.repeat(1200);
 for(const count of [0,1,300]){
  const {worldline}=await simulatePromptWorld(args({callChat:async()=>world(count,prose)}));
  const restored=sanitizeWorldline(JSON.parse(JSON.stringify(worldline)));
  assert.ok(restored);assert.equal(restored.events.length,count);assert.equal(restored.summaryZh,prose);
  assert.equal(restored.simulation.narrative,prose);assert.equal(restored.simulation.worldState,prose);
  if(count)assert.equal(restored.events[0].descriptionZh,prose);
 }
});

test('child generation receives complete parent content and inherits shared history without mutating the parent',async()=>{
 const parent=adaptPromptWorld(world(2),{prompt:'Parent',runId:'parent'});
 parent.events[0].year=701;parent.events[1].year=900;
 parent.facts=[{id:'fact',firstYear:750,nameEn:'Setting',nameZh:'设定',descriptionEn:'Full detail',descriptionZh:'完整设定'}];
 const before=structuredClone(parent);let context;
 const raw={...world(),fork:{year:800},events:[{year:950,title:'A different continuation',text:'Reconsidered by the model.'}]};
 const {worldline}=await simulatePromptWorld(args({branches:[parent],parentId:parent.id,callChat:async(_c,m)=>{context=JSON.parse(m[1].content);return raw}}));
 assert.equal(context.selectedWorld.simulation.narrative,parent.simulation.narrative);
 assert.ok(context.selectedWorld.events.some(e=>e.year===900),'parent later history is context for the model, not silently clipped');
 assert.deepEqual(worldline.inherited.events.map(e=>e.year),[701]);assert.equal(worldline.inherited.facts.length,1);assert.deepEqual(parent,before);
 assert.ok(worldEvents([parent,worldline],worldline).some(e=>e.year===950));assert.equal(worldFacts([parent,worldline],worldline).length,1);
 assert.ok(sanitizeWorldline(JSON.parse(JSON.stringify(worldline))));
});

test('the Core answers and develops arbitrary details in one call with full dialogue and complete world context',async()=>{
 const branch=adaptPromptWorld(world(),{prompt:'Parent',runId:'B'}),history=Array.from({length:30},(_,i)=>({role:i%2?'assistant':'user',content:'Dialogue '+i}));
 const answer='具体的世界内回答。'.repeat(1400);let context,calls=0;
 const out=await explorePromptWorld({question:'某个国家某种设备的参数及普通人的使用方式',branch,events:branch.events,facts:[],history,config,makeId:()=> 'q',lang:'zh',callChat:async(_c,m,o)=>{calls++;context=JSON.parse(m[1].content);assert.equal(o.stage,'prompt-core');return {answer,knowledge:[{year:2026,name:'自由决定的新设定',text:answer,kind:'model-selected kind',value:{parameters:['One','Two']}}]}}});
 assert.equal(calls,1);assert.deepEqual(context.conversation,history);assert.deepEqual(context.selectedWorld,branch);
 assert.equal(out.answer,answer);assert.equal(out.knowledge.length,1);assert.equal(sanitizeKnowledge(out.knowledge[0]).descriptionZh,answer);
 const saved=mergeKnowledge([],out.knowledge);assert.equal(saved.stats.invalid,0);assert.equal(saved.facts[0].kind,'model-selected kind');
 const restored=sanitizeWorldline({...branch,knowledge:saved.facts});assert.equal(restored.knowledge[0].descriptionEn,answer);
});

test('model-led knowledge is saved without mechanical quantity, dependency or semantic conflict gates',async()=>{
 const out=await explorePromptWorld({question:'继续补充',branch:{id:'B'},config,makeId:()=> 'q',callChat:async()=>({answer:'自主补全后的回答',knowledge:[{year:2026,name:'New world setting',text:'An articulated model-authored setting.',entity:'X',attribute:'Y',value:'new',quantity:{note:'a model-chosen qualitative quantity'},evidenceIds:[]}]})});
 const previous={...out.knowledge[0],id:'old',value:'old'};
 const merged=mergeKnowledge([previous],out.knowledge);
 assert.equal(merged.stats.conflicts,0);assert.equal(merged.stats.invalid,0);assert.equal(merged.facts.length,2);
});

test('model-selected nonpersistent hypothetical analysis returns the full answer without committing new canon',async()=>{
 const out=await explorePromptWorld({question:'如果再改变条件呢',config,makeId:()=> 'q',callChat:async()=>({answer:'The hypothetical analysis.',persist:false,knowledge:[{name:'Not committed',text:'A hypothetical detail.'}]})});
 assert.equal(out.answer,'The hypothetical analysis.');assert.deepEqual(out.knowledge,[]);
});

test('all world prose reaches the model while image bytes remain outside text context',async()=>{
 const branch=adaptPromptWorld(world(),{prompt:'Parent',runId:'B'});
 branch.image={data:'data:image/png;base64,UNNEEDED_IMAGE_BYTES',prompt:'The world image description'};
 const before=structuredClone(branch);let content;
 await explorePromptWorld({question:'补全这个世界',branch,config,makeId:()=> 'q',callChat:async(_c,m)=>{content=m[1].content;return {answer:'Completed answer',knowledge:[]}}});
 assert.ok(content.includes(branch.simulation.narrative));assert.ok(content.includes(branch.image.prompt));
 assert.ok(!content.includes('UNNEEDED_IMAGE_BYTES'));assert.deepEqual(branch,before);
});

test('only display/storage shape errors and cancellation stop acceptance, never absent regional or graph structures',async()=>{
 await assert.rejects(simulatePromptWorld(args({callChat:async()=>({...world(),fork:{year:'not a date'}})})),e=>e.code==='PROMPT_OUTPUT_INVALID');
 const controller=new AbortController();
 const pending=simulatePromptWorld(args({signal:controller.signal,callChat:async(_c,_m,o)=>{controller.abort();assert.equal(o.signal,controller.signal);return world()}}));
 await assert.rejects(pending,e=>e.name==='AbortError');
});

test('the public creation and Core routes use normal JSON thinking calls and never strict audit tools',async()=>{
 const before=globalThis.fetch,requests=[];let next=world();
 globalThis.fetch=async(url,init)=>{requests.push({url,body:JSON.parse(init.body)});return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(next)}}]})}};
 try{
  const branch=await simulate({prompt:'自动补全这条设想',config,autoComplete:false,budgetMs:1,lang:'zh'});
  next={answer:'LLM直接回答并补全。',knowledge:[]};await exploreCore({question:'后续如何',branch,branches:[branch],config});
  assert.equal(requests.length,2);
  for(const {url,body}of requests){assert.equal(url,config.endpoint);assert.equal(body.thinking.type,'enabled');assert.equal(body.reasoning_effort,'high');assert.deepEqual(body.response_format,{type:'json_object'});assert.equal(body.tools,undefined);assert.equal(body.max_tokens,393216)}
 }finally{globalThis.fetch=before}
});

test('truncated model-led output is not silently stored or regenerated with shortened history',async()=>{
 const before=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return {ok:true,json:async()=>({choices:[{finish_reason:'length',message:{content:JSON.stringify(world())}}]})}};
 try{await assert.rejects(()=>callChat(config,[],promptRequestOptions(config,'prompt-world','simulation')),e=>e.reason==='truncated');assert.equal(calls,1)}finally{globalThis.fetch=before}
});

test('model-led generation does not reject an otherwise complete response for exceeding the retired time budget',async()=>{
 let clock=0;
 const {worldline}=await simulatePromptWorld(args({budgetMs:1,now:()=>clock,callChat:async()=>{clock=240001;return world()}}));
 assert.equal(worldline.simulation.timing.elapsedMs,240001);assert.equal(worldline.simulation.timing.completed,true);
});

test('compatible transport can omit a rejected token-capacity parameter without altering the task',async()=>{
 const before=globalThis.fetch,bodies=[];
 globalThis.fetch=async(_url,init)=>{bodies.push(JSON.parse(init.body));return bodies.length===1
  ?{ok:false,status:400,json:async()=>({error:{message:'max_tokens exceeds the model maximum'}})}
  :{ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:'{"answer":"Complete answer","knowledge":[]}'}}]})}};
 const custom={...config,provider:'custom',endpoint:'https://example.test/chat/completions'};
 const messages=[{role:'system',content:'Return complete JSON'},{role:'user',content:'The full original task'}];
 try{
  const result=await callChat(custom,messages,promptRequestOptions(custom,'prompt-core','exploration'));
  assert.equal(result.answer,'Complete answer');assert.equal(bodies.length,2);assert.equal(bodies[1].max_tokens,undefined);
  assert.deepEqual(bodies[1].messages,messages);assert.deepEqual(bodies[1].response_format,{type:'json_object'});
 }finally{globalThis.fetch=before}
});

test('syntax recovery preserves full prompt context and does not add semantic audit stages',async()=>{
 const before=globalThis.fetch,bodies=[];
 globalThis.fetch=async(_url,init)=>{bodies.push(JSON.parse(init.body));return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:bodies.length===1?'not json':JSON.stringify(world())}}]})}};
 try{
  const result=await simulate({prompt:'自主解释这个设想',config,lang:'zh'});
  assert.equal(result.simulation.engine,'Prompt LLM');assert.equal(bodies.length,2);
  assert.deepEqual(bodies[1].messages.slice(0,2),bodies[0].messages);
  assert.ok(bodies.every(b=>!b.tools&&b.thinking.type==='enabled'));
 }finally{globalThis.fetch=before}
});

test('version-4 world prose renders inside the existing world-state view with safe text escaping',()=>{
 const source=readFileSync('src/app.js','utf8'),code=source.slice(source.indexOf('function renderWorldState('),source.indexOf('function renderOverview('));
 const branch=adaptPromptWorld({...world(),narrative:'<script>unsafe</script> 完整历史',worldState:'模型决定的世界终态'},{prompt:'Input',runId:'B'});
 const context={state:{lang:'zh'},formatAnswer:x=>String(x).replaceAll('<','&lt;'),renderCompletionNotes:()=>''};
 const html=runInNewContext(code+';renderWorldState(branch)',{...context,branch});
 assert.match(html,/world-state/);assert.match(html,/完整历史/);assert.match(html,/模型决定的世界终态/);assert.doesNotMatch(html,/<script>/);
});
