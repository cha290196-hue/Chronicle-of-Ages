import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {simulateOmega} from '../src/chronicle-adapter.mjs';
import {resolveIntervention} from '../src/intervention-intake.mjs';
import {admitIntervention,INTAKE_METHOD} from '../src/historical-intent.mjs';
import {compileInterventions} from '../src/ucm-omega.mjs';
import {explainError,sanitizeWorldline} from '../src/core.js';
import {renderIntakeDiagnostics} from '../src/clarification.mjs';
import {admission,worldChat} from './fixtures/world-chat.mjs';

const captured=JSON.parse(await readFile(new URL('./fixtures/intake-preservation-failure.json',import.meta.url),'utf8'));
const clone=x=>JSON.parse(JSON.stringify(x));
const corrected=()=>({...clone(captured),operations:[clone(captured.operations[0])],causalBridge:clone(captured.causalBridge.slice(0,2)),
 preservedContext:[{en:'Jesus and unrelated Jewish movements are not removed by the initial premise.',zh:'初始前提不移除耶稣和无关的犹太运动。'}],
 uncertaintyNotes:[{en:'Later consequences remain conditional and will be simulated.',zh:'后续结果留待推演，具有条件性。'}]});
const run=(chat,options={})=>simulateOmega({prompt:'基督教从未出现',autoComplete:true,callChat:chat,config:{key:'private-test-key'},makeId:()=> 'intake-regression',...options});
const stopAtGenesis=c=>{throw new Error('ADMISSION_COMPLETE')};

test('captured real failure retains both underlying guard failures; no validator silently drops records',()=>{
 assert.throws(()=>admitIntervention(captured,{prompt:'基督教从未出现'}),/UNSUPPORTED_CAUSAL_BRIDGE/);
 assert.throws(()=>compileInterventions(captured),/UNKNOWN_BRANCH_FACT/);
 assert.equal(captured.operations.length,2);assert.equal(captured.operations[1].parentFactId,null);
 assert.match(INTAKE_METHOD,/preservedContext/);assert.match(INTAKE_METHOD,/uncertaintyNotes/);
});
for(const autoComplete of [true,false])test(`captured failure is repaired with original meaning intact (completion ${autoComplete})`,async()=>{
 const calls=[];let count=0;
 const raw=clone(captured);if(!autoComplete)raw.completions=[];
 const repaired=corrected();if(!autoComplete)repaired.completions=[];
 const fake=worldChat({calls,overrides:{interpretation:c=>{
  assert.equal(c.inputPolicy.autoComplete,autoComplete);
  if(++count===1)return raw;
  assert.equal(c.completionFeedback.kind,'representation-repair');assert.equal(c.completionFeedback.code,'UNSUPPORTED_CAUSAL_BRIDGE');
  assert.deepEqual(c.completionFeedback.previousInterpretation,raw);return repaired;
 },'intake-review':c=>{
  assert.equal(c.intakeDiagnostics[0].validation,'UNSUPPORTED_CAUSAL_BRIDGE');
  assert.equal(c.intakeDiagnostics[0].interpretation.operations.length,2);
  assert.equal(c.interpretation.operations.length,1);assert.equal(c.interpretation.preservedContext.length,1);
  assert.equal(c.interpretation.uncertaintyNotes.length,1);return {decision:'accept',criticalUnknowns:[]};
 },'world-initialization':c=>{
  assert.equal(c.year,30);assert.equal(c.interventions.length,1);
  assert.match(c.preservedContext[0].zh,/不移除/);assert.match(c.uncertaintyNotes[0].zh,/留待推演/);return stopAtGenesis(c);
 }}});
 await assert.rejects(run(fake,{autoComplete,prompt:autoComplete?'基督教从未出现':'公元30年基督教不形成；保留耶稣和其他犹太运动'}),/ADMISSION_COMPLETE/);
 assert.equal(count,2);assert.equal(calls.filter(c=>c.options.stage==='intake-review').length,1);
});
test('invalid parent fact is repaired as a representation error without inventing or coercing its ID',async()=>{
 const raw=corrected();raw.operations.push(clone(captured.operations[1]));let count=0;
 await assert.rejects(run(worldChat({overrides:{interpretation:c=>{
  if(++count===1)return raw;
  assert.equal(c.completionFeedback.code,'UNKNOWN_BRANCH_FACT');return corrected();
 },'world-initialization':stopAtGenesis}})),/ADMISSION_COMPLETE/);
 assert.equal(count,2);
});
test('repeated model errors terminate after three interpretations with truthful diagnostics, never an affirmative rejection reason',async()=>{
 const calls=[];
 await assert.rejects(run(worldChat({calls,overrides:{interpretation:()=>clone(captured)}})),e=>{
  assert.equal(e.code,'INTAKE_MODEL_INVALID');assert.equal(e.causeCode,'UNSUPPORTED_CAUSAL_BRIDGE');
  assert.equal(e.intakeDiagnostics.length,3);assert.equal(calls.length,3);
  const message=explainError(e,'zh');assert.match(message,/模型/);assert.match(message,/UNSUPPORTED_CAUSAL_BRIDGE/);
  assert.doesNotMatch(message,/可以受理|请调整输入/);assert.ok(!JSON.stringify(e.intakeDiagnostics).includes('private-test-key'));return true;
 });
 const unsupported=Object.assign(new Error(),{code:'UNSUPPORTED_CAUSAL_BRIDGE',reasonZh:''});
 const failure=(()=>{try{admitIntervention(captured);return null}catch(e){return e}})();
 assert.equal(explainError(failure,'zh'),explainError(unsupported,'zh'));
});
test('a wholly speculative mechanism is refused immediately and cannot be passed by completion',async()=>{
 const calls=[];await assert.rejects(run(worldChat({calls,overrides:{interpretation:()=>({...admission(),causalBridge:[{mechanism:'An unexplained sneeze creates a tsunami',support:'speculative'}]})}})),/UNSUPPORTED_CAUSAL_BRIDGE/);
 assert.equal(calls.length,1);
});
test('review sees the failed bridge and can refuse a repair that merely relabels its essential unsupported link',async()=>{
 let count=0;const raw=corrected();raw.causalBridge.push({mechanism:'An unphysical essential bridge to Earth',support:'speculative'});
 const relabeled=clone(raw);relabeled.causalBridge.at(-1).support='established';
 const calls=[];await assert.rejects(run(worldChat({calls,overrides:{interpretation:()=>++count===1?raw:relabeled,'intake-review':c=>{
  assert.equal(c.intakeDiagnostics[0].interpretation.causalBridge.at(-1).support,'speculative');
  assert.equal(c.interpretation.causalBridge.at(-1).support,'established');return {decision:'reject',reasonZh:'关键因果过程仍然没有依据。'};
 }}})),e=>e.code==='INTERVENTION_REJECTED'&&e.reasonZh.includes('没有依据'));
 assert.equal(calls.filter(c=>c.options.stage==='world-initialization').length,0);
});
test('model year errors recover while preserving the explicit year; an impossible user year does not spend a model call',async()=>{
 let count=0;
 await assert.rejects(run(worldChat({overrides:{interpretation:c=>{
  if(++count===1)return admission(0);assert.equal(c.completionFeedback.code,'INVALID_YEAR');return admission(1024);
 },'world-initialization':c=>{assert.equal(c.year,1024);return stopAtGenesis(c)}}}),{prompt:'公元1024年制度改变'}),/ADMISSION_COMPLETE/);
 const calls=[];await assert.rejects(run(worldChat({calls}),{prompt:'公元0年制度改变'}),/INVALID_YEAR/);assert.equal(calls.length,0);
});
test('manual mode still asks for unresolved decisive conditions after a format repair',async()=>{
 let count=0;
 await assert.rejects(run(worldChat({overrides:{interpretation:()=>++count===1?{...admission(),operations:[]}:
  {...admission(),decision:'clarify',questions:[{zh:'何时发生？',en:'When?'}],criticalUnknowns:['date']}}}),{autoComplete:false}),e=>e.code==='INTERVENTION_CLARIFY'&&e.questions[0].zh==='何时发生？');
 assert.equal(count,2);
});
test('review schema errors retry only the review, not the interpreted intervention',async()=>{
 const calls=[];let reviews=0;
 await assert.rejects(run(worldChat({calls,overrides:{'intake-review':c=>{
  if(++reviews===1)return {};assert.equal(c.reviewFeedback.code,'INTAKE_INVALID');return {decision:'accept'};
 },'world-initialization':stopAtGenesis}})),/ADMISSION_COMPLETE/);
 assert.equal(calls.filter(c=>c.options.stage==='interpretation').length,1);assert.equal(reviews,2);
});
test('repeated malformed review has a bounded failure with the supplied review retained',async()=>{
 const calls=[];await assert.rejects(run(worldChat({calls,overrides:{'intake-review':()=>({unexpected:true})}})),e=>{
  assert.equal(e.code,'INTAKE_MODEL_INVALID');assert.equal(e.causeCode,'INTAKE_INVALID');assert.equal(e.intakeDiagnostics[0].reviews.length,2);return true;
 });assert.equal(calls.length,3);
});
test('missing admission enum fields trigger a format repair rather than a semantic rejection',async()=>{
 let count=0;
 await assert.rejects(run(worldChat({overrides:{interpretation:c=>{
  if(++count===1)return {operations:admission().operations};
  assert.equal(c.completionFeedback.code,'INTAKE_INVALID');return admission();
 },'world-initialization':stopAtGenesis}})),/ADMISSION_COMPLETE/);
 assert.equal(count,2);
});
test('a malformed unknown-conditions field cannot be silently treated as no missing information',async()=>{
 let reviews=0;
 await assert.rejects(run(worldChat({overrides:{'intake-review':()=>{reviews++;return {decision:'accept',criticalUnknowns:'distance'};}}})),e=>e.code==='INTAKE_MODEL_INVALID');
 assert.equal(reviews,2);
});
test('genuine parent fact edits remain intact and future facts cannot be invented at an earlier fork',async()=>{
 const parent={id:'parent',anchorYear:1900,titleEn:'Parent',events:[],facts:[{id:'fact:p',firstYear:1950,nameEn:'Policy',value:true}]};
 const candidate={...admission(1960),operations:[{...admission(1960).operations[0],kind:'branch_fact',parentFactId:'fact:p',target:'Policy',value:false}]};
 const resolved=await resolveIntervention({prompt:'公元1960年修改这一既有制度',branches:[parent],parentId:parent.id,parent,request:async(_method,c,stage)=>stage==='interpretation'?candidate:{decision:'accept'}});
 assert.equal(resolved.initial[0].parentFactId,'fact:p');assert.equal(resolved.initial[0].value,false);
 let count=0;
 await assert.rejects(resolveIntervention({prompt:'公元1920年修改这一既有制度',branches:[parent],parentId:parent.id,parent,request:async(_m,c,stage)=>{
  assert.equal(stage,'interpretation');if(++count===1)return {...candidate,operations:[{...candidate.operations[0],startYear:1920,endYear:1920}]};
  assert.equal(c.completionFeedback.code,'UNKNOWN_BRANCH_FACT');return {...admission(),decision:'reject',reasonZh:'该事实在指定年代尚未成立。'};
 }}),e=>e.code==='INTERVENTION_REJECTED');assert.equal(count,2);
});
test('successful repaired runs preserve boundaries, uncertainty and audit across evolution and archive reload',async()=>{
 let count=0;const calls=[];const raw=corrected();raw.operations[0].startYear=2020;raw.operations[0].endYear=2020;
 const invalid=clone(raw);invalid.operations.push({...captured.operations[1],startYear:2020,endYear:2020});
 const {worldline}=await run(worldChat({calls,overrides:{interpretation:()=>++count===1?invalid:raw}}),{prompt:'公元2020年一个制度不存在'});
 assert.equal(worldline.simulation.actions.length,1);assert.equal(worldline.simulation.admission.intakeDiagnostics.length,2);
 assert.ok(calls.filter(c=>['historical-window','world-initialization','synthesis'].includes(c.options.stage)).every(c=>c.context.preservedContext.length===1&&c.context.uncertaintyNotes.length===1));
 const restored=sanitizeWorldline(JSON.parse(JSON.stringify(worldline)));
 assert.deepEqual(restored.simulation.admission.intakeDiagnostics,worldline.simulation.admission.intakeDiagnostics);
 assert.deepEqual(restored.simulation.admission.preservedContext,raw.preservedContext);
});
test('diagnostic details are safely escaped and preserve the actionable error code',()=>{
 const html=renderIntakeDiagnostics([{validation:'UNKNOWN_BRANCH_FACT',interpretation:{reasonZh:'<img src=x onerror=alert(1)>'}}],'zh');
 assert.match(html,/UNKNOWN_BRANCH_FACT/);assert.match(html,/查看检查详情/);assert.doesNotMatch(html,/<img/);assert.match(html,/&lt;img/);
 assert.equal(renderIntakeDiagnostics([]),'');
});
test('cancellation during recovery stops before another request',async()=>{
 const ac=new AbortController();const calls=[];
 await assert.rejects(run(worldChat({calls,overrides:{interpretation:()=>{ac.abort();return clone(captured)}}}),{signal:ac.signal}),e=>e.name==='AbortError');
 assert.equal(calls.length,1);
});
