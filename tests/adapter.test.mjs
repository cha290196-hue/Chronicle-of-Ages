import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateOmega} from '../src/chronicle-adapter.mjs';

const a={kind:'earth_intrusion',scope:'earth',mode:'point',startYear:1234,endYear:1234,target:'Earth arrival',value:'yes',description:'A fictional fleet reaches Earth'};
test('adapter runs intake, independent windowed proposals, synthesis and legacy export',async()=>{
 let count=0;const progress=[];
 const callChat=async (_config,messages,opts)=>{
  assert.equal(opts.json,true);count++;
  const p=messages.at(-1).content;
  if(p.includes('Classify user input'))return {intent:'edit',valid:true,operations:[a]};
  if(p.includes('Propose counterfactual')){
   const year=Number(p.match(/window \[(-?\d+),/)[1]);
   return {events:[{id:`evt-${year}`,year,en:`Consequence in ${year}`,zh:`${year}年的后果`,causes:['intervention:1'],certainty:'low',category:'society'}],facts:[]};
  }
  if(p.startsWith('Summarize the preferred scenario'))return {titleEn:'Counterfactual Earth',titleZh:'推演地球',summaryEn:'A possible scenario.',summaryZh:'可能的情景。',impacts:[]};
  throw new Error('Unexpected prompt');
 };
 const out=await simulateOmega({prompt:'In 1234 aliens arrive on Earth.',callChat,makeId:()=> 'world-B',config:{},baseline:[],scenarioCount:2,maxWindows:3,onProgress:x=>progress.push(x)});
 assert.equal(count,8); // 1 intake + 2x3 windows + 1 synthesis
 assert.equal(out.worldline.id,'world-B');
 assert.equal(out.worldline.type,'earth_intrusion');
 assert.equal(out.worldline.events.length,3);
 assert.equal(out.analysis.alternatives.length,1);
 assert.equal(out.worldline.summaryZh,'可能的情景。');
 assert.ok(progress.some(x=>x.phase==='propagation'));
});

test('adapter keeps questions out of the historical edit path',async()=>{
 const callChat=async()=>({intent:'question',valid:true,operations:[]});
 await assert.rejects(()=>simulateOmega({prompt:'What happened in Rome?',callChat,makeId:()=> 'x'}),/NOT_AN_EDIT/);
});