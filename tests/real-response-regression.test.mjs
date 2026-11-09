import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {simulateMinute} from '../src/minute-simulation.mjs';
import {assembleMacro,materializePeriods,applyMacroEdits,validateMacro,buildMinuteWorld} from '../src/minute-world.mjs';
import {admitIntervention} from '../src/historical-intent.mjs';
import {sanitizeWorldline,extractJSON} from '../src/core.js';
// Replays measured provider responses to catch protocol/storage regressions.
// These mocked replays do not measure generation speed or historical accuracy.
for(const filename of await readdir('docs/evaluation')){
 if(!filename.endsWith('.json'))continue;
 test('measured full-world response still passes the production contract: '+filename,async()=>{
  const saved=JSON.parse(await readFile('docs/evaluation/'+filename,'utf8'));
  let w;
  if(saved.outputPolicy==='dynamic-earth-v1'){
   let n=0;({worldline:w}=await simulateMinute({prompt:saved.input,lang:'zh',autoComplete:true,makeId:()=> 'replay-'+filename,callChat:async(_,messages,options)=>{const response=saved.responses[n++];assert.equal(options.stage,response.stage);assert.equal(response.model,'deepseek-flash');return extractJSON(response.content);}}));assert.equal(n,saved.responses.length);assert.equal(w.simulation.graph.regions.reduce((count,r)=>count+r.domains.length,0),42);
  }else{
   const actions=admitIntervention(saved.draft.admission,{prompt:saved.input}),firstYear=saved.metrics.anchorYear,inherited={events:[],facts:[]};
   let raw=assembleMacro(saved.draft.world,firstYear);if(saved.review.verdict==='repair')raw=applyMacroEdits(raw,saved.review.edits);raw=materializePeriods(raw,firstYear);
   const checked=validateMacro(raw,{firstYear,actions,inherited});w=buildMinuteWorld({raw,checked,assessment:saved.draft.admission,actions,inherited,firstYear,parentId:null,prompt:saved.input,lang:'zh',runId:'replay-'+filename,review:saved.review,timing:saved.metrics.timing});
  }
  assert.equal(w.anchorYear,saved.metrics.anchorYear);assert.equal(w.simulation.completedThrough,2026);
  assert.equal(w.events.length,saved.metrics.events);assert.equal(w.simulation.milestoneIds.length,(saved.finalMilestones??saved.metrics.milestones));
  assert.equal(w.simulation.graph.trajectories.length,7);assert.equal(sanitizeWorldline(w)?.simulation.version,3);
 });
}

test('recorded stale-index failure now replays without losing historical content',async()=>{
 const saved=JSON.parse(await readFile('docs/evaluation/failures/ming-stale-index-20261109.json','utf8'));let n=0;
 const {worldline:w}=await simulateMinute({prompt:saved.input,lang:'zh',autoComplete:true,makeId:()=> 'index-regression',callChat:async(_,messages,options)=>{const r=saved.responses[n++];assert.equal(options.stage,r.stage);return extractJSON(r.content);}});
 assert.equal(n,saved.responses.length);assert.ok(sanitizeWorldline(w));assert.equal(w.simulation.completedThrough,2026);assert.equal(w.simulation.graph.regions.reduce((n,r)=>n+r.domains.length,0),42);
});
