import test from 'node:test';
import assert from 'node:assert/strict';
import {parseModelJSON,normalizeModelContent,ModelJSONError} from '../src/structured-output.mjs';
import {callChat,explainError,extractJSON} from '../src/core.js';

const config={provider:'custom',endpoint:'https://example.invalid/chat/completions',model:'model',key:'not-a-real-key'};
const request=[{role:'system',content:'Return JSON data'},{role:'user',content:'Describe Earth'}];
const reply=(content,{finish_reason='stop',status=200}={})=>({
 ok:status===200,status,
 json:async()=>({choices:[{finish_reason,message:{content}}]})
});

test('strict parser accepts JSON, fenced JSON, surrounding text and text-block provider responses',()=>{
 const data={history:{year:1850},facts:[{id:'a',year:1850}]};
 assert.deepEqual(parseModelJSON(JSON.stringify(data)),data);
 assert.deepEqual(parseModelJSON('\uFEFF  ```json\n'+JSON.stringify(data)+'\n```  '),data);
 assert.deepEqual(parseModelJSON('This is the data:\n'+JSON.stringify(data)+'\nEnd.'),data);
 assert.deepEqual(extractJSON('prefix {"a":2} suffix'),{a:2});
 assert.deepEqual(parseModelJSON([{type:'text',text:'{"a":1}'}]),{a:1});
 assert.equal(normalizeModelContent([{text:'hello'},{text:'world'}]),'hello\nworld');
});
test('rejects truncated objects rather than harvesting nested partial fragments',()=>{
 assert.throws(()=>parseModelJSON('{"events":[{"year":1850,"name":"valid nested object"}]'),error=>
  error instanceof ModelJSONError&&error.reason==='incomplete');
 assert.throws(()=>parseModelJSON('{"x":1, "incomplete":'),/INVALID_JSON/);
 assert.throws(()=>parseModelJSON('[{"a":1}]'),error=>
  error instanceof ModelJSONError&&error.reason==='not_object');
 assert.throws(()=>parseModelJSON('not json'),/INVALID_JSON/);
});

test('JSON mode success does not retry and keeps response_format request',async()=>{
 const prev=globalThis.fetch;const bodies=[];
 globalThis.fetch=async(_url,opts)=>{bodies.push(JSON.parse(opts.body));return reply('{"ok":true}')};
 try{
  assert.deepEqual(await callChat(config,request,{json:true}),{ok:true});
  assert.equal(bodies.length,1);
  assert.deepEqual(bodies[0].response_format,{type:'json_object'});
 }finally{globalThis.fetch=prev}
});
test('200 OK with natural-language model text recovers with a single concise JSON-only retry',async()=>{
 const prev=globalThis.fetch;const bodies=[];
 globalThis.fetch=async(_url,opts)=>{
  const body=JSON.parse(opts.body);bodies.push(body);
  return reply(bodies.length===1?'I think this alternate world has many cities.':'{"events":[],"facts":[]}');
 };
 try{
  const out=await callChat(config,request,{json:true,maxTokens:4300});
  assert.deepEqual(out,{events:[],facts:[]});
  assert.equal(bodies.length,2);
  assert.equal(bodies[0].response_format.type,'json_object');
  assert.equal('response_format' in bodies[1],false,'fallback for API providers with incompatible JSON mode');
  assert.match(bodies[1].messages.at(-1).content,/ONE complete syntactically correct JSON object/);
  assert.equal(bodies[1].temperature,.2);
 }finally{globalThis.fetch=prev}
});
test('response cut at max output length recovers without accepting an incomplete event',async()=>{
 const prev=globalThis.fetch;const bodies=[];
 globalThis.fetch=async(_url,opts)=>{
  const body=JSON.parse(opts.body);bodies.push(body);
  return bodies.length===1
   ?reply('{"events":[{"year":1850,"en":"This was cut off"',{finish_reason:'length'})
   :reply('{"events":[],"facts":[]}');
 };
 try{
  const out=await callChat(config,request,{json:true,maxTokens:2000});
  assert.deepEqual(out,{events:[],facts:[]});
  assert.equal(bodies.length,2);
  assert.ok(bodies[1].max_tokens>bodies[0].max_tokens);
 }finally{globalThis.fetch=prev}
});
test('JSON output mode rejected with HTTP 400 falls back to standard completion once',async()=>{
 const prev=globalThis.fetch;let n=0,bodies=[];
 globalThis.fetch=async(_url,opts)=>{
  bodies.push(JSON.parse(opts.body));n++;
  if(n===1)return {ok:false,status:400,json:async()=>({error:{message:'response_format unsupported'}})};
  return reply('```json\n{"ok":true}\n```');
 };
 try{
  assert.deepEqual(await callChat(config,request,{json:true}),{ok:true});
  assert.equal(n,2);
  assert.equal('response_format' in bodies[1],false);
 }finally{globalThis.fetch=prev}
});
test('after a failed bounded retry expose format reason, never silently switch algorithms',async()=>{
 const prev=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return reply('{"events":[{"year":1850}',{finish_reason:'length'})};
 try{
  await assert.rejects(()=>callChat(config,request,{json:true,maxTokens:1200}),error=>{
   assert.equal(error.message,'INVALID_JSON');
   assert.equal(error.reason,'truncated');
   assert.equal(error.attempts,2);
   assert.match(explainError(error,'zh'),/截断|长度/);
   return true;
  });
  assert.equal(calls,2);
 }finally{globalThis.fetch=prev}
});
test('normal non-JSON chat and network errors never trigger format retries',async()=>{
 const prev=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=async()=>{calls++;return reply('普通回答内容，不是 JSON')};
  assert.equal(await callChat(config,request,{json:false}),'普通回答内容，不是 JSON');
  assert.equal(calls,1);
  globalThis.fetch=async()=>{calls++;throw new TypeError('Failed to fetch')};
  await assert.rejects(()=>callChat(config,request,{json:true}),/Failed to fetch/);
  assert.equal(calls,2);
 }finally{globalThis.fetch=prev}
});
test('OpenAI-style multi-part content is joined correctly before JSON parsing',async()=>{
 const prev=globalThis.fetch;
 globalThis.fetch=async()=>reply([{type:'text',text:'{"foo":'},{type:'text',text:'"bar"}'}]);
 try{assert.deepEqual(await callChat(config,request,{json:true}),{foo:'bar'})}
 finally{globalThis.fetch=prev}
});
