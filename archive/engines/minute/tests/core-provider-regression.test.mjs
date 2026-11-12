import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {exploreWorld} from '../src/world-exploration.mjs';
import {extractJSON,sanitizeWorldline} from '../../../../src/core.js';
import {assembleMacro,applyMacroEdits,materializePeriods,validateMacro,buildMinuteWorld} from '../src/minute-world.mjs';
import {admitIntervention} from '../src/historical-intent.mjs';
import {mergeKnowledge} from '../../../../src/exploration-knowledge.mjs';
// Real provider-response replay: validates contracts/storage, not runtime or historical accuracy.
async function testWorld(){
 const s=JSON.parse(await readFile('archive/engines/minute/evaluation/christianity-20261108.json','utf8')),actions=admitIntervention(s.draft.admission,{prompt:s.input}),firstYear=s.metrics.anchorYear,inherited={events:[],facts:[]};
 let raw=assembleMacro(s.draft.world,firstYear);if(s.review.verdict==='repair')raw=applyMacroEdits(raw,s.review.edits);raw=materializePeriods(raw,firstYear);
 const checked=validateMacro(raw,{firstYear,actions,inherited});return buildMinuteWorld({raw,checked,assessment:s.draft.admission,actions,inherited,firstYear,parentId:null,prompt:s.input,lang:'zh',runId:'core-test-christianity',review:s.review,timing:s.metrics.timing});
}
for(const file of await readdir('archive/engines/minute/evaluation/core')){
 if(!file.endsWith('.json'))continue;
 test('real Core response remains complete and persistable: '+file,async()=>{
  const saved=JSON.parse(await readFile('archive/engines/minute/evaluation/core/'+file,'utf8'));assert.equal(saved.success,true);
  const branch=await testWorld();branch.knowledge=saved.priorKnowledge||saved.storedKnowledge.slice(0,saved.previousCount);const original=JSON.stringify({events:branch.events,simulation:branch.simulation});
  const ids=[saved.knowledge[0]?.questionRef||'repeat-question',...saved.knowledge.map(f=>f.id)];let id=0,request=0,first=true,completion=false,discarded=0;const multiple=saved.assessment.attempts>1;
  const out=await exploreWorld({question:saved.question,branch,events:branch.events,facts:[...branch.facts,...branch.knowledge],history:saved.historyBefore||[],lang:'zh',config:{provider:'deepseek',endpoint:'https://api.deepseek.com/chat/completions',model:'deepseek-flash'},makeId:()=>{if(first){first=false;return ids[id++];}if(multiple&&!completion)return 'discarded-pass-'+(++discarded);const x=ids[id++];assert.ok(x,'Unexpected new record ID allocation');return x;},callChat:async(_,messages,opts)=>{const r=saved.requests[request++];assert.ok(r,'Unexpected extra provider request');assert.equal(opts.stage,r.stage);assert.equal(r.model,'deepseek-flash');if(opts.stage==='question-completion')completion=true;return extractJSON(r.content);}});
  assert.equal(request,saved.requests.length);assert.equal(out.answer,saved.answer);assert.equal(out.knowledge.length,saved.knowledge.length);
  const merged=mergeKnowledge(branch.knowledge,out.knowledge);assert.equal(merged.stats.conflicts,0);assert.equal(merged.facts.length,saved.storedCount);branch.knowledge=merged.facts;assert.ok(sanitizeWorldline(branch));assert.equal(JSON.stringify({events:branch.events,simulation:branch.simulation}),original);
 });
}
