import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate, simulateLegacy, worldEvents, configured } from '../src/core.js';

const cfg = {provider:'custom',endpoint:'https://example.com/v1/chat/completions',model:'mock',key:'test'};

test('public simulate uses UCM-Ω intake, audited windows and synthesis, never the legacy checkpoint prompts', async () => {
 const oldFetch=globalThis.fetch;let intake=0,proposals=0,synthesis=0;
 globalThis.fetch=async (_url,opt)=>{
  const request=JSON.parse(opt.body),prompt=request.messages.at(-1).content;
  let result;
  if(prompt.includes('Classify user input into edit')) {
   intake++;
   result={intent:'edit',valid:true,operations:[{kind:'earth_intrusion',scope:'earth',mode:'point',startYear:1234,endYear:1234,target:'Arrival on Earth',value:'arrives',description:'Fictional visitors arrive on Earth'}]};
  }else if(prompt.includes('Propose counterfactual events for scenario')){
   proposals++;
   const match=prompt.match(/window \[(-?\d+),\s*(-?\d+)\]/);
   assert.ok(match,'each proposal must include a valid window');
   const year=Number(match[1]);
   const scenario=Number(prompt.match(/scenario (\d+)/)[1]);
   result={events:[{id:`scenario-${scenario}-event-${year}`,year,en:`Consequences in ${year}`,zh:`${year}年的变化`,descriptionEn:'A hypothetical consequence.',category:'society',certainty:'low',causes:['intervention:1'],requires:[],assumptions:[]}],facts:[],summary:'Changes unfold.'};
  }else if(prompt.includes('Summarize the preferred scenario')){
   synthesis++;
   result={titleEn:'Alternate Earth',titleZh:'分叉地球',summaryEn:'Audited historical scenario.',summaryZh:'因果审计后的历史情景。',impacts:['Institutions evolve']};
  }else throw new Error('Legacy or unexpected model prompt: '+prompt.slice(0,120));
  return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(result)}}]})};
 };
 try {
  assert.ok(configured(cfg));
  assert.equal(typeof simulateLegacy,'function','original engine remains independently retained');
  const branch=await simulate({prompt:'In 1234 visitors arrive on Earth.',branches:[],parentId:null,config:cfg,lang:'zh'});
  assert.equal(branch.anchorYear,1234);
  assert.equal(branch.type,'earth_intrusion');
  assert.equal(branch.summaryZh,'因果审计后的历史情景。');
  assert.equal(intake,1);
  assert.equal(proposals,12,'two independent scenarios each have six windows');
  assert.equal(synthesis,1);
  assert.ok(branch.events.length>=6,'the audited preferred scenario is in the active branch');
  assert.equal(branch.events.some(e=>e.year===0),false);
  assert.ok(worldEvents([],branch).length>branch.events.length,'the full worldline inherits pre-fork reality');
 }finally{globalThis.fetch=oldFetch}
});

test('public simulate does not silently fall back to the old algorithm on out-of-scope input', async () => {
 const old=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({intent:'out_of_scope',valid:false,reasonEn:'Not Earth-bound',operations:[]})}}]})};};
 try {
  await assert.rejects(()=>simulate({prompt:'Invent a history on an unknown unrelated planet',config:cfg}),error=>error?.code==='OUT_OF_SCOPE');
  assert.equal(calls,1);
 }finally{globalThis.fetch=old}
});
