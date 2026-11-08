import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {simulateOmega} from '../src/chronicle-adapter.mjs';
import {simulate} from '../src/core.js';
import {InterventionDecision,completionPolicy} from '../src/historical-intent.mjs';
import {clarificationQuestions,clarificationAnswers,renderClarificationDrawer,renderCompletionNotes} from '../src/clarification.mjs';
import {admission,worldChat,worldHTTP} from './fixtures/world-chat.mjs';

const conditions=[{field:'absence',en:'The movement never arises, rather than being erased later.',zh:'该运动从未产生，而不是在后来被消除。'},
 {field:'scope',en:'Unrelated people and movements remain unless causally affected.',zh:'未被这一前提影响的其他人物和运动保留。'}];
const missing=()=>({...admission(30),decision:'clarify',criticalUnknowns:['meaning of absence'],
 questions:[{en:'Never arose or removed later?',zh:'从未产生，还是后来被消除？',options:[{en:'Never arose',zh:'从未产生'},{en:'Removed later',zh:'后来被消除'}]}]});
const run=(callChat,extra={})=>simulateOmega({prompt:'假如基督教不存在',config:{},callChat,makeId:()=> 'completion-test',...extra});

test('automatic policy gives ordinary absence semantics while preserving explicit constraints and causal rules',()=>{
 const policy=completionPolicy(true);
 assert.match(policy,/never arose/i);assert.match(policy,/Explicit user constraints/);assert.match(policy,/unsupported downstream causal bridges/);
 assert.match(completionPolicy(false),/Do not choose omitted decisive parameters/);
});
test('automatic completion resolves an omission internally and propagates the recorded assumptions',async()=>{
 const calls=[];let interpretations=0,initialized=false;
 const fake=worldChat({calls,overrides:{interpretation:c=>{
  assert.equal(c.inputPolicy.autoComplete,true);assert.equal(c.input,'假如基督教不存在');
  if(++interpretations===1)return missing();
  assert.ok(c.completionFeedback);return {...admission(30),completions:conditions};
 },'world-initialization':c=>{
  initialized=true;assert.equal(c.year,30);assert.ok(c.interventions[0].assumptions.some(s=>s.includes('never arises')));
  throw new Error('TEST_ADMISSION_COMPLETE');
 }}});
 await assert.rejects(run(fake,{autoComplete:true}),/TEST_ADMISSION_COMPLETE/);
 assert.equal(interpretations,2);assert.equal(initialized,true);
 assert.equal(calls.filter(c=>c.options.stage==='intake-review').length,1);
});
test('automatic mode retries a clarification from the admission reviewer instead of opening a user question',async()=>{
 let reviews=0;
 const fake=worldChat({overrides:{interpretation:()=>({...admission(),completions:conditions}),
  'intake-review':c=>{assert.equal(c.inputPolicy.autoComplete,true);return ++reviews===1?{decision:'clarify',criticalUnknowns:['scope']}: {decision:'accept',criticalUnknowns:[]}}}});
 const {worldline}=await run(fake,{prompt:'一个制度从未建立',autoComplete:true});
 assert.equal(reviews,2);assert.deepEqual(worldline.simulation.admission.completions,conditions);
 assert.equal(worldline.simulation.admission.autoComplete,true);
});
test('manual mode returns answerable questions without constructing a world',async()=>{
 const calls=[];
 await assert.rejects(run(worldChat({calls,overrides:{interpretation:missing}}),{autoComplete:false}),
  e=>e.code==='INTERVENTION_CLARIFY'&&e.questions[0].zh==='从未产生，还是后来被消除？');
 assert.equal(calls.length,1);
});
test('manual mode does not silently accept defaults proposed despite the switch being off',async()=>{
 await assert.rejects(run(worldChat({overrides:{interpretation:()=>({...admission(),completions:conditions})}}),{autoComplete:false}),
  e=>e.code==='INTERVENTION_CLARIFY'&&e.questions.length===2);
});
test('manual answers are passed to both admission stages and retained separately from the original prompt',async()=>{
 const answers=[{question:'从未产生，还是后来被消除？',answer:'从未产生；其他人物保留。'}];
 const calls=[];
 const {worldline}=await run(worldChat({calls}),{prompt:'一个制度不存在',autoComplete:false,clarifications:answers});
 assert.deepEqual(calls[0].context.clarifications,answers);
 assert.deepEqual(calls.find(c=>c.options.stage==='intake-review').context.clarifications,answers);
 assert.equal(worldline.prompt,'一个制度不存在');assert.deepEqual(worldline.simulation.admission.clarifications,answers);
 assert.deepEqual(worldline.simulation.admission.completions,[]);
});
test('automatic completion cannot override an explicit year or bypass a genuinely invalid input',async()=>{
 await assert.rejects(run(worldChat({year:2021}),{prompt:'公元2020年改变制度',autoComplete:true}),/EXPLICIT_YEAR_MISMATCH/);
 const calls=[];
 await assert.rejects(run(worldChat({calls,overrides:{interpretation:()=>({...admission(),decision:'reject',intent:'irrelevant'})}}),{autoComplete:true}),/INTERVENTION_REJECTED/);
 assert.equal(calls.length,1);
});
test('automatic completion has a bounded retry and never converts model failure into a clarification pause',async()=>{
 const calls=[];
 await assert.rejects(run(worldChat({calls,overrides:{interpretation:missing}}),{autoComplete:true}),/AUTOCOMPLETE_INCOMPLETE/);
 assert.equal(calls.length,3);
});
test('manual answer dates constrain the fork when the original text had no year',async()=>{
 await assert.rejects(run(worldChat({year:2020}),{autoComplete:false,clarifications:[{question:'何时？',answer:'公元2010年'}]}),/EXPLICIT_YEAR_MISMATCH/);
});
test('reviewer-only missing parameters are available to the clarification drawer',()=>{
 const error=new InterventionDecision('INTERVENTION_CLARIFY',{criticalUnknowns:['distance','date']});
 assert.deepEqual(clarificationQuestions(error).map(q=>q.text),['distance','date']);
});
test('drawer renders questions, optional choices and required text fields while escaping model and user text',()=>{
 const questions=clarificationQuestions(missing(),'zh');
 const html=renderClarificationDrawer({prompt:'<script>bad()</script>',questions,values:{q1:'<img onerror=bad()>'}},'zh');
 assert.match(html,/role="dialog"/);assert.match(html,/继续推演/);assert.match(html,/从未产生/);assert.match(html,/name="clarify-q1"/);assert.match(html,/required/);
 assert.doesNotMatch(html,/<script>|<img /);assert.match(html,/&lt;script&gt;/);
 const data=new FormData();data.set('clarify-q1','  从未产生  ');
 assert.equal(clarificationAnswers(questions,data)[0].answer,'从未产生');
 data.set('clarify-q1','  ');assert.throws(()=>clarificationAnswers(questions,data),/CLARIFICATION_ANSWER_REQUIRED/);
});
test('completed premises are inspectable and use the selected interface language',()=>{
 const world={simulation:{admission:{completions:conditions}}};
 assert.match(renderCompletionNotes(world,'zh'),/自动补全的前提/);
 assert.match(renderCompletionNotes(world,'en'),/never arises/);assert.equal(renderCompletionNotes({},'zh'),'');
});
test('the public simulate bridge forwards the input mode and answers without changing other simulation stages',async()=>{
 const old=globalThis.fetch,requests=[];
 globalThis.fetch=async(_,init)=>{const body=JSON.parse(init.body);requests.push(body);return worldHTTP(body)};
 const answers=[{question:'范围？',answer:'全球'}];
 try{
  const world=await simulate({prompt:'公元2020年制度改变',autoComplete:true,clarifications:answers,
   config:{provider:'custom',endpoint:'https://example.com/chat',model:'test',key:'fake'}});
  assert.equal(world.simulation.admission.autoComplete,true);assert.deepEqual(world.simulation.admission.clarifications,answers);
  assert.ok(requests[0].messages.at(-1).content.includes('AUTO-COMPLETION IS ON'));
 }finally{globalThis.fetch=old}
});
