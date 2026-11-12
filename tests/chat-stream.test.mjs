import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {readChatStream} from '../src/chat-stream.mjs';
import {callChat,simulate} from '../src/core.js';
import {simulatePromptWorld} from '../src/prompt-world.mjs';

const config={provider:'custom',endpoint:'https://example.invalid/chat/completions',model:'test-model',key:'test-only'};
const world={title:'测试世界',summary:'完整历史。',fork:{year:700},events:[],facts:[]};
const event=data=>'data: '+JSON.stringify(data)+'\r\n\r\n';
const delta=value=>event({choices:[{index:0,delta:value,finish_reason:null}]});
const finish=reason=>event({choices:[{index:0,delta:{},finish_reason:reason}]});
function streamResponse(source,size=13){
 const bytes=new TextEncoder().encode(source);let offset=0;
 return new Response(new ReadableStream({pull(controller){
  if(offset>=bytes.length){controller.close();return}
  controller.enqueue(bytes.slice(offset,offset+=size));
 }}),{headers:{'content-type':'text/event-stream; charset=utf-8'}});
}
async function mockFetch(fn,run){const before=globalThis.fetch;globalThis.fetch=fn;try{return await run()}finally{globalThis.fetch=before}}

test('SSE handles fragmented UTF-8, CRLF, keepalives, reasoning and usage without exposing reasoning',async()=>{
 const updates=[];
 const source=': keepalive\r\n\r\n'+delta({reasoning_content:'私有推理内容📚'})+delta({content:'{"answer":"中文📚"'})+delta({content:',"knowledge":[]}'})+finish('stop')+event({choices:[],usage:{prompt_tokens:12,completion_tokens:34,total_tokens:46}})+'data: [DONE]\r\n\r\n';
 const result=await readChatStream(streamResponse(source,1),{onProgress:x=>updates.push(x)});
 assert.equal(result.choices[0].message.content,'{"answer":"中文📚","knowledge":[]}');
 assert.equal(result.usage.total_tokens,46);assert.equal(updates.length,3);
 assert.ok(updates.every(x=>Object.keys(x).sort().join(',')==='receivedChars,status'));
 assert.equal(updates[0].receivedChars,'私有推理内容📚'.length);
 assert.ok(updates[2].receivedChars>updates[1].receivedChars);
});

test('public creation streams actual model output and only completes after adapting a valid world',async()=>{
 const updates=[],bodies=[];
 await mockFetch(async(_url,init)=>{bodies.push(JSON.parse(init.body));return streamResponse(delta({reasoning_content:'Thinking'})+delta({content:JSON.stringify(world)})+finish('stop')+'data: [DONE]\n\n')},async()=>{
  const result=await simulate({prompt:'如果发生变化',config,onProgress:x=>updates.push(x)});
  assert.equal(result.titleZh,world.title);assert.equal(bodies.length,1);assert.equal(bodies[0].stream,true);
  assert.deepEqual(bodies[0].stream_options,{include_usage:true});
  assert.equal(updates.at(-1).status,'complete');assert.ok(updates.some(x=>x.status==='streaming'));
  assert.ok(updates.every(x=>x.elapsedMs===undefined&&x.targetMs===undefined));
 });
});

test('silent waits past two minutes emit no invented progress and impose no deadline',async()=>{
 const updates=[];let clock=0,resolve;
 const pending=simulatePromptWorld({prompt:'如果发生变化',config,makeId:()=> 'test',now:()=>clock,onProgress:x=>updates.push(x),callChat:async()=>new Promise(r=>{resolve=r})});
 const count=updates.length;clock=600001;await new Promise(r=>setTimeout(r,20));
 assert.equal(updates.length,count);assert.equal(updates[0].status,'waiting');
 resolve(world);const result=await pending;
 assert.equal(result.worldline.simulation.timing.elapsedMs,600001);assert.equal(updates.at(-1).status,'complete');
});

test('disconnects, output limits, malformed streams and provider errors never signal completion',async()=>{
 for(const source of [delta({content:JSON.stringify(world)}),delta({content:JSON.stringify(world)})+'data: [DONE]\n\n',delta({content:JSON.stringify(world)})+finish('length'),event({error:{message:'Provider stopped'}}),'data: {invalid}\n\n']){
  const updates=[];
  await mockFetch(async()=>streamResponse(source),async()=>{
   await assert.rejects(()=>simulate({prompt:'如果发生变化',config,onProgress:x=>updates.push(x)}));
   assert.ok(updates.every(x=>x.status!=='complete'));
  });
 }
});

test('cancelling an idle stream releases its reader and rejects promptly',async()=>{
 const controller=new AbortController();let cancelled=false;
 const response=new Response(new ReadableStream({cancel(){cancelled=true}}),{headers:{'content-type':'text/event-stream'}});
 const pending=readChatStream(response,{signal:controller.signal});controller.abort();
 await assert.rejects(pending,e=>e.name==='AbortError');assert.equal(cancelled,true);
});

test('JSON-only endpoints stay usable without pretending to receive live chunks',async()=>{
 const updates=[];
 await mockFetch(async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(world)}}]}),{headers:{'content-type':'application/json'}}),async()=>{
  const result=await simulate({prompt:'如果发生变化',config,onProgress:x=>updates.push(x)});
  assert.equal(result.titleZh,world.title);assert.ok(!updates.some(x=>x.status==='streaming'));assert.equal(updates.at(-1).status,'complete');
 });
});

test('endpoints can explicitly decline streaming options or streaming without changing the task',async()=>{
 for(const rejected of ['stream_options is unsupported','stream is unsupported']){
  const bodies=[];
  await mockFetch(async(_url,init)=>{const body=JSON.parse(init.body);bodies.push(body);return bodies.length===1
   ?new Response(JSON.stringify({error:{message:rejected}}),{status:400})
   :new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(world)}}]}))},async()=>{
   const result=await simulate({prompt:'如果发生变化',config,onProgress:()=>{}});
   assert.equal(result.titleZh,world.title);assert.equal(bodies.length,2);assert.equal(bodies[1].stream_options,undefined);
   assert.deepEqual(bodies[0].messages,bodies[1].messages);if(rejected.startsWith('stream is'))assert.equal(bodies[1].stream,false);
  });
 }
});

test('busy overlay removes time copy in both languages and ignores elapsed time',()=>{
 const source=readFileSync('src/app.js','utf8'),code=source.slice(source.indexOf('function renderBusy('),source.indexOf('function handleClick('));
 for(const lang of ['zh','en']){
  const host={dataset:{},querySelector:selector=>selector==='[data-action="stop"]'?{addEventListener(){}}:null};
  const state={lang,busy:{input:'Test',status:'streaming',receivedChars:20,elapsedMs:1000}};
  const context={state,$:()=>host,tr:()=> 'Loading',h:x=>x};runInNewContext(code+';renderBusy()',context);const first=host.innerHTML;
  state.busy.elapsedMs=600001;runInNewContext(code+';renderBusy()',context);
  assert.equal(host.innerHTML,first);assert.doesNotMatch(first,/已用|秒|elapsed|2分钟|two.minute|aria-valuenow/);
  assert.match(first,/role="progressbar"/);assert.match(first,/stop-calculation/);
 }
});
