import test from 'node:test';
import assert from 'node:assert/strict';
import {exploreWorld} from '../src/world-exploration.mjs';
import {exploreCore} from '../src/core.js';
import {auditKnowledge} from '../src/exploration-knowledge.mjs';

const branch={id:'B',anchorYear:1644,events:[],facts:[],knowledge:[],titleEn:'An alternate Earth',summaryEn:'A conditional world'};
const candidate={nameEn:'Urban life in France in 1850',nameZh:'1850年的法国城市生活',descriptionEn:'Institutions condition daily life.',descriptionZh:'制度塑造日常生活。',
 firstYear:1850,validUntil:1850,kind:'daily_life',entity:'French urban life',attribute:'institutions',value:'conditional urban development',basis:'A stated institutional mechanism',evidenceIds:[],assumptions:['Local inference'],certainty:'low',relevant:true};
function chat({mode='in_world',facts=[candidate],comparison=null,calls=[]}={}){
 return async(_,messages,options)=>{
  const c=contextOf(messages);calls.push({stage:options.stage,context:c});
  switch(options.stage){
   case 'question-plan':return {mode,year:1850,scope:comparison?'global':'local',regions:['europe'],domains:['society'],dependencies:[{topic:'institutions',reason:'Constrain daily life'}],comparisonRequired:!!comparison,missing:[]};
   case 'question-inference':return {mode,draftAnswer:'A conditional inference about this same world',newFacts:facts,comparison,unresolved:['Exact measurements unknown']};
   case 'question-review':return {acceptedIds:c.proposals.map(x=>x.id),rejected:[]};
   case 'question-answer':return '基于这条世界线，法国城市生活受到既有制度与产业发展的共同影响。';
   default:throw new Error(options.stage);
  }
 };
}
const run=(callChat,extra={})=>{let n=0;return exploreWorld({question:'1850年法国普通人怎样生活？',branch,events:[],facts:[],callChat,config:{},makeId:()=> 'knowledge-'+(++n),...extra})};
import {contextOf} from './fixtures/minute-world.mjs';

test('a missing database detail launches planned inference and reviewed incremental knowledge',async()=>{
 const calls=[],before=structuredClone(branch);
 const first=await run(chat({calls}));
 assert.equal(first.knowledge.length,1);assert.equal(first.knowledge[0].status,'hypothesis');assert.match(first.answer,/法国/);
 assert.deepEqual(calls.map(c=>c.stage),['question-plan','question-inference','question-review','question-answer']);
 assert.deepEqual(branch,before,'only the app commits after complete success');
 const second=await run(chat(),{facts:first.knowledge});assert.equal(second.knowledge.length,0);assert.equal(second.assessment.duplicates,1);
});
test('hypothetical and ambiguous questions cannot silently become persistent world facts',async()=>{
 const out=await run(chat({mode:'hypothetical'}),{question:'假如法国统一欧洲会怎样？'});
 assert.equal(out.knowledge.length,0);assert.ok(out.answer);
 const original=chat();
 const ambiguous=await run(async(...args)=>args[2].stage==='question-plan'?{mode:'in_world',year:null,scope:'local',missing:['year']} :original(...args));
 assert.equal(ambiguous.knowledge.length,0);
});
test('world superlatives require an explicit common metric and actual candidate comparison',async()=>{
 const out=await run(chat({comparison:{metric:'Net assets under the same currency convention',year:1850,candidates:[{name:'Candidate A',basis:'Trade institutions'},{name:'Candidate B',basis:'Industrial ownership'}],coverage:'Conditional comparison',conclusive:false}}),{question:'1850年世界首富是谁？'});
 assert.ok(out.answer);
 const original=chat({comparison:{metric:'Wealth',candidates:[{name:'A'}]}});
 await assert.rejects(run(async(...args)=>args[2].stage==='question-inference'?{mode:'in_world',draftAnswer:'A random winner',newFacts:[],comparison:null}:original(...args)),/EXPLORATION_COMPARISON_MISSING/);
});
test('knowledge cannot use future events as evidence or mutate immutable macro history',()=>{
 const out=auditKnowledge({candidates:[{...candidate,evidenceIds:['future-event']}],events:[{id:'future-event',year:1900}],makeId:()=> 'k'});
 assert.equal(out.accepted.length,0);assert.equal(out.rejected[0].reason,'EVIDENCE_IN_FUTURE');
});
test('failed final answer yields no returned candidate knowledge for the app to commit',async()=>{
 const original=chat();
 await assert.rejects(run(async(...args)=>{if(args[2].stage==='question-answer')throw Error('Network lost');return original(...args)}),/Network lost/);
});
test('the real core bridge retrieves older related dialogue while following the new inference plan',async()=>{
 const old=globalThis.fetch,requests=[];const fake=chat({facts:[]});
 globalThis.fetch=async(_,init)=>{
  const body=JSON.parse(init.body),method=body.messages.at(-1).content;
  const stage=method.startsWith('Plan the')?'question-plan':method.startsWith('Carry out')?'question-inference':method.startsWith('Review these')?'question-review':'question-answer';
  requests.push(body);
  const result=await fake({},body.messages,{stage});
  return {ok:true,json:async()=>({choices:[{message:{content:typeof result==='string'?result:JSON.stringify(result)}}]})};
 };
 const history=[{role:'user',content:'Explain the astronomical guild'},{role:'assistant',content:'The guild was founded in 1500.'}];
 for(let i=0;i<10;i++)history.push({role:'user',content:'Unrelated '+i},{role:'assistant',content:'Reply '+i});
 try{
  await exploreCore({question:'How did the astronomical guild change?',branch,branches:[branch],history,config:{provider:'custom',endpoint:'https://example.com/chat',model:'test',key:'fake'}});
  assert.match(requests[0].messages.at(-1).content,/The guild was founded in 1500/);assert.equal(requests.length,3);
 }finally{globalThis.fetch=old}
});
