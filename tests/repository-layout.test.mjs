import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname,relative} from 'node:path';
import {callChat} from '../src/core.js';
import {callChat as priorCallChat} from '../archive/engines/minute/src/chat-transport.mjs';
import {mergeKnowledge} from '../src/exploration-knowledge.mjs';
import {mergeKnowledge as priorMergeKnowledge} from '../archive/engines/minute/src/exploration-knowledge.mjs';

test('all browser modules resolve within production source without archived dependencies',async()=>{
 const root=resolve('src'),pending=[resolve('src/app.js')],seen=new Set();
 while(pending.length){
  const file=pending.pop();if(seen.has(file))continue;seen.add(file);
  assert.ok(relative(root,file)&&!relative(root,file).startsWith('..'),file);
  const source=await readFile(file,'utf8');
  const refs=[...source.matchAll(/\b(?:from\s*|import\s*(?:\(\s*)?)(['"])(\.\.?\/[^'"\n]+?\.m?js)(?:\?[^'"\n]*)?\1/g)];
  for(const [, ,ref]of refs)pending.push(resolve(dirname(file),ref));
 }
 const modules=(await readdir('src')).filter(name=>/\.m?js$/.test(name));
 assert.equal(seen.size,modules.length,'unreachable production modules should be reviewed or archived');
});

test('original frozen source packages retain their manifest checksums',async()=>{
 for(const dir of ['archive/engines/ucm-omega-v2','archive/snapshots/inference-20261112-53f7e71']){
  const manifest=JSON.parse(await readFile(dir+'/manifest.json','utf8'));
  const file=manifest.zip||manifest.archive,expected=manifest.sha256||manifest.archiveSha256;
  const actual=createHash('sha256').update(await readFile(dir+'/'+file)).digest('hex');
  assert.equal(actual,expected,file);
 }
});

test('removing retired transport branches preserves current request bodies and complete output',async()=>{
 const previous=globalThis.fetch,messages=[{role:'system',content:'Return a complete object'},{role:'user',content:'A synthetic world request'}];
 const value={title:'Synthetic world',summary:'Complete synthetic response'},requests=[];
 const config={provider:'custom',endpoint:'https://example.invalid/chat/completions',model:'test-model',key:'test-only'};
 try{
  for(const [provider,stream]of [['custom',false],['custom',true],['deepseek',false],['deepseek',true]]){
   globalThis.fetch=async(url,init)=>{
    requests.push({url,body:JSON.parse(init.body)});
    if(!stream)return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]}));
    const source='data: '+JSON.stringify({choices:[{index:0,delta:{content:JSON.stringify(value)},finish_reason:null}]})+'\n\n'+'data: '+JSON.stringify({choices:[{index:0,delta:{},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n';
    return new Response(source,{headers:{'content-type':'text/event-stream'}});
   };
   const settings={...config,provider},options={profile:'prompt-llm',json:true,reasoning:true,purpose:'simulation',stage:'prompt-world',maxTokens:65536,...(stream?{onProgress:()=>{}}:{})};
   const current=await callChat(settings,messages,options),prior=await priorCallChat(settings,messages,options);
   assert.deepEqual(current,prior);assert.deepEqual(requests.at(-2),requests.at(-1));
  }
 }finally{globalThis.fetch=previous}
});

test('knowledge storage remains compatible after retiring the admission pipeline',()=>{
 const legacy={id:'legacy',firstYear:1850,nameEn:'Institution',nameZh:'制度',descriptionEn:'A retained old setting.',entity:'state',attribute:'institution',value:'established',evidenceIds:[]};
 const authored={id:'new',firstYear:2026,nameEn:'Model setting',nameZh:'模型设定',descriptionEn:'Complete model-authored prose. '.repeat(300),source:'prompt-llm'};
 for(const [before,incoming]of [[[],[legacy]],[[legacy],[{...legacy,id:'duplicate'}]],[[legacy],[authored]],[[authored],[{...authored,descriptionEn:'Updated setting'}]]]){
  assert.deepEqual(mergeKnowledge(before,incoming),priorMergeKnowledge(before,incoming));
 }
});
