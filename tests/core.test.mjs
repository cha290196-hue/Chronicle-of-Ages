import test from 'node:test';
import assert from 'node:assert/strict';
import {BASELINE,validYear,FIRST_YEAR,LAST_YEAR,displayYear} from '../src/data.js';
import {extractJSON,safeConfig,validEndpoint,explicitYears,planSegments,classifyTemporalIntent,normalizeTemporalAnchor,sanitizeWorldline,inheritedState,worldEvents,worldFacts,simulate,simulateLegacy,configured} from '../src/core.js';

const cfg={provider:'custom',endpoint:'https://example.com/v1/chat/completions',model:'mock',key:'test'};

test('historical archive is sorted and stays within a strict non-zero-year period',()=>{
 assert.ok(BASELINE.length>=35);assert.equal(BASELINE[0].year,FIRST_YEAR);
 for(const [i,event] of BASELINE.entries()){assert.ok(validYear(event.year));if(i)assert.ok(event.year>=BASELINE[i-1].year);assert.ok(event.en&&event.zh)}
 assert.ok(!validYear(0));assert.ok(!validYear(-3201));assert.ok(!validYear(2027));assert.ok(validYear(2026));
 assert.match(displayYear(-1453),/BCE/);assert.match(displayYear(1234,'zh'),/公元/);
});
test('JSON extraction handles fenced content and rejects malformed data',()=>{
 assert.deepEqual(extractJSON('```json\n{"a":1}\n```'),{a:1});assert.deepEqual(extractJSON('prefix {"a":2} suffix'),{a:2});assert.throws(()=>extractJSON('broken'),/INVALID_JSON/);
});
test('endpoint validator rejects insecure remote origins',()=>{
 assert.ok(validEndpoint('https://api.openai.com/v1/chat/completions'));assert.ok(validEndpoint('http://localhost:8000/v1/chat/completions'));assert.equal(validEndpoint('http://example.com/v1/chat/completions'),false);assert.equal(validEndpoint('javascript:alert(1)'),false);
});
test('year extraction and segment boundaries',()=>{
 assert.deepEqual(explicitYears('In 1234 aliens arrive on Earth.'),[1234]);
 assert.deepEqual(explicitYears('公元前551年改变孔子的出生'),[-551]);
 for(const year of [-3200,-44,1453,2026]){const spans=planSegments(year);assert.equal(spans[0][0],year);assert.equal(spans.at(-1)[1],2026);assert.ok(spans.every(([a,b])=>a<=b&&validYear(a)&&validYear(b)))}
});
test('validates imported worldline shape',()=>{
 assert.equal(sanitizeWorldline({id:'x',anchorYear:2000,events:[]}),null);
 assert.ok(sanitizeWorldline({id:'a',anchorYear:1900,events:[{id:'e',year:1914,en:'A'}],facts:[],inherited:{events:[],facts:[]}}));
 assert.equal(configured(safeConfig({})),false);
});
test('branch-local knowledge snapshot preserves pre-fork history only',()=>{
 const parent={id:'b1',parentId:null,anchorYear:1200,prompt:'change',titleEn:'One',events:[{id:'e1',year:1220,en:'A'},{id:'e2',year:1500,en:'B'}],facts:[{id:'f1',firstYear:1250,nameEn:'A'},{id:'f2',firstYear:1550,nameEn:'B'}],inherited:{events:[],facts:[]}};
 const snapshot=inheritedState([parent],'b1',1300);
 assert.deepEqual(snapshot.events.map(x=>x.id),['e1']);assert.deepEqual(snapshot.facts.map(x=>x.id),['f1']);
});
test('simulation validates Earth anchor, phases, and persistent derived records with mocked provider',async()=>{
 const oldFetch=globalThis.fetch;const requests=[];
 globalThis.fetch=async(_url,opt)=>{const req=JSON.parse(opt.body);requests.push(req);let result;
  if(requests.length===1)result={valid:true,anchorYear:1234,type:'earth_intrusion',changeEn:'Aliens reach Earth',changeZh:'外星人到达地球'};
  else if(req.messages[1].content.includes('Reconcile the generated worldline'))result={titleEn:'A changed Earth',titleZh:'改变后的地球',summaryEn:'An alternate history to 2026.',summaryZh:'到2026年的架空历史。',impacts:['Institutions change'],certainty:'medium'};
  else{const match=req.messages[1].content.match(/checkpoint \d+\/\d+ for \[(-?\d+), (-?\d+)\]/i);assert.ok(match);const y=Number(match[2]);result={events:[{year:y,en:`Event ${y}`,zh:`事件 ${y}`,descriptionEn:'Consequence',descriptionZh:'后果',category:'society',certainty:'medium',causes:['Initial change']}],facts:[{firstYear:y,nameEn:`Idea ${y}`,nameZh:`技术 ${y}`,descriptionEn:'Concept',descriptionZh:'概念',kind:'technology',certainty:'low'}],stateEn:'Changed',stateZh:'变化'};}
  return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(result)}}]})};};
 try{const world=await simulateLegacy({prompt:'In 1234, aliens land on Earth.',branches:[],parentId:null,config:cfg});assert.equal(world.anchorYear,1234);assert.equal(world.type,'earth_intrusion');assert.ok(world.events.length>=4);assert.ok(world.facts.length>=4);assert.equal(world.titleZh,'改变后的地球');assert.equal(world.events.at(-1).year,LAST_YEAR);assert.ok(worldEvents([],world).length>world.events.length);assert.equal(worldFacts([],world).length,world.facts.length)}finally{globalThis.fetch=oldFetch}
});
test('model rejection leaves no worldline created',async()=>{
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({valid:false,anchorYear:1234,reasonEn:'Not Earth-bound'})}}]})});
 try{await assert.rejects(()=>simulate({prompt:'Change unknown planet X',config:cfg}),/ANCHOR_INVALID/)}finally{globalThis.fetch=oldFetch}
});
test('DeepSeek one-click preset uses current official chat endpoint and never changes image configuration',async()=>{
 const {withTextPreset,PROVIDERS,imageConfigured}=await import('../src/core.js');
 const source=safeConfig({textEnabled:false,imageEnabled:true,imageProvider:'custom',imageEndpoint:'https://image.example.com/v1/images/generations',imageModel:'graphic-x',imageKey:'img-only-secret'});
 const next=withTextPreset(source,'deepseek');
 assert.equal(PROVIDERS.deepseek.model,'deepseek-flash');
 assert.equal(next.endpoint,'https://api.deepseek.com/chat/completions');
 assert.equal(next.model,'deepseek-flash');
 assert.equal(next.textEnabled,true);
 assert.equal(next.imageEndpoint,source.imageEndpoint);
 assert.equal(next.imageKey,'img-only-secret');
 assert.ok(imageConfigured(next));
 assert.equal(withTextPreset(next,'deepseek','deepseek-v4-pro').model,'deepseek-v4-pro');
});

test('text-only mode ignores missing image API, and image-only keeps its own secret',async()=>{
 const {imageConfigured,generateImage}=await import('../src/core.js');
 const text=safeConfig({...cfg,textEnabled:true,imageEnabled:false,imageModel:'',imageKey:''});
 assert.ok(configured(text));assert.ok(!imageConfigured(text));
 const image=safeConfig({provider:'deepseek',endpoint:'',model:'',key:'',textEnabled:false,imageEnabled:true,imageProvider:'custom',imageEndpoint:'https://example.com/v1/images/generations',imageModel:'image-model',imageKey:'image-only-key'});
 assert.ok(!configured(image));assert.ok(imageConfigured(image));
 const prior=globalThis.fetch;let usedHeader='',usedModel='';
 globalThis.fetch=async(_url,opts)=>{usedHeader=opts.headers.authorization;usedModel=JSON.parse(opts.body).model;return {ok:true,json:async()=>({data:[{b64_json:'ZmFrZQ=='}]})}};
 try{const out=await generateImage({prompt:'A bridge',branch:null,config:image});assert.equal(usedHeader,'Bearer image-only-key');assert.equal(usedModel,'image-model');assert.match(out.data,/^data:image\/png;base64,/)}finally{globalThis.fetch=prior}
});

test('DeepSeek structured requests use JSON output and disable thinking to preserve token budget',async()=>{
 const {callChat}=await import('../src/core.js');const prior=globalThis.fetch;let body;
 globalThis.fetch=async(_url,opts)=>{body=JSON.parse(opts.body);return {ok:true,json:async()=>({choices:[{message:{content:'{"ok":true}'}}]})}};
 try{const config=safeConfig({provider:'deepseek',endpoint:'https://api.deepseek.com/chat/completions',model:'deepseek-flash',key:'sample'});const result=await callChat(config,[{role:'user',content:'JSON only'}],{json:true});assert.deepEqual(result,{ok:true});assert.deepEqual(body.thinking,{type:'disabled'});assert.deepEqual(body.response_format,{type:'json_object'});}finally{globalThis.fetch=prior}
});

test('discrete invention during a vague period remains point-based',()=>{
 const a=normalizeTemporalAnchor({anchorYear:900,timeMode:'point',transitionEndYear:900,type:'historical_change'},'唐朝末年发明了蒸汽机');
 assert.deepEqual([a.timeMode,a.anchorYear,a.transitionEndYear],['point',900,900]);
});
test('gradual historical turmoil has an onset and a later establishment date',()=>{
 const a=normalizeTemporalAnchor({anchorYear:870,timeMode:'gradual',transitionEndYear:908,type:'historical_change'},'唐朝末年天下逐渐大乱');
 assert.deepEqual([a.timeMode,a.anchorYear,a.transitionEndYear],['gradual',870,908]);
 assert.throws(()=>normalizeTemporalAnchor({anchorYear:870,timeMode:'gradual',transitionEndYear:870},'天下大乱'),/ANCHOR_INVALID/);
});
test('temporal anchor respects parent era and simulation boundaries',()=>{
 assert.throws(()=>normalizeTemporalAnchor({anchorYear:100,timeMode:'point'},'公元100年',{anchorYear:123}),/ANCHOR_PRECEDES_PARENT/);
 assert.throws(()=>normalizeTemporalAnchor({anchorYear:1900,timeMode:'gradual',transitionEndYear:2030},'逐渐变化'),/ANCHOR_INVALID/);
});
test('old archive dates migrate and impossible gradual archives are rejected',()=>{
 const old={id:'old',anchorYear:123,events:[],facts:[],inherited:{events:[],facts:[]}};
 const out=sanitizeWorldline(old);assert.equal(out.timeMode,'point');assert.equal(out.transitionEndYear,123);
 assert.equal(sanitizeWorldline({...old,timeMode:'gradual',transitionEndYear:90}),null);
});
test('grandchild inherits history only before each fork',()=>{
 const a={id:'a',parentId:null,anchorYear:123,events:[{id:'one',year:124},{id:'later',year:1700}],facts:[]};
 const b={id:'b',parentId:'a',anchorYear:800,events:[{id:'two',year:801}],facts:[]};
 assert.deepEqual(inheritedState([a,b],'b',1000).events.map(x=>x.id).sort(),['one','two']);
});

test('social turmoil and inventions are classified by mechanism rather than vague-era wording',()=>{
 assert.equal(classifyTemporalIntent('唐朝末年天下大乱'),'gradual');
 assert.equal(classifyTemporalIntent('唐朝末年发明了蒸汽机'),'point');
 assert.equal(classifyTemporalIntent('gradual decline of the empire'),'gradual');
 assert.equal(classifyTemporalIntent('late medieval period invented a turbine'),'point');
});
