import {admitIntervention,calendarYears,InterventionDecision,completionPolicy} from './historical-intent.mjs';
import {resolveAncestry,compileInterventions,validYear,tick,LAST_YEAR,MatrixError} from './worldline-contract.mjs';
import {validateMacro,reindexTrajectories,structuralIssues,assembleMacro,materializePeriods,applyMacroEdits,buildMinuteWorld,CHECKPOINTS,REGIONS,DOMAINS,checkpointYears} from './minute-world.mjs';
import {MINUTE_SYSTEM,MINUTE_DRAFT,MINUTE_REVIEW,MINUTE_AUDIT_SYSTEM} from './minute-prompts.mjs';
import {INFERENCE_BUDGET} from './inference-budget.mjs';
import {inferenceModelConfig} from './model-routing.mjs';
import {MINUTE_WORLD_SCHEMA,MINUTE_AUDIT_SCHEMA,strictMinuteRequest} from './minute-output-schema.mjs';
const list=x=>Array.isArray(x)?x:[];
const abort=()=>new DOMException('Aborted','AbortError');
const clip=(x,n)=>String(x??'').trim().slice(0,n);
const checksPass=x=>x===undefined||['premise','causality','world','time','setting'].every(k=>x?.[k]===true);
const GRAPH_CORRECTION=`Correct the supplied chronological/ID defects in this SAME candidate. Return the audit object defined by OUTPUT JSON SCHEMA, with verdict repair or reject, actionable issues, optional uncertainty notes, and only necessary event field patches in edits.events. For each affected event, EVERY c ID MUST be in its eligibleEvidence list. The explicitly invalid cause is FORBIDDEN, including when it sounds related. Keep valid existing causes when sufficient; otherwise select a genuinely relevant earlier supplied cause and correct the explanation. Dates are authoritative. Do not move dates, invent causes, delete events, shorten prose, retransmit unchanged records, or regenerate the world. Reject if no defensible correction exists.`;
function focusedGraphContext(raw,structural,actions,firstYear){
 const faults=list(structural).filter(x=>['FUTURE_CAUSE','UNKNOWN_CAUSE'].includes(x.code));
 if(!faults.length||list(structural).some(x=>!['FUTURE_CAUSE','UNKNOWN_CAUSE','MINUTE_FUTURE_CAUSE','MINUTE_UNKNOWN_CAUSE'].includes(x.code)))return null;
 return {forkYear:firstYear,interventions:actions,defects:faults.map(f=>({...f,event:list(raw.events).find(e=>e.id===f.id),forbiddenCause:f.cause,allowedCauseIds:f.eligibleEvidence.map(p=>p.id)}))};
}

function rootsFor(branches,ancestry,year){return [...new Map(branches.filter(b=>ancestry.includes(b.id)).flatMap(b=>[...list(b.simulation?.genesis?.conditions),...list(b.simulation?.actions)]).filter(r=>validYear(r.year??r.firstYear??r.startYear)&&tick(r.year??r.firstYear??r.startYear)<tick(year)).map(r=>[r.id,r])).values()];}

/** All inference stages share the Flash route; custom endpoints retain their chosen model. */
export const minuteModelConfig=inferenceModelConfig;

/** Whole-horizon causal synthesis + bounded independent review. No per-window model loop. */
export async function simulateMinute({prompt,branches=[],parentId=null,config,callChat,makeId,lang='en',autoComplete=false,clarifications=[],signal,onProgress=()=>{},budgetMs=INFERENCE_BUDGET.deadlineMs,now=()=>Date.now()}){
 if(typeof callChat!=='function'||typeof makeId!=='function')throw new MatrixError('CHAT_ADAPTER_REQUIRED');
 prompt=clip(prompt,2000);if(!prompt)throw new MatrixError('EMPTY_PROMPT');
 if(signal?.aborted)throw abort();
 const parent=parentId===null?null:branches.find(b=>b.id===parentId);if(parentId&&!parent)throw new MatrixError('PARENT_NOT_FOUND');
 const answers=list(clarifications).filter(a=>a?.answer?.trim()).map(a=>({question:clip(a.question,1000),answer:clip(a.answer,1600)}));
 const constrained=calendarYears(prompt).length?prompt:[prompt,...answers.map(a=>a.answer)].join('\n');
 if(calendarYears(constrained).some(y=>!validYear(y)))throw new InterventionDecision('INVALID_YEAR');
 const start=now(),limit=Math.min(INFERENCE_BUDGET.deadlineMs,Math.max(1000,Number.isFinite(budgetMs)?budgetMs:INFERENCE_BUDGET.deadlineMs)),deadline=start+limit,runId=makeId(),requests=[];
 const control=new AbortController();let expired=false,stage='minute-world',lastProgress={phase:'propagation',stage,engine:'minute',index:0,total:1};
 const cancel=()=>control.abort();signal?.addEventListener('abort',cancel,{once:true});
 const timeout=setTimeout(()=>{expired=true;control.abort();},limit);
 const emit=()=>onProgress({...lastProgress,elapsedMs:Math.max(0,now()-start),targetMs:INFERENCE_BUDGET.deadlineMs,deadlineMs:limit});
 const ticker=setInterval(emit,1000);
 async function ask(method,context,name,maxTokens,reasoning){
  if(control.signal.aborted)throw expired?new MatrixError('MINUTE_DEADLINE'):abort();
  stage=name;lastProgress={phase:name==='minute-world'?'propagation':'synthesis',stage:name,engine:'minute',index:name==='minute-world'?0:name==='minute-review'?1:2,total:name==='minute-repair'?3:2};emit();
  const t=now();
  let cancelPending;
  const interrupted=new Promise((_,reject)=>{cancelPending=()=>reject(expired?new MatrixError('MINUTE_DEADLINE'):abort());control.signal.addEventListener('abort',cancelPending,{once:true});});
  const outputSchema=name==='minute-world'?MINUTE_WORLD_SCHEMA:MINUTE_AUDIT_SCHEMA;
  const requestConfig=minuteModelConfig(config,name);
  const formatInstruction=strictMinuteRequest(requestConfig,name)?'\nUse the supplied output tool parameters as OUTPUT JSON SCHEMA.':'\nOUTPUT JSON SCHEMA:\n'+JSON.stringify(outputSchema);
  try{return await Promise.race([interrupted,callChat(requestConfig,[{role:'system',content:name==='minute-world'?MINUTE_SYSTEM:MINUTE_AUDIT_SYSTEM},{role:'user',content:method+formatInstruction+'\nCONTEXT JSON:\n'+JSON.stringify(context)}],
   {signal:control.signal,json:true,temperature:.2,maxTokens,purpose:'simulation',stage:name,reasoning,profile:'minute'})]);}
  finally{control.signal.removeEventListener('abort',cancelPending);requests.push({stage:name,elapsedMs:Math.max(0,now()-t),maxTokens,reasoning:!!reasoning});}
 
 }
 try{
  const parentRecords=parent?[...list(parent.inherited?.events),...list(parent.events),...list(parent.inherited?.facts),...list(parent.facts),...list(parent.knowledge)]:[];
  const hint=calendarYears(constrained).length===1?calendarYears(constrained)[0]:LAST_YEAR;
  if(parent&&tick(hint)<tick(parent.anchorYear))throw new MatrixError('ANCHOR_PRECEDES_PARENT');
  const history=parentRecords.filter(r=>validYear(r.year??r.firstYear)&&tick(r.year??r.firstYear)<=tick(hint)).map(r=>({id:r.id,year:r.year??r.firstYear,title:clip(r.en||r.nameEn,120),description:clip(r.descriptionEn||r.descriptionZh,230),causes:list(r.causes),value:r.value}));
  const context={input:prompt,language:lang,inputPolicy:{autoComplete:!!autoComplete},clarifications:answers,checkpointCandidates:CHECKPOINTS,regions:REGIONS,domains:DOMAINS,
   selectedWorld:parent?{id:parent.id,anchorYear:parent.anchorYear,title:parent.titleEn,history,initialConditions:list(parent.simulation?.genesis?.conditions),interventions:list(parent.simulation?.actions)}:null};
  const envelope=await ask(MINUTE_DRAFT+'\n'+completionPolicy(!!autoComplete),context,'minute-world',INFERENCE_BUDGET.generationTokens,false);
  const assessment=envelope?.admission;
  if(!autoComplete&&list(assessment?.completions).length)throw new InterventionDecision('INTERVENTION_CLARIFY',{questions:assessment.completions.map(n=>({en:'How should this condition be set?',zh:'这一条件应当如何设定？',options:[{en:n.en||n.zh,zh:n.zh||n.en}]}))});
  const parentFacts=parent?[...list(parent.inherited?.facts),...list(parent.facts),...list(parent.knowledge)]:[];
  const compiled=admitIntervention(assessment,{prompt:constrained,parentAnchor:parent?.anchorYear??null,parentFacts,parentEvidence:parentRecords});
  const firstYear=compiled.reduce((a,b)=>tick(a)<tick(b.startYear)?a:b.startYear,compiled[0].startYear);
  const lineage=resolveAncestry({baseline:[],branches,parentId,atYear:firstYear});
  compileInterventions(assessment,{parentAnchor:parent?.anchorYear??null,parentFacts:lineage.facts});
  const inherited={...lineage,events:[...rootsFor(branches,lineage.ancestry,firstYear),...lineage.events]};
  const actions=compiled.map((a,i)=>({...a,id:'intervention:'+(i+1),assumptions:[...a.assumptions,...list(assessment.completions).map(n=>n.en||n.zh)]}));
  let raw=reindexTrajectories(materializePeriods(assembleMacro(envelope.world,firstYear),firstYear),actions,inherited),checked,structural=null;
  try{checked=validateMacro(raw,{firstYear,actions,inherited,requireRegionalDomains:true});}catch(e){structural=[{code:e.code,detail:e.diagnostic},...structuralIssues(raw,firstYear,actions,inherited)];}
  if(structural&&now()<deadline-8000){
   const graphContext=focusedGraphContext(raw,structural,actions,firstYear);
   const patch=await ask(graphContext?GRAPH_CORRECTION:`Repair only the supplied concrete mechanical defects in this SAME world. Follow OUTPUT JSON SCHEMA with verdict repair or reject, and only necessary event, condition, regional, quiet-period or trajectory patches. Existing records use FIELD PATCHES, not full replacements. Use null or empty patch lists for unchanged fields. Do not generate a second history, remove substantive events, shorten prose, or change unchanged fields. Future/missing causes must use defensible temporally eligible evidence supplied for the affected event, with a matching causal explanation. Never move an event's date merely to evade a future cause. Reject if no supported correction exists.`,
    graphContext||{forkYear:firstYear,interventions:actions,defects:structural,events:list(raw?.events),conditions:raw?.conditions,trajectories:raw?.trajectories,regions:raw?.regions},'minute-graph-repair',INFERENCE_BUDGET.reviewTokens,false);
   if(patch?.verdict!=='repair'||!patch.edits)throw new MatrixError('MINUTE_REVIEW_REJECTED','No defensible structural correction');
   raw=reindexTrajectories(materializePeriods(assembleMacro(applyMacroEdits(raw,patch.edits),firstYear),firstYear),actions,inherited);
   try{checked=validateMacro(raw,{firstYear,actions,inherited,requireRegionalDomains:true});structural=null;}catch(e){structural=[{code:e.code,detail:e.diagnostic},...structuralIssues(raw,firstYear,actions,inherited)];}
  }
  // Audit and necessary field corrections share the deadline; the complete history is never regenerated.
  if(now()>deadline-1200)throw new MatrixError('MINUTE_DEADLINE');
  const reviewContext={...context,admission:assessment,interventions:actions,recordYears:[...actions,...list(raw?.conditions),...list(raw?.events),...inherited.events,...inherited.facts].map(r=>({id:r.id,year:r.y??r.year??r.firstYear??r.startYear})),world:raw,structuralChecks:structural||'pass',forkYear:firstYear,requiredCheckpointYears:checkpointYears(firstYear),coverage:{independent:checked?.ordered.filter(e=>!checked.descends.get(e.id)).map(e=>e.id)||[],eventDomains:[...new Set(list(raw?.events).map(e=>e.k))]},
   inheritedEvidence:inherited.events.concat(inherited.facts).map(r=>({id:r.id,year:r.year??r.firstYear??r.startYear,title:r.en||r.nameEn}))};
  let review,accepted=false,previousReview=null,repairFailure=null;
  for(let attempt=0;attempt<2;attempt++){
   if(attempt&&now()>deadline-5000)throw repairFailure;
   try{
    const graphContext=attempt&&focusedGraphContext(raw,structural,actions,firstYear);
    review=await ask(graphContext?GRAPH_CORRECTION:MINUTE_REVIEW+(attempt?'\nCORRECTION: The preceding audit/edits failed. Resolve the supplied concrete defects in ONE valid JSON object, including complete necessary edits. Preserve all substantive history. Omit unused keys rather than serializing empty placeholders.':''),
     graphContext||{...reviewContext,world:raw,recordYears:[...actions,...list(raw?.conditions),...list(raw?.events),...inherited.events,...inherited.facts].map(r=>({id:r.id,year:r.y??r.year??r.firstYear??r.startYear})),structuralChecks:structural||'pass',previousReview},attempt?'minute-repair':'minute-review',INFERENCE_BUDGET.reviewTokens,false);
    if(graphContext&&previousReview?.notes)review={...review,notes:[...new Set([...previousReview.notes,...list(review.notes)])]};
    previousReview=review;
    if(review?.verdict==='clarify')throw new InterventionDecision(autoComplete?'MINUTE_REVIEW_REJECTED':'INTERVENTION_CLARIFY',{reasonEn:lang==='en'?review.reason:'',reasonZh:lang==='zh'?review.reason:'',questions:list(review.questions)});
    if(review?.verdict==='reject'||(review&&!checksPass(review.checks)))throw Object.assign(new MatrixError('MINUTE_REVIEW_REJECTED'),{reason:clip(review.reason,700)});
    if(!review||!['pass','repair'].includes(review.verdict))throw new MatrixError('MINUTE_REVIEW_INVALID');
    if(review.verdict==='pass'&&(structural||list(review.issues).length))throw new MatrixError('MINUTE_REVIEW_INVALID');
    if(review.verdict==='repair'){
     const edits=review.edits,changed=new Set([...list(edits?.events),...list(edits?.conditions)].map(r=>r.id).concat(list(edits?.drop),list(edits?.text).map(p=>p.id||p.r||p.field)));
     for(const key of ['setting','regions','quietPeriods','trajectories','title','summary'])if(edits?.[key])changed.add(key);
     if(!edits||!changed.size)throw new MatrixError('MINUTE_REVIEW_INVALID','Empty repair');
     raw=reindexTrajectories(materializePeriods(assembleMacro(applyMacroEdits(raw,edits),firstYear),firstYear),actions,inherited);
    }
    checked=validateMacro(raw,{firstYear,actions,inherited,requireRegionalDomains:true});accepted=true;break;
   }catch(e){
    if(control.signal.aborted||signal?.aborted||e.code==='INTERVENTION_CLARIFY'||e.code==='MINUTE_REVIEW_REJECTED'||e.status)throw e;
    repairFailure=e;structural=[{code:e.code||e.message,detail:e.diagnostic},...structuralIssues(raw,firstYear,actions,inherited)];
    if(attempt)throw e;
   }
  }
  if(!accepted)throw repairFailure||new MatrixError('MINUTE_REVIEW_INVALID');
  if(control.signal.aborted||now()>deadline)throw expired||now()>deadline?new MatrixError('MINUTE_DEADLINE'):abort();
  const elapsedMs=Math.max(0,now()-start);
  const worldline=buildMinuteWorld({raw,checked,assessment,actions,inherited,firstYear,parentId,prompt,lang,runId,review,
   timing:{elapsedMs,budgetMs:limit,targetMs:INFERENCE_BUDGET.deadlineMs,requests,autoComplete:!!autoComplete,completed:true}});
  return {worldline,analysis:worldline.simulation};
 }catch(e){
  if(expired||(!signal?.aborted&&control.signal.aborted)||now()>deadline)throw new MatrixError('MINUTE_DEADLINE');
  if(signal?.aborted)throw abort();
  if(e&&typeof e==='object')e.minuteDiagnostics={stage,elapsedMs:Math.max(0,now()-start),requests};
  throw e;
 }finally{clearInterval(ticker);clearTimeout(timeout);signal?.removeEventListener('abort',cancel);}
}
