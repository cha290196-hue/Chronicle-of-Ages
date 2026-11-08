import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {runMatrix} from '../src/ucm-omega.mjs';

const interpretation={operations:[{
 kind:'historical_change',scope:'earth',mode:'point',startYear:1600,
 target:'Global alternate history',value:'different'
}]};
const source=async state=>{
 // Exactly the same output volume and simulated network+generation latency
 // in both runs. Only the coordinator's scenario schedule changes.
 await new Promise(resolve=>setTimeout(resolve,42));
 return {events:[{
  id:`scenario${state.scenario}-${state.window.from}`,
  year:state.window.from,en:'Consequential regional historical event',
  category:'society',causes:['intervention:1'],region:'Europe',
  threadKey:'autonomous-social-change',
  significance:'major',scope:'regional',relationToIntervention:'direct'
 }]};
};

test('synthetic equal-quality latency benchmark: two concurrent alternatives beat sequential orchestration',async()=>{
 const startSerial=performance.now();
 const serial=await runMatrix({interpretation,scenarioCount:2,maxWindows:4,maxParallelScenarios:1,propose:source});
 const serialMs=performance.now()-startSerial;
 const startConcurrent=performance.now();
 const concurrent=await runMatrix({interpretation,scenarioCount:2,maxWindows:4,maxParallelScenarios:2,propose:source});
 const concurrentMs=performance.now()-startConcurrent;
 assert.deepEqual(concurrent,serial);
 const improvement=(1-concurrentMs/serialMs)*100;
 console.log(`UCM-Ω synthetic request benchmark: serial=${serialMs.toFixed(1)}ms, parallel=${concurrentMs.toFixed(1)}ms, elapsed reduction=${improvement.toFixed(1)}%`);
 assert.ok(concurrentMs<serialMs*.85,
  `Concurrent scenarios should overlap work, serial ${serialMs.toFixed(0)}ms vs parallel ${concurrentMs.toFixed(0)}ms`);
});
