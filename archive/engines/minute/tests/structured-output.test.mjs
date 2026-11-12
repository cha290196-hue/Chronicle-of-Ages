import test from 'node:test';
import assert from 'node:assert/strict';
import {callChat,explainError} from '../src/chat-transport.mjs';
import {simulateMinute} from '../src/minute-simulation.mjs';
import {admission,macro,review} from './fixtures/minute-world.mjs';

const config={provider:'custom',endpoint:'https://example.invalid/chat/completions',model:'model',key:'not-a-real-key'};
const request=[{role:'system',content:'Return JSON data'},{role:'user',content:'Describe Earth'}];
const reply=(content,{finish_reason='stop',status=200}={})=>({
 ok:status===200,status,
 json:async()=>({choices:[{finish_reason,message:{content}}]})
});

test('minute creation retries malformed output once, preserving JSON mode, capacity and cancellation',async()=>{
 const previous=globalThis.fetch,bodies=[],controller=new AbortController();
 globalThis.fetch=async(_url,options)=>{
  bodies.push(JSON.parse(options.body));assert.equal(options.signal,controller.signal);
  return reply(bodies.length===1?'Model explanation instead of data':'{"complete":true}');
 };
 try{
  assert.deepEqual(await callChat(config,request,{json:true,profile:'minute',maxTokens:65536,signal:controller.signal}),{complete:true});
  assert.equal(bodies.length,2);
  assert.deepEqual(bodies.map(b=>b.response_format),[{type:'json_object'},{type:'json_object'}]);
  assert.deepEqual(bodies.map(b=>b.max_tokens),[65536,65536]);
  assert.deepEqual(bodies[1].messages.slice(0,-1),request);
  assert.match(bodies[1].messages.at(-1).content,/Preserve ALL substantive events/);
 }finally{globalThis.fetch=previous}
});

test('minute creation reports a repeated format error with its reason and actual request count',async()=>{
 const previous=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return reply('{"world":broken}')};
 try{
  await assert.rejects(()=>callChat(config,request,{json:true,profile:'minute'}),error=>{
   assert.equal(error.reason,'invalid_syntax');assert.equal(error.attempts,2);
   error.minuteDiagnostics={stage:'minute-world'};
   assert.match(explainError(error,'zh'),/全球宏观推演/);
   assert.match(explainError(error,'zh'),/语法/);
   assert.match(explainError(error,'zh'),/重试/);
   assert.match(explainError(error,'en'),/syntax/);
   return true;
  });
  assert.equal(calls,2);
 }finally{globalThis.fetch=previous}
});

test('minute creation never regenerates length-limited output or raises its capacity ceiling',async()=>{
 const previous=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return reply('{"complete":true}',{finish_reason:'length'})};
 try{
  await assert.rejects(()=>callChat(config,request,{json:true,profile:'minute',maxTokens:65536}),error=>error.reason==='truncated'&&error.attempts===1);
  assert.equal(calls,1);
 }finally{globalThis.fetch=previous}
});

test('minute creation retries unsupported JSON mode but does not retry unrelated HTTP errors',async()=>{
 const previous=globalThis.fetch,bodies=[];
 globalThis.fetch=async(_url,options)=>{
  bodies.push(JSON.parse(options.body));
  return bodies.length===1?{ok:false,status:400,json:async()=>({error:{message:'response_format unsupported'}})}:reply('{"ok":true}');
 };
 try{
  assert.deepEqual(await callChat(config,request,{json:true,profile:'minute'}),{ok:true});
  assert.equal(bodies.length,2);assert.equal('response_format' in bodies[1],false);
  let calls=0;
  globalThis.fetch=async()=>{calls++;return {ok:false,status:400,json:async()=>({error:{message:'max_tokens exceeds provider limit'}})}};
  await assert.rejects(()=>callChat(config,request,{json:true,profile:'minute'}),error=>error.status===400);
  assert.equal(calls,1);
 }finally{globalThis.fetch=previous}
});

test('minute format recovery remains cancellable and stops after the shared deadline',async()=>{
 const previous=globalThis.fetch,controller=new AbortController();let calls=0;
 globalThis.fetch=async(_url,options)=>{
  calls++;
  if(calls===1)return reply('Not JSON');
  return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));
 };
 try{
  const pending=callChat(config,request,{json:true,profile:'minute',signal:controller.signal});
  const rejected=assert.rejects(pending,error=>error.name==='AbortError');
  await new Promise(resolve=>setTimeout(resolve,10));controller.abort();
  await rejected;assert.equal(calls,2);
  calls=0;
  await assert.rejects(()=>simulateMinute({prompt:'公元1024年发生重大制度改变',makeId:()=> 'deadline-test',autoComplete:true,config,callChat,budgetMs:1000}),error=>error.code==='MINUTE_DEADLINE');
  assert.equal(calls,2);
 }finally{globalThis.fetch=previous}
});

test('a recovered creation draft still passes independent review and complete-world validation',async()=>{
 const previous=globalThis.fetch,bodies=[];
 globalThis.fetch=async(_url,options)=>{
  bodies.push(JSON.parse(options.body));
  return reply(bodies.length===1?'Malformed provider response':JSON.stringify(bodies.length===2?{admission:admission(),world:macro()}:review()));
 };
 try{
  const {worldline}=await simulateMinute({prompt:'公元1024年发生重大制度改变',makeId:()=> 'recovered-world',autoComplete:true,config,callChat});
  assert.equal(bodies.length,3);assert.equal(worldline.simulation.completedThrough,2026);
  assert.equal(worldline.simulation.timing.completed,true);
  assert.equal(worldline.simulation.snapshots.at(-1).state.regions.length,7);
  assert.deepEqual(worldline.simulation.timing.requests.map(r=>r.stage),['minute-world','minute-review']);
 }finally{globalThis.fetch=previous}
});
