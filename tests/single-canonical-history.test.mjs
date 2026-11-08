import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runMatrix} from '../src/ucm-omega.mjs';
import {simulateOmega} from '../src/chronicle-adapter.mjs';

const interpretation={
 intent:'edit',valid:true,
 operations:[{
  kind:'historical_change',scope:'earth',mode:'point',startYear:1644,
  endYear:1644,target:'A historical divergence',value:'changed'
 }]
};
const event=(state)=>({
 id:`canonical:${state.window.from}`,year:state.window.from,
 en:`World event at ${state.window.from}`,zh:`世界事件 ${state.window.from}`,
 descriptionEn:'Audited counterfactual development',
 descriptionZh:'经审核的推演事件',
 category:'governance',region:'East Asia',
 threadKey:`global-development-${state.window.from}`,
 relationToIntervention:'direct',
 significance:'major',scope:'regional',certainty:'low',
 causes:['intervention:1'],requires:[],assumptions:[]
});

test('kernel defaults to a single canonical chronological run without dropping hard causal audits',async()=>{
 const requests=[],signal=new AbortController().signal;
 const outcome=await runMatrix({interpretation,signal,maxWindows:6,
  propose:async state=>{
   requests.push({scenario:state.scenario,window:state.window});
   return {events:[event(state)]};
  }
 });
 assert.equal(requests.length,6);
 assert.ok(requests.every(r=>r.scenario===1));
 assert.deepEqual(outcome.alternatives,[]);
 assert.equal(outcome.preferred.audit.rejected,0);
 assert.equal(outcome.preferred.events.length,6);
 assert.equal(outcome.preferred.snapshots.length,6);
 assert.ok(outcome.preferred.audit.score>0);
});
