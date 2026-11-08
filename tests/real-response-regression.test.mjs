import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {simulateMinute} from '../src/minute-simulation.mjs';
import {sanitizeWorldline} from '../src/core.js';
// Replays measured provider responses to catch protocol/storage regressions.
// These mocked replays do not measure generation speed or historical accuracy.
for(const filename of await readdir('docs/evaluation')){
 if(!filename.endsWith('.json'))continue;
 test('measured full-world response still passes the production contract: '+filename,async()=>{
  const saved=JSON.parse(await readFile('docs/evaluation/'+filename,'utf8'));
  let n=0;const {worldline:w}=await simulateMinute({prompt:saved.input,lang:'zh',autoComplete:true,makeId:()=> 'replay-'+filename,
   callChat:async()=>structuredClone(n++===0?saved.draft:saved.review)});
  assert.equal(n,2);assert.equal(w.anchorYear,saved.metrics.anchorYear);assert.equal(w.simulation.completedThrough,2026);
  assert.equal(w.events.length,saved.metrics.events);assert.equal(w.simulation.milestoneIds.length,(saved.finalMilestones??saved.metrics.milestones));
  assert.equal(w.simulation.graph.trajectories.length,7);assert.equal(sanitizeWorldline(w)?.simulation.version,3);
 });
}
