import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {callChat,explainError} from '../src/core.js';
import {simulateOmega} from '../src/chronicle-adapter.mjs';
import {ModelJSONError} from '../src/structured-output.mjs';

const config={provider:'deepseek',endpoint:'https://api.deepseek.com/chat/completions',model:'deepseek-flash',key:'fake-for-tests'};
const intervention={intent:'edit',valid:true,operations:[{
 kind:'historical_change',scope:'earth',mode:'point',startYear:1644,endYear:1644,
 target:'Counterfactual global historical divergence',value:'changed'
}]};
function response(content,reason='stop'){
 return {ok:true,status:200,json:async()=>({choices:[{finish_reason:reason,message:{content}}],usage:{prompt_tokens:50,completion_tokens:30,total_tokens:80}})};
}
const event=(from)=>({id:'e'+from,year:from,en:'Audited global development '+from,
 zh:'世界演化 '+from,descriptionEn:'Validated causal consequence',category:'governance',
 region:'East Asia',threadKey:'regional-development-'+from,scope:'regional',
 significance:'major',relationToIntervention:'direct',certainty:'low',
 causes:['intervention:1'],requires:[],assumptions:[]});
const quickTimeout=(p,ms=1500)=>Promise.race([p,new Promise((_,rej)=>setTimeout(()=>rej(new Error('TIMEOUT')),ms))]);

test('DeepSeek structured simulation requests have 8192-token output ceiling without forcing extra tokens',async()=>{
 const original=globalThis.fetch;let body;
 globalThis.fetch=async (_url,init)=>{body=JSON.parse(init.body);return response('{"ok":true}')};
 try{
  const result=await callChat(config,[{role:'user',content:'Give JSON {"ok":true}'}],
   {json:true,purpose:'simulation',maxTokens:1900});
  assert.deepEqual(result,{ok:true});
  assert.equal(body.max_tokens,8192);
  assert.equal(body.response_format.type,'json_object');
  assert.equal(body.thinking.type,'disabled');
 }finally{globalThis.fetch=original}
});
test('DeepSeek blank JSON with finish_reason stop retries without response_format and retains full history request',async()=>{
 const original=globalThis.fetch;const requests=[];
 globalThis.fetch=async (_url,init)=>{
  const body=JSON.parse(init.body);requests.push(body);
  return requests.length===1?response('  \n\t  '):response('{"events":[{"id":"full-history"}],"facts":[]}');
 };
 try{
  const messages=[{role:'user',content:'Produce JSON for all events, with all causal dependencies intact'}];
  const output=await callChat(config,messages,{json:true,purpose:'simulation',maxTokens:4300});
  assert.equal(output.events[0].id,'full-history');
  assert.equal(requests.length,2);
  assert.equal(requests[0].max_tokens,8192);
  assert.equal(requests[1].max_tokens,8192);
  assert.ok(!('response_format' in requests[1]));
  assert.match(requests[1].messages.at(-1).content,/Preserve ALL substantive events/);
 }finally{globalThis.fetch=original}
});
test('when final metadata JSON fails, recovery only regenerates small presentation fields, not historical windows',async()=>{
 let proposals=0,primarySynthesis=0,titles=0,narratives=0;
 const call=async(_config,messages)=>{
  const user=messages.at(-1).content;
  if(user.includes('Classify user input'))return intervention;
  if(user.includes('Propose counterfactual events for scenario')){
   proposals++;
   const m=user.match(/window \[(-?\d+), (-?\d+)\]/);
   assert.ok(m);
   return {events:[event(Number(m[1]))],facts:[],summary:'Carefully examined state'};
  }
  if(user.includes('Summarize the preferred scenario')){
   primarySynthesis++;throw new ModelJSONError('truncated');
  }
  if(user.includes('Produce historically precise, natural bilingual titles')){
   titles++;return {titleEn:'Alternative Earth',titleZh:'另一种地球历史'};
  }
  if(user.includes('Write accurate bilingual worldline overviews')){
   narratives++;return {summaryEn:'Causally linked history',summaryZh:'有因果联系的世界历史',impacts:['Social divergence']};
  }
  throw Error('UNEXPECTED_PROMPT '+user.slice(0,180));
 };
 const result=await quickTimeout(simulateOmega({
  prompt:'Change global history in 1644',config:{},callChat:call,
  makeId:()=> 'canonical-branch',scenarioCount:1,maxWindows:6
 }));
 assert.equal(proposals,6,'no second history and no regeneration of approved history');
 assert.equal(primarySynthesis,1);
 assert.equal(titles,1);
 assert.equal(narratives,1);
 assert.equal(result.worldline.events.length,6);
 assert.equal(result.worldline.summaryZh,'有因果联系的世界历史');
 assert.equal(result.worldline.titleZh,'另一种地球历史');
 assert.equal(result.worldline.omega.scenarios,1);
});
test('a syntactically valid but missing summary must not silently save an empty worldline description',async()=>{
 let primary=0,sub=0;
 const answer=await quickTimeout(simulateOmega({
  prompt:'A change in 2026',config:{},makeId:()=> 'one',
  maxWindows:1,callChat:async (_cfg,messages)=>{
   const user=messages.at(-1).content;
   if(user.includes('Classify user input'))return {...intervention,operations:[{...intervention.operations[0],startYear:2026,endYear:2026}]};
   if(user.includes('Propose counterfactual events'))return {events:[event(2026)],facts:[]};
   if(user.includes('Summarize the preferred scenario')){primary++;return {titleZh:'标题'};}
   if(user.includes('Produce historically precise')){sub++;return {titleEn:'Title',titleZh:'标题'};}
   if(user.includes('Write accurate bilingual')){sub++;return {summaryEn:'Real summary',summaryZh:'真实总结',impacts:[]};}
   throw Error('UNEXPECTED');
  }
 }));
 assert.equal(primary,1);
 assert.equal(sub,2);
 assert.equal(answer.worldline.summaryZh,'真实总结');
 assert.equal(answer.worldline.events.length,1);
});
test('phase errors identify intake versus the closing synthesis rather than blame the whole history',async()=>{
 let calls=0;
 await assert.rejects(()=>simulateOmega({
  prompt:'Historical edit',config:{},makeId:()=> 'test',
  callChat:async()=>{calls++;throw new ModelJSONError('empty')}
 }),e=>e.phase==='validation'&&explainError(e,'zh').includes('历史干预识别'));
 assert.equal(calls,1);
 const s=Object.assign(new ModelJSONError('truncated'),{phase:'synthesis'});
 assert.match(explainError(s,'zh'),/最终世界线总结/);
 assert.match(explainError(s,'en'),/summarizing the worldline/);
});
test('errors stay visible with a close control instead of vanishing at 3800ms',async()=>{
 const [app,css]=await Promise.all([readFile('src/app.js','utf8'),readFile('assets/style.css','utf8')]);
 assert.match(app,/if\(!error\)toastTimer=setTimeout/);
 assert.match(app,/dismiss\.addEventListener\('click'/);
 assert.match(css,/\.toast\.persistent/);
 assert.match(css,/\.toast-dismiss/);
});
