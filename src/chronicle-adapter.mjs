/** UCM-Ω adapter for Chronicle-of-Ages (not enabled in existing app by default).
 * Dependency-injected callChat and baseline keep the kernel independent of API vendors.
 */
import {compileInterventions,runMatrix,toLegacyWorldline,MatrixError} from './ucm-omega.mjs';

const clip=(x,n=2000)=>String(x??'').slice(0,n);
const SYSTEM = `You assist a counterfactual simulation of EARTH history, from earliest writing to 2026-01-01. The recorded baseline is immutable. Every altered worldline is complete from earliest writing to 2026, with pre-fork history inherited. Do not conflate user questions with edit requests. Fictional events ON EARTH are valid interventions, as are proposed physical-constant changes. A fictional extraterrestrial civilization becomes branch-local knowledge only after its Earth-anchored introduction. Never assert that a speculative scenario is recorded history. Dates are integer historical years -3200..-1 or 1..2026; there is NO year zero. Infer vague periods as intervals with explicit uncertainty; point inventions are not gradual merely because their date is vague. Never introduce a causal effect earlier than its cause. Your output is internal JSON only.`;

/**
 * `callChat`: existing core.js API (config,messages,{json,maxTokens,temperature,signal}).
 * With the current app, install both *.mjs files under src/ and import this adapter.
 */
export async function simulateOmega({prompt,branches=[],parentId=null,baseline=[],config,callChat,signal,lang='en',onProgress=()=>{},makeId,
 scenarioCount=2,maxWindows=6}){
 if(typeof callChat!=='function')throw new MatrixError('CHAT_ADAPTER_REQUIRED');
 if(typeof makeId!=='function')throw new MatrixError('ID_FACTORY_REQUIRED');
 prompt=clip(prompt,2000).trim();if(!prompt)throw new MatrixError('EMPTY_PROMPT');
 const parent=branches.find(x=>x.id===parentId)||null;
 const knownLocal=parent?{
  events:[...(parent.inherited?.events||[]),...(parent.events||[])].slice(-55),
  facts:[...(parent.inherited?.facts||[]),...(parent.facts||[])].slice(-55)
 }:{events:[],facts:[]};
 onProgress({phase:'validation',index:0,total:1});
 const interpretation=await callChat(config,[
  {role:'system',content:SYSTEM},
  {role:'user',content:`Classify user input into edit, question, or out_of_scope; only an edit may create a worldline. For an edit, atomize compound interventions, preserving their shared starting time and explicit dependencies. Distinguish modification kind (historical_change, earth_intrusion, physical_constant, branch_fact), temporal mechanism (point vs gradual), Earth anchoring, ambiguity, historical period, target and value. A historical date mentioned as a quantity of troops is NOT a timestamp. Support BCE before or after numeral, Chinese BCE/CE, relative dates, era endings and inferred historical dates; never write year 0. For an ambiguous historical period, give the inferred onset/year range and temporalBasis, marking inference in assumptions. Return JSON {"intent":"edit|question|out_of_scope","valid":boolean,"reasonEn":string,"reasonZh":string,"operations":[{"kind":"historical_change|earth_intrusion|physical_constant|branch_fact","scope":"earth|universe","mode":"point|gradual","startYear":integer,"endYear":integer,"target":string,"value":string|number|boolean|null,"units":string|null,"parentFactId":string|null,"description":string,"temporalBasis":string,"assumptions":[string]}]}. If point, endYear=startYear. Do not invent unsupported parent facts. User input: ${JSON.stringify(prompt)}. Current selected parent: ${JSON.stringify(parent?{id:parent.id,anchorYear:parent.anchorYear,titleEn:parent.titleEn}:null)}. Parent-local records: ${JSON.stringify(knownLocal).slice(0,12500)}.`}
 ],{signal,json:true,maxTokens:1900,temperature:.15});
 if(interpretation?.intent!=='edit')throw new MatrixError(interpretation?.intent==='question'?'NOT_AN_EDIT':'OUT_OF_SCOPE',clip(lang==='zh'?interpretation?.reasonZh:interpretation?.reasonEn,160));
 if(interpretation?.valid===false)throw new MatrixError('ANCHOR_INVALID',clip(lang==='zh'?interpretation?.reasonZh:interpretation?.reasonEn,180));
 // Validation is repeated by runMatrix with the complete branch ancestry.
 compileInterventions(interpretation,{parentAnchor:parent?.anchorYear??null,
  parentFacts:knownLocal.facts});
 const propose=async state=>{
  if(signal?.aborted)throw new MatrixError('ABORTED');
  const previous=state.knownEvents;
  const knownFacts=state.knownFacts;
  const repair=state.repairReasons?.length?`Previous candidate failed hard checks: ${JSON.stringify(state.repairReasons)}. Repair the problems; do not simply rename invalid references.`:'';
  const user=`Propose counterfactual events for scenario ${state.scenario}, window [${state.window.from}, ${state.window.to}], segment ${state.windowIndex+1}/${state.totalWindows}. User change: ${JSON.stringify(prompt)}. Interventions: ${JSON.stringify(state.actions)}. Established prior events: ${JSON.stringify(previous)}. Established facts: ${JSON.stringify(knownFacts)}. Valid causal reference IDs: ${JSON.stringify(state.allowedCauseIds.slice(-65))}. Ground new events in causal propagation across relevant institutions, technologies, populations, ecology, trade and diplomacy, without assuming all categories must appear. Each event requires a unique stable id and a causes array containing genuine IDs from that list OR a causally earlier event generated in THIS batch. Never cite future events, never fabricate a reference ID, and do not reinsert baseline events after the divergence without a justified cause. Event-year must fall in the inclusive window, no year zero. Events may be empty in a quiet period. Give a compact set of consequential events; do not maximize event count. Technologies must have prerequisites: requires array of known fact IDs (or facts created in this batch), otherwise disclose assumptions. Any physical-constant change is a user-imposed premise; consequences must not be represented as established physics without a verified quantitative model. This JSON is a *proposal* that will be deterministically checked, not a final historical answer. ${repair} Return JSON {"events":[{"id":string,"year":integer,"en":string,"zh":string,"descriptionEn":string,"descriptionZh":string,"category":"science|technology|culture|governance|exploration|conflict|society|other","certainty":"high|medium|low","causes":[string],"requires":[string],"assumptions":[string]}],"facts":[{"id":string,"firstYear":integer,"nameEn":string,"nameZh":string,"kind":string,"certainty":"high|medium|low","derivedFrom":string|null,"exclusiveKey":string|null,"value":string|null}],"summary":string}.`;
  return await callChat(config,[{role:'system',content:SYSTEM},{role:'user',content:user}],{signal,json:true,maxTokens:4300,temperature:state.repairAttempt?.25:.48});
 };
 const result=await runMatrix({baseline,branches,parentId,interpretation,propose,scenarioCount,maxWindows,signal,onProgress});
 onProgress({phase:'synthesis',index:1,total:1});
 const best=result.preferred;
 // The natural-language synthesis has no rigid user-facing template. It is only
 // structured for storage in the existing bilingual branch metadata schema.
 const synthesis=await callChat(config,[
  {role:'system',content:SYSTEM},
  {role:'user',content:`Summarize the preferred scenario for a reader of a historical worldline viewer. Respond faithfully to the user's intervention in the given language, with natural clear prose, not an imposed section template. Do not claim forecasts as fact. Distinguish user premises, modeled consequences and unresolved assumptions. Do not claim a numeric probability. Maintain consistency across the whole worldline through 2026-01-01. Return JSON {"titleEn":string,"titleZh":string,"summaryEn":string,"summaryZh":string,"impacts":[string]}. Interventions: ${JSON.stringify(result.actions)}. Audited events: ${JSON.stringify(best.events).slice(0,17000)}. Unresolved/rejected candidates: ${JSON.stringify(best.rejected).slice(0,2500)}. Continuity assessment: ${JSON.stringify(best.audit)}.`}
 ],{signal,json:true,maxTokens:2400,temperature:.25});
 const world=toLegacyWorldline(result,{id:makeId(),parentId:parent?.id??null,prompt,
  titleEn:clip(synthesis.titleEn||result.actions[0].description,90),titleZh:clip(synthesis.titleZh||synthesis.titleEn||prompt,90),
  summaryEn:clip(synthesis.summaryEn,2400),summaryZh:clip(synthesis.summaryZh||synthesis.summaryEn,2400)});
 world.impacts=Array.isArray(synthesis.impacts)?synthesis.impacts.slice(0,8).map(x=>clip(x,1200)):[];
 // The output is compatible with legacy worldlines. Keep full ensembles outside
 // localStorage until archive v2/IndexedDB support is implemented and tested.
 return {worldline:world,analysis:result};
}