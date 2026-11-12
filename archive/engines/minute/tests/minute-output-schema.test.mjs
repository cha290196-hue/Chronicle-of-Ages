import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sanitizeWorldline} from '../../../../src/core.js';
import {callChat,explainError} from '../src/chat-transport.mjs';
import {parseModelJSON} from '../../../../src/structured-output.mjs';
import {simulateMinute} from '../src/minute-simulation.mjs';
import {MINUTE_WORLD_SCHEMA,MINUTE_AUDIT_SCHEMA,strictMinuteRequest,outputSchemaIssue,normalizeMinuteAudit} from '../src/minute-output-schema.mjs';
import {MINUTE_DRAFT,MINUTE_REVIEW} from '../src/minute-prompts.mjs';

const config={provider:'deepseek',endpoint:'https://api.deepseek.com/chat/completions',model:'deepseek-flash',key:'synthetic-test-key'};
const saved=JSON.parse(await readFile('archive/engines/minute/evaluation/flash-dynamic-ming-final-20261109.json','utf8'));
const draft=JSON.parse(saved.responses[0].content);
const args={json:true,profile:'minute',stage:'minute-world',purpose:'simulation',maxTokens:65536};
const toolReply=(value,name='submit_complete_world',finish='tool_calls')=>({ok:true,json:async()=>({choices:[{finish_reason:finish,message:{content:null,
 tool_calls:[{id:'synthetic-call',type:'function',function:{name,arguments:typeof value==='string'?value:JSON.stringify(value)}}]}}]})});
// Convert recorded control messages to strict nullable placeholders. This only
// projects audit-control keys; world prose, graph and edits are never shortened.
function strictAudit(value,schema=MINUTE_AUDIT_SCHEMA){
 if(schema.anyOf){if(value==null)return null;return strictAudit(value,schema.anyOf.find(s=>s.type!=='null'))}
 if(schema.type==='object')return Object.fromEntries(Object.entries(schema.properties).map(([k,s])=>[k,strictAudit(value?.[k],s)]));
 if(schema.type==='array')return (value||[]).map(v=>strictAudit(v,schema.items));
 return value;
}

test('strict schemas accept complete recorded prose and follow the supported provider schema subset',()=>{
 assert.equal(outputSchemaIssue(draft,MINUTE_WORLD_SCHEMA),null);
 const visit=s=>{
  for(const key of ['minItems','maxItems','minLength','maxLength'])assert.equal(Object.hasOwn(s,key),false,'No content quotas');
  if(s.type==='object'){
   assert.equal(s.additionalProperties,false);assert.deepEqual(s.required,Object.keys(s.properties));
   Object.values(s.properties).forEach(visit);
  }
  if(s.items)visit(s.items);if(s.anyOf)s.anyOf.forEach(visit);
 };
 visit(MINUTE_WORLD_SCHEMA);visit(MINUTE_AUDIT_SCHEMA);
 assert.equal(strictMinuteRequest({...config,endpoint:'https://proxy.invalid/chat/completions'},'minute-world'),null);
 assert.equal(strictMinuteRequest(config,'question-plan'),null);
});

test('official creation forces the strict named tool at the beta endpoint and reads its arguments once',async()=>{
 const previous=globalThis.fetch,requests=[];
 globalThis.fetch=async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return toolReply(draft)};
 try{
  assert.deepEqual(await callChat(config,[{role:'user',content:'假如明朝没有灭亡'}],args),draft);
  assert.equal(requests.length,1);const {url,body}=requests[0];
  assert.equal(url,'https://api.deepseek.com/beta/chat/completions');
  assert.equal(body.tools[0].function.strict,true);assert.deepEqual(body.tools[0].function.parameters,MINUTE_WORLD_SCHEMA);
  assert.deepEqual(body.tool_choice,{type:'function',function:{name:'submit_complete_world'}});
  assert.equal(body.thinking.type,'disabled');assert.equal(body.max_tokens,65536);assert.equal('response_format' in body,false);
 }finally{globalThis.fetch=previous}
});

test('recorded Christianity generation fits the strict contract with all 100 events and 42 domain accounts',async()=>{
 const recorded=JSON.parse(await readFile('archive/engines/minute/evaluation/failures/christianity-final-timeout-20261109.json','utf8'));
 const value=JSON.parse(recorded.responses[0].content);
 assert.equal(outputSchemaIssue(value,MINUTE_WORLD_SCHEMA),null);
 assert.equal(value.world.trajectories.flatMap(r=>r.events).length+value.world.effects.length,100);
 assert.equal(value.world.regions.reduce((n,r)=>n+r.domains.length,0),42);
 // That historical trial timed out during audit. This checks its generation
 // format/content only and deliberately does not relabel it a successful run.
 assert.equal(recorded.success,false);assert.equal(recorded.error.code,'MINUTE_DEADLINE');
});

test('ignored strict mode, missing fields, wrong tool names and malformed arguments fail closed without rerolling the world',async()=>{
 const previous=globalThis.fetch;
 try{
  const missing=structuredClone(draft);delete missing.world.regions[0].domains;
  for(const response of [toolReply(draft,'wrong_tool'),toolReply(missing),toolReply('{"world":broken}'),
   {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(draft)}}]})}]){
   let count=0;globalThis.fetch=async()=>{count++;return response};
   await assert.rejects(()=>callChat(config,[],args),e=>['MODEL_OUTPUT_CONTRACT','MODEL_JSON_INVALID'].includes(e.code));
   assert.equal(count,1);
  }
  let count=0;globalThis.fetch=async()=>{count++;return {ok:false,status:400,json:async()=>({error:{message:'invalid tool schema'}})}};
  await assert.rejects(()=>callChat(config,[],args),e=>e.status===400);assert.equal(count,1);
 }finally{globalThis.fetch=previous}
});

test('length and provider interruptions are not mislabeled as JSON syntax errors or saved as successes',async()=>{
 const previous=globalThis.fetch;
 try{
  for(const reason of ['length','insufficient_system_resource','aborted','content_filter']){
   let count=0;globalThis.fetch=async()=>{count++;return toolReply(draft,'submit_complete_world',reason)};
   await assert.rejects(()=>callChat(config,[],args),e=>{
    if(reason==='length')assert.equal(e.reason,'truncated');
    else{assert.equal(e.code,'MODEL_COMPLETION_INTERRUPTED');assert.equal(e.reason,reason);assert.doesNotMatch(explainError(e,'zh'),/语法/)}
    return true;
   });assert.equal(count,1);
  }
 }finally{globalThis.fetch=previous}
});

test('nullable audit placeholders never erase unchanged text or masquerade as a substantive patch',()=>{
 const review=strictAudit({verdict:'repair',issues:[{id:'e1',code:'PHRASE'}],notes:[],questions:[],edits:{events:[{id:'e1',d:'完整的修正内容，不删除其他领域或事件。'}]}});
 assert.equal(outputSchemaIssue(review,MINUTE_AUDIT_SCHEMA),null);
 assert.deepEqual(normalizeMinuteAudit(review),{verdict:'repair',issues:[{id:'e1',code:'PHRASE'}],notes:[],questions:[],edits:{events:[{id:'e1',d:'完整的修正内容，不删除其他领域或事件。'}]}});
 const empty=normalizeMinuteAudit(strictAudit({verdict:'repair',issues:[],edits:{}}));assert.deepEqual(empty.edits,{});
});

test('recorded complete history passes strict transport, graph correction, independent audit and archive round trip',async()=>{
 const previous=globalThis.fetch;let count=0;
 globalThis.fetch=async(_url,options)=>{
  const body=JSON.parse(options.body),response=saved.responses[count++];assert.ok(response);
  const value=JSON.parse(response.content);
  assert.equal(body.tools[0].function.strict,true);
  return response.stage==='minute-world'?toolReply(value):toolReply(strictAudit(value),'submit_world_audit');
 };
 try{
  const {worldline}=await simulateMinute({prompt:saved.input,lang:'zh',autoComplete:true,makeId:()=> 'strict-replay',config,callChat});
  assert.equal(count,saved.responses.length);assert.equal(worldline.events.length,saved.metrics.events);
  assert.equal(worldline.simulation.completedThrough,2026);assert.equal(worldline.simulation.graph.regions.reduce((n,r)=>n+r.domains.length,0),42);
  assert.ok(sanitizeWorldline(JSON.parse(JSON.stringify(worldline))));
  const original=saved.responses[0].content;
  for(const region of worldline.simulation.graph.regions)for(const d of region.domains)assert.ok(original.includes(d.t),'Every full domain account survives');
 }finally{globalThis.fetch=previous}
});

test('multipart JSON strings are concatenated losslessly instead of receiving invented newline characters',async()=>{
 assert.deepEqual(parseModelJSON([{text:'{"title":"基督'},{text:'教不存在","events":[]}'}]),{title:'基督教不存在',events:[]});
 const previous=globalThis.fetch;let count=0;
 globalThis.fetch=async()=>{count++;return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:[{type:'text',text:'{"title":"基督'},{type:'text',text:'教不存在"}' }]}}]})}};
 try{assert.deepEqual(await callChat({...config,provider:'custom',endpoint:'https://example.invalid/chat/completions'},[],{json:true,profile:'minute'}),{title:'基督教不存在'});assert.equal(count,1)}
 finally{globalThis.fetch=previous}
});

test('early closing braces and array wrappers cannot silently discard remaining world or audit data',()=>{
 for(const text of ['{"admission":{"decision":"accept"}},"world":{"events":[]}',
  '{"verdict":"repair"},"edits":{"events":[{"id":"e1"}]}','{"world":{}}\n{"events":[{"id":"e1"}]}','[1,{"world":{}}]'])
  assert.throws(()=>parseModelJSON(text),e=>e.code==='MODEL_JSON_INVALID');
 assert.deepEqual(parseModelJSON('Result:\n{"world":{"description":"完整内容"}}\nDone.'),{world:{description:'完整内容'}});
});

test('generation prompts use literal JSON examples and the actual output schema rather than pseudo-JSON templates',()=>{
 assert.doesNotMatch(MINUTE_DRAFT,/Return \{admission:|WORLD=\{|EVENT=\{/);
 assert.doesNotMatch(MINUTE_REVIEW,/\{verdict:/);assert.match(MINUTE_DRAFT,/OUTPUT JSON SCHEMA/);
});
