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
