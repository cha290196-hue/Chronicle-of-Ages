import test from 'node:test';
import assert from 'node:assert/strict';
import {worldCoverage,needsWorldReview,curateWorldEvents} from '../src/world-coverage.mjs';
import {auditBatch,compileInterventions,runMatrix} from '../src/ucm-omega.mjs';
import {simulateOmega} from '../src/chronicle-adapter.mjs';

const op={kind:'historical_change',scope:'earth',mode:'point',startYear:1644,endYear:1644,target:'Ming continuity',value:'survives'};
const direct=(id,year,rest={})=>({id,year,en:id,zh:id,causes:['intervention:1'],region:'east-asia',threadKey:'ming-governance',scope:'regional',significance:'major',relationToIntervention:'direct',...rest});
const independent=(id,year,rest={})=>({id,year,en:id,zh:id,causes:['real-science'],region:'europe',threadKey:'european-science',scope:'transregional',significance:'major',relationToIntervention:'independent',...rest});

test('Earth-wide review detects a repeatedly narrow dynastic storyline, without a fake geographic quota',()=>{
 const a=[direct('d1',1700),direct('d2',1710),direct('d3',1740),direct('d4',1760)];
 assert.equal(needsWorldReview(a,[],{from:1690,to:1770}),true);
 assert.equal(needsWorldReview(a,[],{from:1690,to:1700}),false,'eleven years of local affairs need not trigger a global filler request');
 assert.equal(needsWorldReview([{id:'uncertain',en:'unknown',year:1700}],[],{from:1644,to:2026}),false,'incomplete metadata is not evidence of narrow coverage');
 const c=worldCoverage([...a,independent('e1',1750)]);
 assert.equal(c.dominantThread,'ming-governance');
 assert.equal(c.independent,1);
});

test('salience curation retains varied historically important subjects without fabricating extra events',()=>{
 const all=[...Array.from({length:10},(_,i)=>direct('ming'+i,1680+i,{causes:['intervention:1'],significance:'moderate'})),
  independent('physics',1710,{scope:'global',significance:'epochal'}),
  {id:'trade',year:1705,en:'transoceanic trade',zh:'跨洋贸易',causes:['real-science'],region:'americas',threadKey:'atlantic-economy',scope:'transregional',significance:'major',relationToIntervention:'independent'}];
 const x=curateWorldEvents(all,{maxEvents:6});
 assert.equal(x.events.length,6);
 assert.ok(x.events.some(e=>e.id==='physics'));
 assert.ok(x.events.some(e=>e.id==='trade'));
 assert.ok(x.events.filter(e=>e.threadKey==='ming-governance').length<6);
 assert.equal(x.omitted.length,6);
 assert.deepEqual(curateWorldEvents([all[0]],{maxEvents:6}).events,[all[0]],'never invent missing continents');
});

test('event selection preserves causal ancestors and required historical fact provenance',()=>{
 const all=[direct('first',1650),direct('second',1670,{causes:['first'],scope:'global',significance:'epochal'}),
  ...Array.from({length:9},(_,i)=>direct('minor'+i,1680+i,{significance:'minor'}))];
 const x=curateWorldEvents(all,{maxEvents:3,requiredEventIds:['first']});
 const ids=new Set(x.events.map(e=>e.id));
 assert.ok(ids.has('first'));
 assert.ok(ids.has('second'));
 assert.ok([...ids].every(id=>all.find(e=>e.id===id).causes.every(c=>c==='intervention:1'||ids.has(c))));
});

test('autonomous world developments cannot be mislabeled independent when descended from the intervention',()=>{
 const actions=compileInterventions({operations:[op]});
 const audit=auditBatch({window:{from:1644,to:1800},actions,
  knownEvents:[{id:'real-science',year:1609,en:'observations',origin:'recorded'}],
  proposal:{events:[
   direct('ming-change',1644),
   independent('legit-europe',1720),
   independent('false-independence',1750,{causes:['ming-change']}),
   independent('another-false',1751,{causes:['intervention:1']})
  ]}});
 assert.deepEqual(audit.events.map(e=>e.id),['ming-change','legit-europe']);
 assert.equal(audit.rejected.filter(x=>x.reason==='FALSE_INDEPENDENCE').length,2);
});
