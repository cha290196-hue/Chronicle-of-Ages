import test from 'node:test';
import assert from 'node:assert/strict';
import {auditKnowledge,mergeKnowledge,sanitizeKnowledge} from '../src/exploration-knowledge.mjs';
import {exploreCore,worldFacts,sanitizeWorldline,worldEvents} from '../src/core.js';
import {resolveAncestry,compileInterventions} from '../src/worldline-contract.mjs';
import {readFile} from 'node:fs/promises';

const past={id:'record-1644',year:1644,en:'Ming continues',zh:'明朝延续',origin:'derived'};
const branch={id:'B',parentId:null,anchorYear:1644,titleEn:'Ming survival',summaryEn:'Global divergence',prompt:'明朝没有灭亡',
 events:[past],facts:[{id:'prior-tech',firstYear:1700,nameEn:'Known scientific advance',nameZh:'已知科学进展'}],knowledge:[],
 inherited:{events:[],facts:[]}};
const candidate=(overrides={})=>({
 nameEn:'French urban life in 1850',nameZh:'1850年的法国城市生活',
 descriptionEn:'Urban residents face changing markets and institutions.',
 descriptionZh:'城市居民受到市场和制度变化的影响。',
 entity:'French urban society',attribute:'living conditions',value:'changing market society',
 firstYear:1850,validUntil:1850,kind:'daily_life',certainty:'low',
 basis:'Projected from the independent industrial and institutional trajectories.',
 evidenceIds:[],assumptions:['Industrialization continues independently'],...overrides
});
const idFactory=()=>`k-${Math.random().toString(36).slice(2)}`;
const config={provider:'custom',endpoint:'https://example.org/v1/chat/completions',model:'test',key:'fake'};

test('local knowledge rejects duplicate claims and conflicts without rewriting existing world',()=>{
 const first=auditKnowledge({candidates:[candidate()],existing:[],events:[past],makeId:idFactory});
 assert.equal(first.accepted.length,1);
 assert.equal(first.accepted[0].source,'core-exploration');
 assert.equal(first.accepted[0].certainty,'low');
 const again=auditKnowledge({candidates:[candidate()],existing:first.accepted,events:[past],makeId:idFactory});
 assert.equal(again.accepted.length,0);
 assert.equal(again.duplicates.length,1);
 const conflict=auditKnowledge({candidates:[candidate({value:'completely different and incompatible conditions',
 exclusiveKey:'made-up-other-key'})],existing:first.accepted,events:[past],makeId:idFactory});
 assert.equal(conflict.accepted.length,0);
 assert.equal(conflict.rejected[0].reason,'CONFLICTS_WITH_WORLDLINE');
 assert.equal(first.accepted[0].nameZh,'1850年的法国城市生活');
});

test('knowledge rejects invented causal references, invalid years, missing explanation and duplicates of macro milestones',()=>{
 const out=auditKnowledge({candidates:[
  candidate({firstYear:0}),
  candidate({firstYear:2030}),
  candidate({basis:'',evidenceIds:[]}),
  candidate({evidenceIds:['fake-citation']}),
  candidate({nameEn:'Ming continues',nameZh:'明朝延续',firstYear:1644,validUntil:1644}),
  candidate()
 ],existing:[],events:[past],makeId:idFactory});
 assert.equal(out.accepted.length,1);
 assert.equal(out.rejected.length,4);
 assert.equal(out.duplicates.length,1);
 assert.ok(out.rejected.some(x=>x.reason==='UNKNOWN_EVIDENCE'));
});

test('repeat knowledge merges safely; malformed imports and impossible year intervals are ignored',()=>{
 const a=auditKnowledge({candidates:[candidate()],makeId:idFactory}).accepted;
 const merged=mergeKnowledge(a,a);
 assert.equal(merged.facts.length,1);
 assert.equal(merged.stats.duplicates,1);
 assert.equal(sanitizeKnowledge({...a[0],firstYear:0}),null);
 assert.equal(sanitizeKnowledge({...a[0],firstYear:2020,validUntil:2019}),null);
});

test('an updated parent shares only its established pre-fork knowledge with descendants',async()=>{
 const note1=auditKnowledge({candidates:[candidate()],makeId:idFactory}).accepted[0];
 const note2=auditKnowledge({candidates:[candidate({firstYear:1950,validUntil:1950,nameEn:'1950 note',nameZh:'1950年的记录'})],makeId:idFactory}).accepted[0];
 const b={...branch,knowledge:[note1,note2]};
 const c={id:'C',parentId:'B',anchorYear:1900,events:[],facts:[],knowledge:[],inherited:{events:[],facts:[]}};
 const g=resolveAncestry({branches:[b,c],parentId:'C',atYear:1950});
 assert.equal(g.facts.some(f=>f.id===note1.id),true);
 assert.equal(g.facts.some(f=>f.id===note2.id),false);
 assert.ok(worldFacts([b,c],c).some(f=>f.id===note1.id),'existing descendants see new earlier parent knowledge');
 assert.equal(worldFacts([b,c],c).some(f=>f.id===note2.id),false);
 assert.ok(g.facts.some(f=>f.id===note1.id),'fresh forks can rely on established earlier knowledge');
});

test('a future discovery cannot be used to justify an edit before its own existence',async()=>{
 const future=auditKnowledge({candidates:[candidate({firstYear:1950,validUntil:1950,nameEn:'Future policy',nameZh:'未来政策'})],makeId:idFactory}).accepted[0];
 const b={...branch,knowledge:[future]};
 assert.throws(()=>compileInterventions({operations:[{kind:'branch_fact',scope:'earth',mode:'point',startYear:1900,target:'Future policy',value:'revised',parentFactId:future.id}]},{parentFacts:resolveAncestry({branches:[b],parentId:'B',atYear:1900}).facts}),/UNKNOWN_BRANCH_FACT/);
});

test('both old archives and new knowledge archives load without mutating macro-event skeleton',()=>{
 const b={...branch,knowledge:auditKnowledge({candidates:[candidate()],makeId:idFactory}).accepted};
 const restored=sanitizeWorldline(b);
 assert.equal(restored.events.length,1);
 assert.equal(restored.knowledge.length,1);
 assert.equal(restored.knowledge[0].status,'hypothesis');
 assert.equal(worldEvents([restored],restored).some(e=>e.id==='record-1644'),true);
 assert.equal(worldFacts([restored],restored).some(f=>f.nameZh==='1850年的法国城市生活'),true);
 assert.deepEqual(sanitizeWorldline({...branch,knowledge:undefined}).knowledge,[]);
});

test('app routes core answers into branch knowledge and includes them in knowledge export and import',async()=>{
 const app=await readFile('src/app.js','utf8');
 assert.match(app,/await exploreCore\(/);
 assert.match(app,/branch\.knowledge=merged\.facts/);
 assert.match(app,/baselineKnowledge:state\.baselineKnowledge/);
 assert.match(app,/raw\.baselineKnowledge/);
 assert.match(app,/const facts=\(b\?worldFacts/);
 assert.ok(!app.includes('const answer=await askCore('));
});
