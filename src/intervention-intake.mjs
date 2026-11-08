import {compileInterventions,resolveAncestry,validYear,MatrixError,tick} from './ucm-omega.mjs';
import {admitIntervention,INTAKE_METHOD,InterventionDecision,completionPolicy,calendarYears} from './historical-intent.mjs';

const list=x=>Array.isArray(x)?x:[];
const clip=(x,n=1600)=>String(x??'').trim().slice(0,n);
const copy=x=>JSON.parse(JSON.stringify(x));
const notes=x=>list(x).filter(n=>n&&clip(typeof n==='string'?n:n.en||n.zh)).map(n=>typeof n==='string'?{en:clip(n),zh:clip(n)}:{en:clip(n.en||n.zh),zh:clip(n.zh||n.en)});
const MODEL_ERRORS=new Set(['INTAKE_INVALID','EMPTY_OR_EXCESSIVE_INTERVENTION','UNKNOWN_INTERVENTION_KIND','INVALID_YEAR','INVALID_TIME_RANGE','INVALID_TIME_MODE','MISSING_TARGET','UNKNOWN_BRANCH_FACT','UNKNOWN_BRANCH_FACT_AT_ANCHOR','CONTRADICTORY_INTERVENTIONS','EXPLICIT_YEAR_MISMATCH']);
const REPAIR=`REPRESENTATION REPAIR: The prior interpretation failed a program check. Return a complete corrected admission using the same original input, explicit answers and completion policy. Repair representation only: separate unchanged background into preservedContext and non-causal caution into uncertaintyNotes. Never silently discard an explicit requested change, switch its meaning, change an explicit date, invent a parent fact, or add evidence. An actual speculative necessary mechanism cannot be rescued by changing its support label or deleting the necessary link; return reject if no defensible initial bridge exists. If decisive information is truly missing with completion off, return clarify. Keep valid chosen defaults stable when repairing unrelated fields. Explain what was corrected in reasonEn/reasonZh.`;
const REVIEW=`Independently review this admission against the original input, explicit answers and completion policy. Check materiality and defensible Earth mechanisms. Operations must contain only imposed changes. Retained people/background are initial boundaries, not extra edits or promises that they survive forever. branch_fact requires a genuine requested change to a supplied fact effective at the fork. CausalBridge contains only the first defensible connection to material history; ordinary uncertainty about later simulation is not an unsupported initial mechanism and belongs in uncertaintyNotes. A real unsupported mechanism remains a reason to reject.
Inspect intakeDiagnostics, including any prior failed interpretations. Confirm each repair preserves ALL explicit user constraints and valid initial assumptions. Reject a repair that hides an essential unsupported link, merely upgrades its support label without evidence, invents a missing fact reference, or drops an actual requested change. Relocating a genuinely non-causal disclaimer is allowed. With completion on, ordinary recorded initial defaults are authorized; with completion off, do not supply missing decisive parameters and ask only unresolved questions.
Return JSON {decision:"accept|clarify|reject",reasonEn:string,reasonZh:string,questions:[{en:string,zh:string,options:[{en:string,zh:string}]}],criticalUnknowns:[string]}.`;

function canRepair(error,interpretation){
 if(error.code==='INTAKE_INVALID'&&!['reject','clarify'].includes(interpretation?.decision))return true;
 if(interpretation?.decision!=='accept')return false;
 if(MODEL_ERRORS.has(error.code))return true;
 // A wholly unsupported bridge is a substantive refusal, not a format retry.
 return error.code==='UNSUPPORTED_CAUSAL_BRIDGE'&&list(interpretation.causalBridge).slice(1)
  .some(p=>['established','branch-supported'].includes(p.support));
}
function modelFailure(code,diagnostics){
 return Object.assign(new MatrixError('INTAKE_MODEL_INVALID',code),{causeCode:code,intakeDiagnostics:copy(diagnostics),phase:'validation'});
}

/** One bounded intake pipeline for both completion modes. Never fixes semantics by deleting records locally. */
export async function resolveIntervention({prompt,branches=[],parentId=null,parent=null,autoComplete=false,clarifications=[],request}){
 const answers=list(clarifications).filter(a=>a&&typeof a.answer==='string'&&a.answer.trim())
  .map(a=>({question:clip(a.question,1000),answer:clip(a.answer)}));
 const constraintPrompt=calendarYears(prompt).length?prompt:[prompt,...answers.map(a=>a.answer)].join('\n');
 if(calendarYears(constraintPrompt).some(y=>!validYear(y)))throw new InterventionDecision('INVALID_YEAR');
 const parentFacts=parent?[...list(parent.inherited?.facts),...list(parent.facts),...list(parent.knowledge)]:[];
 const policy=completionPolicy(!!autoComplete),diagnostics=[];
 const context={input:prompt,clarifications:answers,inputPolicy:{autoComplete:!!autoComplete},
  selectedWorld:parent?{anchorYear:parent.anchorYear,title:parent.titleEn,facts:parentFacts}:null};
 let feedback=null;
 for(let attempt=0;attempt<3;attempt++){
  const interpretation=await request(INTAKE_METHOD+'\n'+policy+(feedback?.kind==='representation-repair'?'\n'+REPAIR:''),
   {...context,completionFeedback:feedback,intakeDiagnostics:diagnostics.map(d=>({attempt:d.attempt,validation:d.validation}))},'interpretation',5000);
  const entry={attempt:attempt+1,interpretation:copy(interpretation),validation:null,reviews:[]};diagnostics.push(entry);
  if(!autoComplete&&list(interpretation.completions).length)
   throw Object.assign(new InterventionDecision('INTERVENTION_CLARIFY',{questions:interpretation.completions.map(n=>({
    en:'How should this condition be defined?',zh:'这一条件应当如何设定？',options:[{en:clip(n.en||n.zh),zh:clip(n.zh||n.en)}]
   }))}),{intakeDiagnostics:copy(diagnostics)});
  let actions,firstYear,inherited;
  try{
   actions=admitIntervention(interpretation,{prompt:constraintPrompt,parentAnchor:parent?.anchorYear??null,parentFacts});
   firstYear=actions.reduce((a,b)=>tick(a)<tick(b.startYear)?a:b.startYear,actions[0].startYear);
   inherited=resolveAncestry({baseline:[],branches,parentId,atYear:firstYear});
   compileInterventions(interpretation,{parentAnchor:parent?.anchorYear??null,parentFacts:inherited.facts});
   entry.validation='pass';
  }catch(error){
   entry.validation=error.code||error.name;
   if(error.code==='INTERVENTION_CLARIFY'&&autoComplete){
    feedback={kind:'missing-conditions',missing:interpretation.criticalUnknowns,questions:interpretation.questions,
     instruction:'Resolve omissions with ordinary initial defaults; return the complete interpretation, not questions.'};
    if(attempt<2)continue;
    throw Object.assign(new InterventionDecision('AUTOCOMPLETE_INCOMPLETE'),{intakeDiagnostics:copy(diagnostics)});
   }
   if(canRepair(error,interpretation)){
    if(attempt===2)throw modelFailure(error.code,diagnostics);
    feedback={kind:'representation-repair',code:error.code,previousInterpretation:copy(interpretation),instruction:REPAIR};continue;
   }
   error.intakeDiagnostics=copy(diagnostics);throw error;
  }
  let checked;
  for(let reviewAttempt=0;reviewAttempt<2;reviewAttempt++){
   checked=await request(REVIEW+'\n'+policy,{...context,interpretation,intakeDiagnostics:copy(diagnostics.slice(0,-1)),
    ...(reviewAttempt?{reviewFeedback:{code:'INTAKE_INVALID',previousReview:checked,instruction:'Return the required review decision schema without changing the supplied intervention.'}}:{})},'intake-review',3500);
   entry.reviews.push(copy(checked));
   if(['accept','clarify','reject'].includes(checked?.decision)&&
    (checked.criticalUnknowns===undefined||Array.isArray(checked.criticalUnknowns))&&
    (checked.questions===undefined||Array.isArray(checked.questions)))break;
   if(reviewAttempt===1)throw modelFailure('INTAKE_INVALID',diagnostics);
  }
  if(checked.decision!=='accept'||list(checked.criticalUnknowns).length){
   const error=new InterventionDecision(checked.decision==='reject'?'INTERVENTION_REJECTED':'INTERVENTION_CLARIFY',
    checked.decision==='accept'?{...checked,reasonEn:'',reasonZh:''}:checked);
   if(autoComplete&&error.code==='INTERVENTION_CLARIFY'){
    feedback={kind:'missing-conditions',...checked};if(attempt<2)continue;
    throw Object.assign(new InterventionDecision('AUTOCOMPLETE_INCOMPLETE'),{intakeDiagnostics:copy(diagnostics)});
   }
   error.intakeDiagnostics=copy(diagnostics);throw error;
  }
  const completions=autoComplete?list(interpretation.completions).filter(n=>n&&clip(n.en||n.zh)).map(n=>({field:clip(n.field,120),en:clip(n.en||n.zh,1000),zh:clip(n.zh||n.en,1000)})):[];
  return {interpretation,initial:actions,firstYear,inherited,completions,answers,preservedContext:notes(interpretation.preservedContext),
   uncertaintyNotes:notes(interpretation.uncertaintyNotes),intakeDiagnostics:diagnostics};
 }
}
