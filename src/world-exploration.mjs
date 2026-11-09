import {auditKnowledge,sanitizeKnowledge} from './exploration-knowledge.mjs';
import {causalContext,REGIONS,DOMAINS} from './world-model.mjs';
import {validYear,tick,LAST_YEAR,MatrixError} from './worldline-contract.mjs';
import {inferenceModelConfig} from './model-routing.mjs';
import {CORE_SYSTEM,CORE_PLAN,CORE_INFERENCE,CORE_COMPLETION,CORE_REVIEW,CORE_ANSWER,resolveComparison,rankingFact,renderRanking,renderQuantities} from './core-resolution.mjs';
const list=x=>Array.isArray(x)?x:[];
const text=x=>String(x??'').trim();
const unique=rows=>[...new Map(rows.map(r=>[r.id,r])).values()];
function compactRecord(r,lang){
 const local=(en,zh)=>lang==='zh'?(zh||en):(en||zh);
 return {id:r.id,year:r.year??r.startYear,firstYear:r.firstYear,validUntil:r.validUntil,title:local(r.en||r.nameEn||r.target||r.t,r.zh||r.nameZh||r.target||r.t),description:local(r.descriptionEn||r.description,r.descriptionZh||r.description),kind:r.kind||r.domain,regions:r.impact?.regions||r.regions||[r.region].filter(Boolean),entity:r.entity,attribute:r.attribute,value:r.value,quantity:r.quantity,calculation:r.calculation,ranking:r.ranking,commitment:r.commitment,basis:r.basis,evidenceIds:[...new Set([...list(r.causes),...list(r.evidenceIds),...list(r.requires)])]};
}
function patchProjection(prior,patch){
 if(patch?.verdict==='reject')throw new MatrixError('EXPLORATION_WORLD_CONFLICT',text(patch.reason));
 if(patch?.verdict!=='repair'||!patch.edits)throw new MatrixError('EXPLORATION_RESPONSE_INVALID');
 const next=structuredClone(prior),edits=patch.edits,byId=new Map(list(next.newFacts).map(f=>[f.id,f]));
 for(const f of list(edits.facts)){if(!byId.has(f.id))throw new MatrixError('EXPLORATION_RESPONSE_INVALID');const fields=Object.fromEntries(Object.entries(f).filter(([,v])=>v!==null&&v!==undefined));byId.set(f.id,{...byId.get(f.id),...fields});}
 for(const f of list(edits.newFacts)){if(!f.id||byId.has(f.id))throw new MatrixError('EXPLORATION_RESPONSE_INVALID');byId.set(f.id,f);}
 next.newFacts=[...byId.values()];if(edits.comparison)next.comparison={...next.comparison,...edits.comparison};
 for(const field of ['mode','reuseFactIds','answerFactIds','draftAnswer'])if(edits[field]!==undefined&&edits[field]!==null)next[field]=edits[field];return next;
}
function compactRegions(rows,records){
 const known=new Set(records.flatMap(r=>[r.description,r.title]).filter(Boolean));
 return list(rows).map(r=>({region:r.region,summary:r.summary,unknowns:r.unknowns,domains:list(r.domains).map(d=>({domain:d.domain,...(known.has(d.summary)?{}:{summary:d.summary}),evidenceIds:d.evidenceIds,unknowns:d.unknowns}))}));
}


/** Complete, review and answer one branch-scoped question; the app commits the whole result atomically. */
export async function exploreWorld({question,branch,events=[],facts=[],history=[],relatedDialogue=[],config,callChat,makeId,signal,lang='en'}){
 const ask=async(stage,method,context,maxTokens=16384)=>{
  if(signal?.aborted)throw new DOMException('Aborted','AbortError');
  return callChat(inferenceModelConfig(config),[{role:'system',content:CORE_SYSTEM+'\nCURRENT PHASE REQUIREMENTS:\n'+method},{role:'user',content:method+'\nCONTEXT JSON:\n'+JSON.stringify(context)}],
   {signal,json:true,maxTokens,temperature:.2,purpose:'exploration',stage,reasoning:false});
 };
 const latest=branch?.simulation?.snapshots?.at(-1)?.state,questionRef=makeId();
 const base={question,language:lang,world:branch?{id:branch.id,anchorYear:branch.anchorYear,title:branch.titleZh||branch.titleEn,summary:branch.summaryZh||branch.summaryEn,premise:branch.prompt,mode:'branch',endpoint:LAST_YEAR}:{mode:'recorded-earth',endpoint:LAST_YEAR},
  globalState:list(latest?.regions).map(r=>({region:r.region,summary:r.summary})),recentDialogue:history.slice(-12),priorRelatedDialogue:relatedDialogue};
 const proposedPlan=await ask('question-plan',CORE_PLAN,base,3000);
 if(!proposedPlan||!['in_world','hypothetical','unrelated'].includes(proposedPlan.mode))throw new MatrixError('EXPLORATION_PLAN_INVALID');
 const year=proposedPlan.year??LAST_YEAR;if(!validYear(year))throw new MatrixError('EXPLORATION_YEAR_INVALID');
 const plan={...proposedPlan,year,defaults:list(proposedPlan.defaults),comparisonRequired:!!proposedPlan.comparisonRequired};
 if(proposedPlan.year===null||proposedPlan.year===undefined)plan.defaults.push('As-of year defaults to '+LAST_YEAR);
 if(branch&&year<LAST_YEAR){delete base.world.summary;if(tick(year)<tick(branch.anchorYear))delete base.world.premise;}
 const effectiveEvents=events.filter(e=>validYear(e.year)&&tick(e.year)<=tick(year));
 const effectiveFacts=facts.filter(f=>validYear(f.firstYear)&&tick(f.firstYear)<=tick(year));
 let graph={records:unique([...effectiveEvents,...effectiveFacts])};
 if(latest){
  const effectiveSnapshot=branch.simulation.snapshots.filter(s=>tick(s.year)<=tick(year)).at(-1)?.state||(tick(branch.simulation.genesis.year)<=tick(year)?branch.simulation.genesis:null);
  if(effectiveSnapshot){graph=causalContext({world:effectiveSnapshot,events:effectiveEvents,facts:effectiveFacts,actions:branch.simulation.actions.filter(a=>tick(a.startYear)<=tick(year)),query:question});base.globalState=compactRegions(effectiveSnapshot.regions,list(graph.records).map(r=>compactRecord(r,lang)));}
  else{base.globalState=[];}
 }
 const existing=unique([...effectiveFacts,...list(graph.records)]),regions=list(plan.regions).filter(r=>REGIONS.includes(r));
 // All established Core records are supplied explicitly, including older numerical conventions and results.
 const coreGraph={records:existing.map(r=>compactRecord(r,lang))};
 const context={...base,plan,causalGraph:coreGraph,establishedCoreRecords:effectiveFacts.filter(f=>f.source==='core-exploration').map(r=>compactRecord(r,lang)),regions:regions.length?regions:REGIONS,domains:DOMAINS};
 let commitAllowed=plan.mode==='in_world';
 let projection,assessed,admitted=[],answerRecords=[],comparison=null,comparisonApplicability=null,issues=[],attempts=0;
 for(let attempt=0;attempt<2;attempt++){
  attempts++;
  if(!attempt)projection=await ask('question-inference',CORE_INFERENCE,context);
  else{const patch=await ask('question-completion',CORE_COMPLETION,{...context,previousProjection:{mode:projection.mode,newFacts:projection.newFacts,comparison:projection.comparison},completionIssues:issues});projection=patchProjection(projection,patch);}
  if(!projection||!text(projection.draftAnswer)||!['in_world','hypothetical','unrelated'].includes(projection.mode))throw new MatrixError('EXPLORATION_RESPONSE_INVALID');
  if(!commitAllowed||projection.mode!=='in_world'){
   if(plan.mode==='in_world'&&projection.mode!=='in_world'){issues=[{reason:'MODE_MISMATCH: answer this existing world; missing data does not make the question hypothetical'}];if(!attempt)continue;throw new MatrixError('EXPLORATION_UNRESOLVED');}
   admitted=[];answerRecords=[];assessed={accepted:[],rejected:[],duplicates:[]};break;
  }
  assessed=auditKnowledge({candidates:list(projection.newFacts).map(f=>({...f,commitment:undefined,resolution:{question,defaults:plan.defaults,method:'Question-driven dependency inference'}})),existing:effectiveFacts,events:existing,makeId,questionRef,requireEvidence:!!branch});
  admitted=assessed.accepted;issues=[...assessed.rejected];
  const available=unique([...existing,...admitted]),byId=new Map(available.map(r=>[r.id,r]));
  const primaryIds=list(projection.newFacts).filter(f=>f.role==='answer').map(f=>assessed.references[f.id]).filter(Boolean);
  const requestedIds=projection.answerFactIds||projection.reuseFactIds||plan.existingAnswerIds;
  answerRecords=projection.answerFactIds?list(requestedIds).map(id=>byId.get(assessed.references[id]||id)):unique([...(primaryIds.length?primaryIds.map(id=>byId.get(id)):admitted),...list(requestedIds).map(id=>byId.get(assessed.references[id]||id)).filter(Boolean)]);
  if(plan.comparisonRequired){
   try{
    const resolved=resolveComparison(projection.comparison,{records:available,aliases:assessed.references,year,scope:plan.scope,entityType:plan.comparisonEntityType});comparison=resolved.ranking;comparisonApplicability=resolved.notApplicable||null;
    if(comparisonApplicability)answerRecords.push(...comparisonApplicability.evidenceIds.map(id=>byId.get(id)));
    if(resolved.reused)answerRecords.push(resolved.reused);
    else if(comparison){
     const proposed=rankingFact(comparison,{id:makeId(),question,defaults:plan.defaults,kind:plan.domains?.[0]});
     const result=auditKnowledge({candidates:[proposed],existing:available,makeId:()=>proposed.id,questionRef,requireEvidence:true});
     if(result.rejected.length)issues.push(...result.rejected);
     else{admitted.push(...result.accepted);answerRecords.push(result.accepted[0]||available.find(f=>f.id===result.duplicates[0]?.id));}
    }
   }catch(e){issues.push({reason:e.code||e.message,detail:(e.message||'')+'; Resolve the requested comparison with quantitative facts in matching units, metric, period and year; do not leave the winner or values undecided.'});}
  }
  if(!answerRecords.length||answerRecords.some(r=>!r))issues.push({reason:'ANSWER_DEPENDENCIES_UNRESOLVED',detail:'Provide actual answerFactIds for the concrete answer, using established records or new justified deductions.'});
  if(!issues.length){
   const review=await ask('question-review',CORE_REVIEW,{...context,proposals:admitted.map(r=>compactRecord(r,lang)),answerRecordIds:answerRecords.filter(Boolean).map(r=>r.id),comparison,comparisonApplicability,unresolved:projection.unresolved,proposalIdMap:assessed.references},6500);
   if(!review||!['complete','incomplete','reject'].includes(review.verdict)||!Array.isArray(review.acceptedIds)||new Set(review.acceptedIds).size!==review.acceptedIds.length||review.acceptedIds.some(id=>!admitted.some(f=>f.id===id)))throw new MatrixError('EXPLORATION_REVIEW_INVALID');
   if(review.verdict==='reject')throw new MatrixError('EXPLORATION_WORLD_CONFLICT',list(review.issues).map(text).join('; '));
   if(review.mode&& !['in_world','hypothetical','unrelated'].includes(review.mode))throw new MatrixError('EXPLORATION_REVIEW_INVALID');
   if(review.mode&&review.mode!=='in_world'){commitAllowed=false;plan.mode=review.mode;admitted=[];answerRecords=[];comparison=null;comparisonApplicability=null;issues=[];break;}
   issues=[...list(review.rejected),...list(review.blockingIssues),...(review.verdict==='incomplete'?list(review.issues).map(reason=>({reason})):[])];
   for(const f of admitted)if(!review.acceptedIds.includes(f.id))issues.push({id:f.id,reason:'UNAPPROVED_DEPENDENCY'});
   if(review.verdict==='incomplete'&&!issues.length)issues.push({reason:'Complete the actual requested world details and their indispensable dependencies.'});
  }
  if(!issues.length)break;
  if(attempt)throw new MatrixError('EXPLORATION_UNRESOLVED',JSON.stringify(issues));
 }
 if(issues.length)throw new MatrixError('EXPLORATION_UNRESOLVED');
 // Canon is committed only after the complete dependency transaction passes review.
 if(branch&&commitAllowed)admitted=admitted.map(f=>sanitizeKnowledge({...f,commitment:'world-canon'}));
 const authoritative=unique([...existing,...admitted]),answerIds=new Set(answerRecords.filter(Boolean).map(r=>r.id));
 answerRecords=authoritative.filter(r=>answerIds.has(r.id));
 const final=await ask('question-answer',CORE_ANSWER,{...base,plan,worldContext:coreGraph,approvedAnswerRecords:answerRecords.map(r=>compactRecord(r,lang)),supportingKnowledge:admitted.filter(r=>!answerIds.has(r.id)).map(r=>compactRecord(r,lang)),comparison,comparisonApplicability,
  ...(!commitAllowed?{nonPersistentAnalysis:projection.draftAnswer,mode:plan.mode}:{}),provenance:branch?'world-local inferred canon':'recorded Earth; no fictional completion'},7000);
 const allowedIds=new Set(authoritative.map(r=>r.id));
 if(!final||!text(final.answer)||!Array.isArray(final.usedFactIds)||final.usedFactIds.some(id=>!allowedIds.has(id)))throw new MatrixError('EXPLORATION_ANSWER_INVALID');
 if(signal?.aborted)throw new DOMException('Aborted','AbortError');
 const dataAnswer=comparison?renderRanking(comparison,lang):renderQuantities(answerRecords,lang);
 const answer=(dataAnswer?dataAnswer+'\n\n':'')+text(final.answer);
 return {answer,knowledge:admitted,assessment:{accepted:admitted.length,duplicates:assessed.duplicates.length,rejected:0,attempts},plan:{year,scope:plan.scope,defaults:plan.defaults},resolution:{mode:commitAllowed&&branch?'world-canon':plan.mode,answerFactIds:answerRecords.map(r=>r.id),comparison}};
}
