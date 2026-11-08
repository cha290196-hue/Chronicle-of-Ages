import {admitIntervention,calendarYears,InterventionDecision,completionPolicy} from './historical-intent.mjs';
import {resolveAncestry,compileInterventions,validYear,tick,LAST_YEAR,MatrixError} from './worldline-contract.mjs';
import {validateMacro,structuralIssues,assembleMacro,materializePeriods,applyMacroEdits,buildMinuteWorld,CHECKPOINTS,REGIONS,DOMAINS,checkpointYears} from './minute-world.mjs';
import {MINUTE_SYSTEM,MINUTE_DRAFT,MINUTE_REVIEW} from './minute-prompts.mjs';
const list=x=>Array.isArray(x)?x:[];
const abort=()=>new DOMException('Aborted','AbortError');
const clip=(x,n)=>String(x??'').trim().slice(0,n);
const checksPass=x=>x===undefined||['premise','causality','world','time','setting'].every(k=>x?.[k]===true);
function rootsFor(branches,ancestry,year){return [...new Map(branches.filter(b=>ancestry.includes(b.id)).flatMap(b=>[...list(b.simulation?.genesis?.conditions),...list(b.simulation?.actions)]).filter(r=>validYear(r.year??r.firstYear??r.startYear)&&tick(r.year??r.firstYear??r.startYear)<tick(year)).map(r=>[r.id,r])).values()];}

/** Official DeepSeek fast synthesis + stronger short audit; other endpoints retain their model. */
export function minuteModelConfig(config,stage){
 let official=false;try{official=config?.provider==='deepseek'&&new URL(config.endpoint).hostname==='api.deepseek.com';}catch{}
 return official?{...config,model:stage==='minute-world'?'deepseek-flash':'deepseek-v4-pro'}:config;
}

/** Whole-horizon causal synthesis + bounded independent review. No per-window model loop. */
export async function simulateMinute({prompt,branches=[],parentId=null,config,callChat,makeId,lang='en',autoComplete=false,clarifications=[],signal,onProgress=()=>{},budgetMs=62000,now=()=>Date.now()}){
 if(typeof callChat!=='function'||typeof makeId!=='function')throw new MatrixError('CHAT_ADAPTER_REQUIRED');
 prompt=clip(prompt,2000);if(!prompt)throw new MatrixError('EMPTY_PROMPT');
 if(signal?.aborted)throw abort();
 const parent=parentId===null?null:branches.find(b=>b.id===parentId);if(parentId&&!parent)throw new MatrixError('PARENT_NOT_FOUND');
 const answers=list(clarifications).filter(a=>a?.answer?.trim()).map(a=>({question:clip(a.question,1000),answer:clip(a.answer,1600)}));
 const constrained=calendarYears(prompt).length?prompt:[prompt,...answers.map(a=>a.answer)].join('\n');
 if(calendarYears(constrained).some(y=>!validYear(y)))throw new InterventionDecision('INVALID_YEAR');
 const start=now(),limit=Math.min(65000,Math.max(1000,budgetMs)),deadline=start+limit,runId=makeId(),requests=[];
 const control=new AbortController();let expired=false,stage='minute-world',lastProgress={phase:'propagation',stage,engine:'minute',index:0,total:1};
 const cancel=()=>control.abort();signal?.addEventListener('abort',cancel,{once:true});
 const timeout=setTimeout(()=>{expired=true;control.abort();},limit);
 const emit=()=>onProgress({...lastProgress,elapsedMs:Math.max(0,now()-start),targetMs:60000,deadlineMs:limit});
 const ticker=setInterval(emit,1000);
 async function ask(method,context,name,maxTokens,reasoning){
  if(control.signal.aborted)throw expired?new MatrixError('MINUTE_DEADLINE'):abort();
  stage=name;lastProgress={phase:name==='minute-world'?'propagation':'synthesis',stage:name,engine:'minute',index:name==='minute-world'?0:1,total:2};emit();
  const t=now();
  let cancelPending;
  const interrupted=new Promise((_,reject)=>{cancelPending=()=>reject(expired?new MatrixError('MINUTE_DEADLINE'):abort());control.signal.addEventListener('abort',cancelPending,{once:true});});
  try{return await Promise.race([interrupted,callChat(minuteModelConfig(config,name),[{role:'system',content:MINUTE_SYSTEM},{role:'user',content:method+'\nCONTEXT JSON:\n'+JSON.stringify(context)}],
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
  const envelope=await ask(MINUTE_DRAFT+'\n'+completionPolicy(!!autoComplete),context,'minute-world',7600,false);
  const assessment=envelope?.admission;
  if(!autoComplete&&list(assessment?.completions).length)throw new InterventionDecision('INTERVENTION_CLARIFY',{questions:assessment.completions.map(n=>({en:'How should this condition be set?',zh:'这一条件应当如何设定？',options:[{en:n.en||n.zh,zh:n.zh||n.en}]}))});
  const parentFacts=parent?[...list(parent.inherited?.facts),...list(parent.facts),...list(parent.knowledge)]:[];
  const compiled=admitIntervention(assessment,{prompt:constrained,parentAnchor:parent?.anchorYear??null,parentFacts,parentEvidence:parentRecords});
  const firstYear=compiled.reduce((a,b)=>tick(a)<tick(b.startYear)?a:b.startYear,compiled[0].startYear);
  const lineage=resolveAncestry({baseline:[],branches,parentId,atYear:firstYear});
  compileInterventions(assessment,{parentAnchor:parent?.anchorYear??null,parentFacts:lineage.facts});
  const inherited={...lineage,events:[...rootsFor(branches,lineage.ancestry,firstYear),...lineage.events]};
  const actions=compiled.map((a,i)=>({...a,id:'intervention:'+(i+1),assumptions:[...a.assumptions,...list(assessment.completions).map(n=>n.en||n.zh)]}));
  let raw=materializePeriods(assembleMacro(envelope.world,firstYear),firstYear),checked,structural=null;
  try{checked=validateMacro(raw,{firstYear,actions,inherited});}catch(e){structural=[{code:e.code,detail:e.diagnostic},...structuralIssues(raw,firstYear)];}
  // Review and targeted repair share one short call; no repeated whole-world generation.
  if(now()>deadline-1200)throw new MatrixError('MINUTE_DEADLINE');
  const review=await ask(MINUTE_REVIEW,{...context,admission:assessment,world:raw,structuralChecks:structural||'pass',forkYear:firstYear,requiredCheckpointYears:checkpointYears(firstYear),coverage:{independent:checked?.ordered.filter(e=>!checked.descends.get(e.id)).map(e=>e.id)||[],eventDomains:[...new Set(list(raw?.events).map(e=>e.k))]},
   inheritedEvidence:inherited.events.concat(inherited.facts).map(r=>({id:r.id,year:r.year??r.firstYear??r.startYear,title:r.en||r.nameEn}))},'minute-review',2800,false);
  if(review?.verdict==='clarify')throw new InterventionDecision(autoComplete?'MINUTE_REVIEW_REJECTED':'INTERVENTION_CLARIFY',{reasonEn:lang==='en'?review.reason:'',reasonZh:lang==='zh'?review.reason:'',questions:list(review.questions)});
  if(!review||!['pass','repair','reject'].includes(review.verdict))throw new MatrixError('MINUTE_REVIEW_INVALID');
  if(review.verdict==='reject'||!checksPass(review.checks))throw Object.assign(new MatrixError('MINUTE_REVIEW_REJECTED'),{reason:clip(review.reason,700)});
  if(review.verdict==='pass'&&(structural||list(review.issues).length))throw new MatrixError('MINUTE_REVIEW_INVALID');
  if(review.verdict==='repair'){
   const edits=review.edits,changed=new Set([...list(edits?.events),...list(edits?.conditions)].map(r=>r.id).concat(list(edits?.drop)));
   for(const key of ['setting','regions','quietPeriods','trajectories','title','summary'])if(edits?.[key])changed.add(key);
   for(const key of Object.keys(edits?.setting||{}))changed.add(key);
   for(const r of list(edits?.regions))changed.add(r.r);
   if(!edits||(!changed.size&&!['regions','quietPeriods','trajectories','setting','title','summary'].some(k=>edits[k]))||list(review.issues).some(issue=>issue.id&&!changed.has(issue.id)))throw new MatrixError('MINUTE_REVIEW_INVALID','Unresolved issue or empty repair');
   raw=materializePeriods(assembleMacro(applyMacroEdits(raw,edits),firstYear),firstYear);
  }
  checked=validateMacro(raw,{firstYear,actions,inherited});
  if(control.signal.aborted||now()>deadline)throw expired||now()>deadline?new MatrixError('MINUTE_DEADLINE'):abort();
  const elapsedMs=Math.max(0,now()-start);
  const worldline=buildMinuteWorld({raw,checked,assessment,actions,inherited,firstYear,parentId,prompt,lang,runId,review,
   timing:{elapsedMs,budgetMs:limit,targetMs:60000,requests,autoComplete:!!autoComplete,completed:true}});
  return {worldline,analysis:worldline.simulation};
 }catch(e){
  if(expired||(!signal?.aborted&&control.signal.aborted)||now()>deadline)throw new MatrixError('MINUTE_DEADLINE');
  if(signal?.aborted)throw abort();
  if(e&&typeof e==='object')e.minuteDiagnostics={stage,elapsedMs:Math.max(0,now()-start),requests};
  throw e;
 }finally{clearInterval(ticker);clearTimeout(timeout);signal?.removeEventListener('abort',cancel);}
}
