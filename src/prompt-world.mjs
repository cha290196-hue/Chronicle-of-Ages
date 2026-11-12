/** Model-led world authoring. These adapters only translate data for the UI. */
import {BASELINE,FIRST_YEAR,LAST_YEAR,validYear} from './data.js';
import {inferenceModelConfig} from './model-routing.mjs';

const list=value=>Array.isArray(value)?value:[];
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const text=value=>typeof value==='string'?value:'';
const nonempty=value=>text(value).trim().length>0;
const copy=value=>JSON.parse(JSON.stringify(value));
export const PROMPT_ENGINE='Prompt LLM';
// Output capacity, not a requested narrative size. Official DeepSeek accepts 384K.
export function promptRequestOptions(config,stage,purpose,signal){
 let official=false;try{official=new URL(config?.endpoint).hostname==='api.deepseek.com'}catch{}
 return {signal,json:true,reasoning:true,profile:'prompt-llm',stage,purpose,temperature:.7,maxTokens:official?393216:65536};
}
export const WORLD_SYSTEM=`You are the historical world author of Chronicle of Ages. Use your own reasoning, knowledge and coherent imagination to develop the user's alternate Earth history, ending on 2026-01-01. Reason about the world as a whole rather than running a prescribed algorithm. Keep the user's explicit premise and the selected world's established history in view. Preserve ordinary real-world physics and explain ordinary causal mechanisms in your account.
Autonomously interpret and enrich incomplete input: choose the missing date, scope, actors and background details that make the user's intended scenario coherent. Do not stop for routine clarification or admission scoring. Explain material assumptions in the resulting setting. If a premise is far-fetched, construct a coherent interpretation and make that interpretation explicit. Do not silently replace what the user explicitly specified.
You decide how much to write and how many events or facts are useful. No event quota, word quota, fixed regional grid, prescribed domain checklist, checkpoint schedule or mandatory causal graph applies. Develop the history and its wider consequences in the form and depth you judge appropriate. Do not reproduce real post-divergence history mechanically or make every development revolve around the premise. Self-check your finished account for internal consistency before returning it; provide the completed account rather than a reasoning transcript.
For a child worldline, the supplied parent is context: its history before the new fork remains shared, while its later history may develop differently. For the base reality, use known history as the starting context. Counterfactual outcomes are this world's imagined history, not verified observations or a uniquely predictable future. Do not fabricate source citations.
Use the requested language. Return one complete JSON object; JSON is only the application's storage container. Every prose field can be as long as needed. The date fields use integer calendar years ${FIRST_YEAR}..-1 or 1..${LAST_YEAR}, with no year zero, solely so the existing timeline can position records. The endpoint is January 1, not the rest of 2026.
JSON shape example (illustrates fields, not a sample scenario or a target amount of output):
{"title":"World title","summary":"World overview","expandedInput":"Your fully interpreted premise","fork":{"year":1024,"mode":"point","explanation":"Why this is the divergence point"},"assumptions":["Material premise you supplied"],"narrative":"The developed historical account","worldState":"The resulting world at the endpoint","events":[{"year":1100,"title":"An actual development","text":"Its developed explanation and consequences","category":"Any useful category","milestone":true}],"facts":[{"year":2026,"name":"A useful world setting","text":"The setting and its explanation","kind":"Any useful kind"}]}
Choose every entry and the amount of text yourself. Arrays may be empty when the scenario calls for that. Dates, titles and prose are enough; IDs, scores, dependencies and region membership are not required. Optional extra fields are allowed. A gradual fork can supply fork.endYear and mode:"gradual".`;

export const CORE_SYSTEM=`You are the Analysis Core inside one Chronicle of Ages world. Use your own reasoning and coherent imagination to answer the user's question and develop any world details needed to answer it. The supplied world and earlier conversation are your continuity, not a restrictive retrieval checklist. Reuse established settings when appropriate; fill unknown names, institutions, parameters and quantities yourself. Explain material assumptions naturally. Missing database entries or the absence of official statistics in an imagined world are not reasons to withhold an answer.
You decide the answer's length, detail, organization, intermediate assumptions and any new world settings worth saving. There is no planning API, external audit, typed dependency graph, arithmetic gate, regional coverage quota or fixed answer template. Check your own consistency, chronology, scales and units before finishing. Do not show an internal reasoning transcript. Do not import present-day real-world numbers, identities or technology unchanged merely because they are familiar. For recorded Earth without an alternate branch, answer from actual historical knowledge and be honest about unknown real facts; do not invent real observations.
An ordinary question explores the selected world. A proposed further counterfactual may be discussed without silently changing its established history; decide whether your new settings should be stored as part of this world. The world ends on 2026-01-01. Infer ordinary missing context and conventions, respecting explicit user details. Use the requested language and answer directly rather than discussing internal software.
Return one complete JSON object. Example shape only: {"answer":"The complete natural-language answer, as detailed as needed","persist":true,"knowledge":[{"year":2026,"name":"A newly established setting","text":"Its full explanation","kind":"Any useful kind","value":"Optional value or parameters"}]}. You decide how many knowledge records are useful, including none. For a hypothetical change or unrelated question you can set persist:false. JSON provides storage and display, not restrictions on your reasoning.`;

function formatError(field){return Object.assign(new Error('PROMPT_OUTPUT_INVALID'),{code:'PROMPT_OUTPUT_INVALID',field})}
function requireYear(year,field){if(!validYear(year))throw formatError(field);return year}
function fullString(value,field){if(!nonempty(value))throw formatError(field);return value}
function worldContext(branch){
 if(!branch)return null;
 const {image,...world}=branch;
 return {...world,image:image?{prompt:text(image.prompt)}:null};
}
function ancestors(branches,parentId){
 const byId=new Map(branches.map(b=>[b.id,b])),chain=[],seen=new Set();let branch=byId.get(parentId);
 while(branch&&!seen.has(branch.id)){seen.add(branch.id);chain.unshift(branch);branch=byId.get(branch.parentId)}
 return chain;
}
function inheritedRecords(branches,parentId,year){
 const chain=ancestors(branches,parentId),events=new Map(),facts=new Map();
 for(let i=0;i<chain.length;i++){
  const branch=chain[i],through=Math.min(year,chain[i+1]?.anchorYear??year);
  for(const event of [...list(branch.inherited?.events),...list(branch.events)])if(event.year<through)events.set(event.id,copy(event));
  for(const fact of [...list(branch.inherited?.facts),...list(branch.facts),...list(branch.knowledge)])if(fact.firstYear<through)facts.set(fact.id,copy(fact));
 }
 return {events:[...events.values()],facts:[...facts.values()]};
}
function knowledgeRecord(raw,{id,year=LAST_YEAR,questionRef='',source='prompt-llm'}={}){
 if(!object(raw))throw formatError('knowledge');
 const firstYear=requireYear(raw.year??raw.firstYear??year,'knowledge.year');
 const name=fullString(raw.name??raw.nameEn??raw.nameZh,'knowledge.name');
 const description=fullString(raw.text??raw.descriptionEn??raw.descriptionZh,'knowledge.text');
 return {...copy(raw),id,firstYear,validUntil:raw.validUntil??firstYear,nameEn:name,nameZh:raw.nameZh??name,
  descriptionEn:description,descriptionZh:raw.descriptionZh??description,kind:raw.kind??'other',origin:'derived',source,
  evidenceIds:list(raw.evidenceIds),assumptions:list(raw.assumptions),questionRef,discoveredAt:new Date().toISOString()};
}
export function sanitizePromptKnowledge(raw){
 try{
  if(raw?.source!=='prompt-llm'||!nonempty(raw.id))return null;
  return knowledgeRecord(raw,{id:raw.id,year:raw.firstYear,questionRef:raw.questionRef,source:'prompt-llm'});
 }catch{return null}
}
export function adaptPromptWorld(raw,{prompt,parentId=null,branches=[],runId,lang='en',elapsedMs=0}={}){
 if(!object(raw)||!object(raw.fork)||!Array.isArray(raw.events)||!Array.isArray(raw.facts))throw formatError('world');
 const year=requireYear(raw.fork.year,'fork.year'),title=fullString(raw.title,'title'),summary=fullString(raw.summary,'summary');
 const events=raw.events.map((event,index)=>{
  if(!object(event))throw formatError('events');
  const name=fullString(event.title??event.en??event.zh,'event.title'),description=fullString(event.text??event.descriptionEn??event.descriptionZh,'event.text');
  return {...copy(event),id:runId+':event:'+(index+1),year:requireYear(event.year,'event.year'),en:name,zh:event.zh??name,
   descriptionEn:description,descriptionZh:event.descriptionZh??description,category:event.category??'history',origin:'derived',
   milestone:event.milestone!==false,causes:list(event.causes),links:list(event.links)};
 });
 const facts=raw.facts.map((fact,index)=>knowledgeRecord(fact,{id:runId+':fact:'+(index+1),year}));
 const gradual=raw.fork.mode==='gradual'&&validYear(raw.fork.endYear)&&raw.fork.endYear>year;
 const {title:_title,summary:_summary,fork,events:_events,facts:_facts,...authored}=copy(raw);
 return {id:runId,parentId,anchorYear:year,timeMode:gradual?'gradual':'point',transitionEndYear:gradual?fork.endYear:year,
  timeBasisEn:text(fork.explanation),timeBasisZh:text(fork.explanation),prompt,type:'historical_change',titleEn:title,titleZh:title,summaryEn:summary,summaryZh:summary,
  createdAt:new Date().toISOString(),events,facts,knowledge:[],inherited:inheritedRecords(branches,parentId,year),impacts:[],certainty:'conditional',image:null,
  simulation:{...authored,version:4,engine:PROMPT_ENGINE,textLanguage:lang,fork,completedThrough:LAST_YEAR,
   timing:{elapsedMs,completed:true},fullEventCount:events.length,milestoneIds:events.filter(e=>e.milestone).map(e=>e.id)}};
}
export function sanitizePromptSimulation(raw){
 if(!object(raw)||raw.version!==4||raw.engine!==PROMPT_ENGINE||!raw.timing?.completed)return null;
 return copy(raw);
}
export function sanitizePromptWorldline(raw){
 try{
  if(!object(raw)||!nonempty(raw.id)||!validYear(raw.anchorYear)||!Array.isArray(raw.events)||!Array.isArray(raw.facts)||!sanitizePromptSimulation(raw.simulation))return null;
  for(const event of raw.events)if(!validYear(event?.year)||!nonempty(event?.id)||!nonempty(event?.en)||typeof event?.descriptionEn!=='string')return null;
  for(const fact of raw.facts)if(!sanitizePromptKnowledge(fact))return null;
  const result=copy(raw);result.knowledge=list(raw.knowledge).map(f=>f.source==='prompt-llm'?sanitizePromptKnowledge(f):copy(f));
  if(result.knowledge.some(f=>!f))return null;
  return result;
 }catch{return null}
}
export async function simulatePromptWorld({prompt,branches=[],parentId=null,config,callChat,makeId,lang='en',clarifications=[],signal,onProgress=()=>{},now=()=>Date.now()}){
 if(!nonempty(prompt))throw new Error('EMPTY_PROMPT');
 if(signal?.aborted)throw new DOMException('Aborted','AbortError');
 const parent=branches.find(b=>b.id===parentId);if(parentId&&!parent)throw new Error('PARENT_NOT_FOUND');
 const start=now(),runId=makeId();
 const context={input:prompt,language:lang,endpoint:'2026-01-01',clarifications,selectedWorld:worldContext(parent),
  ancestorWorlds:ancestors(branches,parentId).filter(b=>b.id!==parentId).map(worldContext),recordedHistory:parent?null:BASELINE};
 const emit=()=>onProgress({phase:'propagation',stage:'prompt-world',engine:PROMPT_ENGINE,index:0,total:1,elapsedMs:now()-start});
 emit();const ticker=setInterval(emit,1000);
 try{
  const modelConfig=inferenceModelConfig(config);
  const raw=await callChat(modelConfig,[{role:'system',content:WORLD_SYSTEM},{role:'user',content:JSON.stringify(context)}],promptRequestOptions(modelConfig,'prompt-world','simulation',signal));
  if(signal?.aborted)throw new DOMException('Aborted','AbortError');
  return {worldline:adaptPromptWorld(raw,{prompt,parentId,branches,runId,lang,elapsedMs:now()-start})};
 }finally{clearInterval(ticker)}
}
export async function explorePromptWorld({question,branch,events=[],facts=[],history=[],config,callChat,makeId,signal,lang='en'}){
 if(!nonempty(question))throw new Error('EMPTY_QUESTION');
 if(signal?.aborted)throw new DOMException('Aborted','AbortError');
 const questionRef=makeId(),modelConfig=inferenceModelConfig(config);
 const context={question,language:lang,endpoint:'2026-01-01',selectedWorld:worldContext(branch),events,facts,conversation:history};
 const raw=await callChat(modelConfig,[{role:'system',content:CORE_SYSTEM},{role:'user',content:JSON.stringify(context)}],promptRequestOptions(modelConfig,'prompt-core','exploration',signal));
 if(signal?.aborted)throw new DOMException('Aborted','AbortError');
 if(!object(raw)||!nonempty(raw.answer)||raw.knowledge!==undefined&&!Array.isArray(raw.knowledge))throw formatError('core');
 const knowledge=raw.persist===false?[]:list(raw.knowledge).map((record,index)=>knowledgeRecord(record,{id:questionRef+':knowledge:'+(index+1),questionRef}));
 return {answer:raw.answer,knowledge,engine:PROMPT_ENGINE,resolution:{mode:raw.persist===false?'hypothetical':branch?'world-canon':'recorded-earth'}};
}
