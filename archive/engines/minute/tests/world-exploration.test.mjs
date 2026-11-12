import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {exploreWorld} from '../src/world-exploration.mjs';
import {exploreCore,sanitizeWorldline} from '../../../../src/core.js';
import {auditKnowledge,mergeKnowledge} from '../src/exploration-knowledge.mjs';
import {resolveComparison} from '../src/core-resolution.mjs';
import {contextOf} from './fixtures/minute-world.mjs';

const event={id:'industrial-root',year:1800,en:'Regional industrial institutions',zh:'区域产业制度',descriptionZh:'地区产业、贸易与人口的演化基础。',region:'europe'};
const branch={id:'B',parentId:null,anchorYear:1644,events:[event],facts:[],knowledge:[],titleEn:'An alternate Earth',summaryEn:'A conditional world',prompt:'Ming survives'};
const candidate=(overrides={})=>({id:'p1',nameEn:'French urban life in 1850',nameZh:'1850年的法国城市生活',descriptionEn:'Industrial institutions and municipal investment support urban public services.',descriptionZh:'产业制度和市政投资支持城市公共服务。',firstYear:1850,validUntil:1850,kind:'daily_life',entity:'French urban life',attribute:'public services',value:'municipal services supported by industrial taxation',basis:'Regional industrial tax capacity supports municipal services.',evidenceIds:['industrial-root'],assumptions:['Municipal investment follows industrial tax receipts'],certainty:'medium',...overrides});
const plan=(extra={})=>({mode:'in_world',year:1850,scope:'local',domains:['society'],regions:['europe'],dependencies:[],comparisonRequired:false,defaults:[],...extra});
function chat({mode='in_world',proposals=[candidate()],comparison=null,calls=[],year=1850}={}){
 return async(_,messages,options)=>{
  const c=contextOf(messages);calls.push({stage:options.stage,context:c,options});
  if(options.stage==='question-plan')return plan({mode,year,comparisonRequired:!!comparison,scope:comparison?'global':'local'});
  if(options.stage==='question-inference')return {mode,draftAnswer:'A completed local-world account',answerFactIds:proposals.length?proposals.map(x=>x.id):['industrial-root'],newFacts:proposals,comparison,unresolved:[]};
  if(options.stage==='question-completion'){const prior=new Set(c.previousProjection.newFacts.map(f=>f.id));return {verdict:'repair',edits:{facts:proposals.filter(f=>prior.has(f.id)),newFacts:proposals.filter(f=>!prior.has(f.id)),comparison,answerFactIds:proposals.length?proposals.map(x=>x.id):['industrial-root'],draftAnswer:'Completed account'}};}
  if(options.stage==='question-review')return {verdict:'complete',acceptedIds:c.proposals.map(x=>x.id),rejected:[],issues:[]};
  if(options.stage==='question-answer')return {answer:'法国城市公共服务由产业税收和市政投资支撑。',usedFactIds:c.approvedAnswerRecords.map(x=>x.id)};
  throw new Error(options.stage);
 };
}
const run=(callChat,extra={})=>{let n=0;return exploreWorld({question:'1850年法国普通人怎样生活？',branch,events:[event],facts:[],callChat,config:{},makeId:()=> 'knowledge-'+(++n),...extra})};
const gdp=(id,entity,amount,more={})=>candidate({id,nameEn:entity+' nominal GDP',nameZh:entity+'名义GDP',entity,attribute:'GDP',value:String(amount),kind:'economy',firstYear:2026,validUntil:2026,quantity:{amount,unit:'万亿本世界线美元',metric:'nominal-gdp',period:'2025'},...more});
const comparison={metric:'nominal-gdp',label:'名义GDP',unit:'万亿本世界线美元',period:'2025',year:2026,scope:'global',entityType:'country',order:'descending',coverage:'Global industrial and population trajectories support these leaders; smaller economies remain below the final entry.',entries:[{entity:'甲国',factId:'p1'},{entity:'乙国',factId:'p2'},{entity:'丙国',factId:'p3'}]};
const rankingChat=opts=>chat({year:2026,proposals:[gdp('p1','甲国',12),gdp('p2','乙国',20),gdp('p3','丙国',8)],comparison,...opts});

test('missing detail is completed, reviewed and established as branch-local canon atomically',async()=>{
 const calls=[],before=structuredClone(branch),first=await run(chat({calls}));
 assert.equal(first.knowledge.length,1);assert.equal(first.knowledge[0].status,'established-in-world');assert.equal(first.knowledge[0].commitment,'world-canon');assert.match(first.answer,/法国/);
 assert.deepEqual(calls.map(c=>c.stage),['question-plan','question-inference','question-review','question-answer']);assert.ok(calls.every(c=>c.options.reasoning===false));assert.deepEqual(branch,before);
 const second=await run(chat(),{facts:first.knowledge});assert.equal(second.knowledge.length,0);assert.equal(second.assessment.duplicates,1);assert.equal(second.resolution.answerFactIds[0],first.knowledge[0].id);
});
test('an omitted date and obsolete missing flags use defaults instead of disabling persistence',async()=>{
 const original=chat({proposals:[candidate({firstYear:2026,validUntil:2026})]});let seen;
 const out=await run(async(...args)=>{if(args[2].stage==='question-plan')return plan({year:null,missing:['year','metric']});if(args[2].stage==='question-inference')seen=contextOf(args[1]);return original(...args)});
 assert.equal(out.plan.year,2026);assert.equal(out.knowledge.length,1);assert.equal(seen.plan.year,2026);assert.ok(out.plan.defaults.length);
});
test('global numerical ranking is sorted from approved quantities and stored with all its operands',async()=>{
 const out=await run(rankingChat(),{question:'这个世界的GDP排名'});
 assert.equal(out.knowledge.length,4);assert.equal(out.resolution.comparison.entries[0].entity,'乙国');assert.deepEqual(out.resolution.comparison.entries.map(e=>e.rank),[1,2,3]);assert.match(out.answer,/\*\*1\. 乙国\*\*：20/);
 const table=out.knowledge.find(f=>f.ranking);assert.equal(table.ranking.entries[0].amount,20);assert.equal(table.evidenceIds.length,3);
 const restored=sanitizeWorldline({...branch,knowledge:out.knowledge});assert.deepEqual(restored.knowledge.find(f=>f.ranking).ranking,table.ranking);
 assert.ok(mergeKnowledge([],out.knowledge).facts.every(f=>f.commitment==='world-canon'));
});
test('a later ranking question reuses stored quantities and ranking identity without inventing replacements',async()=>{
 const first=await run(rankingChat(),{question:'这个世界的GDP排名'}),table=first.knowledge.find(f=>f.ranking),calls=[];
 const out=await run(chat({year:2026,proposals:[],comparison:{reuseFactId:table.id},calls}),{question:'再说一次GDP排名',facts:first.knowledge});
 assert.equal(out.knowledge.length,0);assert.deepEqual(out.resolution.comparison,first.resolution.comparison);assert.ok(out.resolution.answerFactIds.includes(table.id));assert.ok(calls[1].context.establishedCoreRecords.some(f=>f.id===table.id));
});
test('candidate tiers trigger completion rather than becoming a final missing-database answer',async()=>{
 const calls=[],original=rankingChat({calls});let projections=0;
 const out=await run(async(...args)=>{if(args[2].stage==='question-inference'){projections++;return {mode:'in_world',draftAnswer:'No GDP table exists; country A and B may lead',newFacts:[],answerFactIds:[],comparison:null};}if(args[2].stage==='question-completion')projections++;return original(...args)},{question:'这个世界GDP排名'});
 assert.equal(projections,2);assert.equal(out.knowledge.length,4);assert.match(out.answer,/乙国/);assert.doesNotMatch(out.answer,/No GDP|may lead/);
 const answerContext=calls.find(c=>c.stage==='question-answer').context;assert.equal(answerContext.analysis,undefined);assert.equal(answerContext.nonPersistentAnalysis,undefined);
});
test('semantic incompleteness receives a completion pass; required dependencies cannot be silently dropped',async()=>{
 const original=chat();let reviews=0;
 const out=await run(async(...args)=>{if(args[2].stage==='question-review'&&!reviews++)return {verdict:'incomplete',acceptedIds:[],rejected:[],issues:['Resolve the required municipal financing dependency']};return original(...args)});
 assert.equal(out.assessment.attempts,2);assert.equal(out.knowledge.length,1);
 await assert.rejects(run(async(...args)=>args[2].stage==='question-review'?{verdict:'complete',acceptedIds:[],rejected:[],issues:[]}:original(...args)),/EXPLORATION_UNRESOLVED/);
});
test('hypothetical alterations are answerable without becoming persistent world facts',async()=>{
 const out=await run(chat({mode:'hypothetical'}),{question:'假如法国统一欧洲会怎样？'});assert.equal(out.knowledge.length,0);assert.ok(out.answer);
 const original=chat();const misclassified=await run(async(...args)=>args[2].stage==='question-review'?{mode:'hypothetical',verdict:'complete',acceptedIds:[],rejected:[],blockingIssues:[]}:original(...args),{question:'假如法国统一欧洲会怎样？'});assert.equal(misclassified.knowledge.length,0);
});
test('recorded Earth does not silently acquire fictional branch canon',async()=>{
 const out=await run(chat(),{branch:null});assert.equal(out.knowledge[0].commitment,undefined);assert.equal(out.knowledge[0].status,'hypothesis');
});
test('mixed units, metric, accounting period or duplicate entities cannot create a ranking',()=>{
 const records=[gdp('a','甲国',12),gdp('b','乙国',20)],raw={...comparison,entries:[{entity:'甲国',factId:'a'},{entity:'乙国',factId:'b'}]};
 assert.throws(()=>resolveComparison(raw,{records:[records[0],{...records[1],quantity:{...records[1].quantity,unit:'PPP dollars'}}],year:2026}),/EXPLORATION_COMPARISON_INVALID/);
 assert.throws(()=>resolveComparison({...raw,entries:[raw.entries[0],raw.entries[0]]},{records,year:2026}),/EXPLORATION_COMPARISON_INVALID/);
 assert.throws(()=>resolveComparison({...raw,period:'2024'},{records,year:2026}),/EXPLORATION_COMPARISON_INVALID/);
});
test('changing an already established quantity is rejected without partial persistence',async()=>{
 const first=await run(rankingChat(),{question:'GDP排名'}),original=rankingChat({proposals:[gdp('p1','甲国',99),gdp('p2','乙国',20),gdp('p3','丙国',8)]});
 await assert.rejects(run(original,{question:'GDP排名',facts:first.knowledge}),/EXPLORATION_UNRESOLVED/);
});
test('hard world conflicts and a failed final answer return no commit-ready knowledge',async()=>{
 const original=chat();
 await assert.rejects(run(async(...args)=>args[2].stage==='question-review'?{verdict:'reject',acceptedIds:[],issues:['Contradicts existing world history']}:original(...args)),/EXPLORATION_WORLD_CONFLICT/);
 await assert.rejects(run(async(...args)=>{if(args[2].stage==='question-answer')throw Error('Network lost');return original(...args)}),/Network lost/);
 await assert.rejects(run(async(...args)=>args[2].stage==='question-answer'?{answer:'Unknown extra fact',usedFactIds:['invented-id']}:original(...args)),/EXPLORATION_ANSWER_INVALID/);
});
test('future evidence remains forbidden during Core completion',()=>{
 const out=auditKnowledge({candidates:[candidate({evidenceIds:['future']})],events:[{id:'future',year:1900}],makeId:()=> 'k'});assert.equal(out.rejected[0].reason,'EVIDENCE_IN_FUTURE');
});
test('the public Core bridge retains older relevant dialogue and uses Flash for every official request',async()=>{
 const originalFetch=globalThis.fetch,requests=[];
 globalThis.fetch=async(_,init)=>{
  const body=JSON.parse(init.body);requests.push(body);
  return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({answer:'The guild adapted to the continuing industrial history.',knowledge:[]})}}]})};
 };
 const history=[{role:'user',content:'Explain the astronomical guild'},{role:'assistant',content:'The guild was founded in 1500.'}];for(let i=0;i<10;i++)history.push({role:'user',content:'Unrelated '+i},{role:'assistant',content:'Reply '+i});
 try{await exploreCore({question:'How did the astronomical guild change?',branch,branches:[branch],history,config:{provider:'deepseek',endpoint:'https://api.deepseek.com/chat/completions',model:'deepseek-v4-pro',key:'test-only'}});assert.match(requests[0].messages.at(-1).content,/The guild was founded in 1500/);assert.equal(requests.length,1);assert.ok(requests.every(r=>r.model==='deepseek-flash'&&r.thinking.type==='enabled'&&!r.tools));}finally{globalThis.fetch=originalFetch;}
});
test('chat rejects a late knowledge conflict atomically instead of displaying an answer whose facts were discarded',async()=>{
 const source=await readFile('src/app.js','utf8'),code=source.slice(source.indexOf('async function submitQuestion('),source.indexOf('async function submitImage('));
 const existing=auditKnowledge({candidates:[candidate()],events:[event],makeId:()=> 'old'}).accepted;
 const b={knowledge:existing},state={chats:{},lang:'zh',branches:[b],baselineKnowledge:[],tab:'core'},form={querySelector:()=>({value:'a question'})};
 const context={state,active:()=>({...b,id:'B'}),configured:()=>true,config:{},renderPanel:()=>{},persist:()=>true,exploreCore:async()=>({knowledge:[{...existing[0],id:'new',value:'contradictory value'}],answer:'Incorrectly confirmed answer'}),mergeKnowledge,explainError:e=>e.code};
 runInNewContext(code+';this.submit=submitQuestion',context);await context.submit(form);
 assert.equal(state.chats.B.at(-1).error,true);assert.equal(state.chats.B.at(-1).content,'EXPLORATION_COMMIT_CONFLICT');assert.deepEqual(b.knowledge,existing);
});

test('a genuinely inapplicable metric gives a concrete answer without inventing an economy',async()=>{
 const extinction={id:'extinction',year:1900,en:'Human extinction'},original=chat({proposals:[],year:2026,comparison:{notApplicable:{reason:'No human economy remains after extinction',evidenceIds:['extinction']}}});
 const out=await run(async(...args)=>{if(args[2].stage==='question-inference')return {mode:'in_world',draftAnswer:'No human economy remains',answerFactIds:['extinction'],newFacts:[],comparison:{notApplicable:{reason:'No human economy remains',evidenceIds:['extinction']}}};if(args[2].stage==='question-answer')return {answer:'这条世界线已无人类经济，GDP排名不适用。',usedFactIds:['extinction']};return original(...args)},{question:'GDP排名',events:[extinction]});
 assert.equal(out.knowledge.length,0);assert.match(out.answer,/不适用/);assert.equal(out.resolution.comparison,null);
});
test('past-year inquiries cannot inherit a post-fork or endpoint snapshot as their initial state',async()=>{
 const early={id:'early',year:900,en:'Early institution'},lateState={year:1644,regions:[{region:'europe',summary:'Future-only state'}],conditions:[],processes:[]},b={...branch,simulation:{genesis:lateState,actions:[],snapshots:[{year:2026,state:{...lateState,year:2026}}]}};
 const original=chat({year:1000,proposals:[]});let seen;
 await run(async(...args)=>{if(args[2].stage==='question-inference'){seen=contextOf(args[1]);return {mode:'in_world',draftAnswer:'Early conditions',answerFactIds:['early'],newFacts:[],comparison:null};}return original(...args)},{branch:b,events:[early,event],question:'公元1000年的情况'});
 assert.deepEqual(seen.globalState,[]);assert.equal(seen.world.summary,undefined);assert.equal(seen.world.premise,undefined);assert.deepEqual(seen.causalGraph.records.map(r=>r.id),['early']);
});

test('equipment identity and multiple technical parameters use the same generic completion and persistence path',async()=>{
 const support=candidate({id:'p0',role:'support',kind:'military',entity:'French industry',attribute:'manufacturing',value:'mature precision manufacturing',firstYear:2000,validUntil:2026});
 const identity=candidate({id:'p1',role:'answer',kind:'military',entity:'Tank F-7',attribute:'designation',value:'F-7',firstYear:2026,validUntil:2026,evidenceIds:['p0']});
 const specs=[['combat-mass',54,'t'],['crew',3,'persons'],['road-speed',70,'km/h'],['gun-calibre',120,'mm'],['road-range',500,'km']].map(([metric,amount,unit],i)=>candidate({id:'p'+(i+2),role:'answer',nameEn:'F-7 '+metric,nameZh:'F-7 '+metric,kind:'military',entity:'Tank F-7',attribute:metric,value:String(amount),firstYear:2026,validUntil:2026,evidenceIds:['p1'],quantity:{amount,unit,metric,period:'2026-01-01'}}));
 const original=chat({year:2026,proposals:[support,identity,...specs]});
 const out=await run(async(...args)=>args[2].stage==='question-inference'?{mode:'in_world',newFacts:[support,identity,...specs],comparison:null,reuseFactIds:[],draftAnswer:'A coherent tank profile'}:original(...args),{question:'这个世界法国主战坦克的型号、重量、乘员、速度、火炮口径和续航里程？'});
 assert.equal(out.knowledge.length,7);assert.match(out.answer,/54 t/);assert.match(out.answer,/120 mm/);assert.match(out.answer,/500 km/);assert.equal(out.resolution.comparison,null);assert.ok(!out.resolution.answerFactIds.includes(out.knowledge.find(f=>f.entity==='French industry').id));
 const kept=out.knowledge.find(f=>f.quantity?.metric==='combat-mass');
 const repeated=await run(async(...args)=>args[2].stage==='question-inference'?{mode:'in_world',newFacts:[],comparison:null,reuseFactIds:[kept.id],draftAnswer:'Reuse the established mass'}:original(...args),{question:'这款坦克的战斗全重再告诉我一次',facts:out.knowledge});assert.equal(repeated.knowledge.length,0);assert.match(repeated.answer,/54 t/);
});
test('ordinary people, institutions and daily life need no numerical comparison or topic-specific code',async()=>{
 for(const [question,kind,entity,attribute,value] of [['这个世界的里昂市长是谁？','person','Lyon mayor','identity','Mira Valen'],['这个国家的议会怎么产生？','politics','National parliament','selection','district elections'],['这座城市普通人的周末如何度过？','daily_life','Urban residents','weekend','public parks and local markets']]){
  const proposed=candidate({role:'answer',kind,entity,attribute,value,firstYear:2026,validUntil:2026}),original=chat({year:2026,proposals:[proposed]});const out=await run(original,{question});assert.equal(out.knowledge.length,1);assert.equal(out.knowledge[0].value,value);assert.equal(out.resolution.comparison,null);
 }
});
test('arbitrary quantitative questions resolve intermediate operands and arithmetic without a GDP special case',async()=>{
 const q=(id,role,entity,attribute,amount,unit,metric)=>candidate({id,role,entity,attribute,value:String(amount),firstYear:2026,validUntil:2026,quantity:{amount,unit,metric,period:'2025'}});
 const a=q('p1','support','City X','population',3000000,'persons','population'),b=q('p2','support','City X','annual demand per resident',4,'MWh/person','electricity-per-person'),c={...q('p3','answer','City X','annual electricity demand',12,'TWh','electricity-demand'),evidenceIds:['p1','p2'],calculation:{operation:'product',inputs:['p1','p2'],scale:.000001,decimals:2}};
 const original=chat({year:2026,proposals:[a,b,c]});const out=await run(async(...args)=>args[2].stage==='question-inference'?{mode:'in_world',newFacts:[a,b,c],comparison:null,reuseFactIds:[],draftAnswer:'Annual electricity demand'}:original(...args),{question:'这座城市一年的用电量是多少？'});
 assert.equal(out.knowledge.length,3);assert.match(out.answer,/12 TWh/);assert.equal(out.resolution.comparison,null);
});

test('successful audit notes do not block completion; explicit blocking defects still do',async()=>{
 const original=chat();const out=await run(async(...args)=>{if(args[2].stage==='question-review'){const c=contextOf(args[1]);return {verdict:'complete',acceptedIds:c.proposals.map(r=>r.id),rejected:[],issues:['Parameters are coherent; non-essential variants remain open'],notes:['World-local settings, not real observations']};}return original(...args)});assert.equal(out.assessment.attempts,1);assert.equal(out.knowledge.length,1);
 await assert.rejects(run(async(...args)=>{if(args[2].stage==='question-review'){const c=contextOf(args[1]);return {verdict:'complete',acceptedIds:c.proposals.map(r=>r.id),rejected:[],blockingIssues:[{code:'CONFLICT',reason:'Conflicts with an established fact'}]};}return original(...args)}),/EXPLORATION_UNRESOLVED/);
});

test('situational natural language is classified semantically rather than blocked by a conditional keyword',async()=>{
 const out=await run(chat(),{question:'假如我去这个世界法国旅行，1850年城市公共服务如何？'});assert.equal(out.knowledge.length,1);assert.equal(out.knowledge[0].commitment,'world-canon');
});

test('a valid stored comparison alone is sufficient answer evidence on a repeat query',async()=>{
 const first=await run(rankingChat(),{question:'GDP排名'}),table=first.knowledge.find(f=>f.ranking),original=chat({year:2026,proposals:[],comparison:{reuseFactId:table.id}});
 const out=await run(async(...args)=>args[2].stage==='question-inference'?{mode:'in_world',newFacts:[],comparison:{reuseFactId:table.id},reuseFactIds:[],draftAnswer:'Reuse the stored comparison'}:original(...args),{question:'GDP排名再告诉我一次',facts:first.knowledge});
 assert.equal(out.knowledge.length,0);assert.ok(out.resolution.answerFactIds.includes(table.id));
});
