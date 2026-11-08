import test from 'node:test';
import assert from 'node:assert/strict';
import {simulate} from '../src/core.js';
import {worldHTTP,admission} from './fixtures/world-chat.mjs';
const config={provider:'custom',endpoint:'https://example.com/chat',model:'test',key:'fake'};
test('the real public API bridge runs the stateful engine and retains its full archive',async()=>{
 const old=globalThis.fetch,requests=[];
 globalThis.fetch=async(_,init)=>{const body=JSON.parse(init.body);requests.push(body);return worldHTTP(body)};
 try{
  const w=await simulate({prompt:'公元2020年制度改变',config});
  assert.equal(w.simulation.version,2);assert.equal(w.simulation.completedThrough,2026);
  assert.ok(w.events.length>=14);assert.ok(requests.length>=7);
 }finally{globalThis.fetch=old}
});
test('an unsupported input never reaches initialization or a fallback history writer',async()=>{
 const old=globalThis.fetch;let calls=0;
 globalThis.fetch=async(_,init)=>{calls++;return worldHTTP(JSON.parse(init.body),{overrides:{interpretation:()=>({...admission(),decision:'reject',intent:'irrelevant'})}})};
 try{await assert.rejects(simulate({prompt:'A meaningless remote stone cracks',config}),/INTERVENTION_REJECTED/);assert.equal(calls,1)}finally{globalThis.fetch=old}
});
