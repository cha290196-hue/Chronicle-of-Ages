import {sanitizeSimulation} from './world-model.mjs';
import {exploreWorld} from './world-exploration.mjs';
import { simulateOmega } from './chronicle-adapter.mjs';
import {recordRequestUsage} from './usage-meter.mjs';
import {usageBillingProvider} from './deepseek-pricing.mjs';
import {parseModelJSON,normalizeModelContent,ModelJSONError} from './structured-output.mjs';
import {auditKnowledge,sanitizeKnowledge,summarizeKnowledge} from './exploration-knowledge.mjs';
import {BASELINE,FIRST_YEAR,LAST_YEAR,PHYSICAL_CONSTANTS,validYear} from './data.js';

export const DEFAULT_CONFIG={provider:'openrouter',endpoint:'https://openrouter.ai/api/v1/chat/completions',model:'',key:'',textEnabled:true,imageEnabled:false,imageProvider:'openrouter',imageEndpoint:'https://openrouter.ai/api/v1/images',imageModel:'',imageKey:'',remember:false};
export const PROVIDERS={
 deepseek:{endpoint:'https://api.deepseek.com/chat/completions',model:'deepseek-flash'},
 openrouter:{endpoint:'https://openrouter.ai/api/v1/chat/completions',model:''},
 openai:{endpoint:'https://api.openai.com/v1/chat/completions',model:''},
 custom:{endpoint:'',model:''}
};
export const IMAGE_PROVIDERS={
 openrouter:{imageEndpoint:'https://openrouter.ai/api/v1/images'},
 openai:{imageEndpoint:'https://api.openai.com/v1/images/generations'},
 custom:{imageEndpoint:''}
};
export function withTextPreset(value,provider,model){
 const preset=PROVIDERS[provider];if(!preset)return safeConfig(value);
 return safeConfig({...value,provider,endpoint:preset.endpoint,model:model||preset.model||value?.model||'',textEnabled:true});
}
export const makeId=()=>globalThis.crypto?.randomUUID?.()||`w-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const truncate=(s,n=1200)=>String(s??'').trim().slice(0,n);
const plain=(s)=>truncate(s,2400);
const nYear=(v)=>{const n=Number(v);return Number.isInteger(n)?n:NaN};
const object=(v)=>v&&typeof v==='object'&&!Array.isArray(v);
const list=(v)=>Array.isArray(v)?v:[];
const toText=(v)=>typeof v==='string'?v:'';

export function safeConfig(value={}){
 const c={...DEFAULT_CONFIG,...value};
 c.provider=Object.hasOwn(PROVIDERS,c.provider)?c.provider:'custom';
 c.imageProvider=Object.hasOwn(IMAGE_PROVIDERS,c.imageProvider)?c.imageProvider:'custom';
 c.textEnabled=c.textEnabled!==false;
 // Old saved profiles with an image model remain enabled after migration.
 c.imageEnabled=typeof value?.imageEnabled==='boolean'?value.imageEnabled:!!value?.imageModel;
 c.endpoint=String(c.endpoint||'').trim();c.imageEndpoint=String(c.imageEndpoint||'').trim();
 c.model=String(c.model||'').trim().slice(0,180);c.imageModel=String(c.imageModel||'').trim().slice(0,180);
 c.key=String(c.key||'').trim().slice(0,1000);c.imageKey=String(c.imageKey||'').trim().slice(0,1000);
 c.remember=Boolean(c.remember);
 return c;
}
export function configured(c){return !!(c?.textEnabled!==false&&c?.endpoint&&c?.model&&c?.key)}
export function imageConfigured(c){return !!(c?.imageEnabled&&c?.imageEndpoint&&c?.imageModel&&c?.imageKey)}
export function validEndpoint(value){
 try{const url=new URL(value);return url.protocol==='https:'||(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))}catch{return false}
}
export function extractJSON(content){return parseModelJSON(content)}
export function explainError(error,lang='en'){
 const code=String(error?.code||'');
 if(code==='AUTOCOMPLETE_INCOMPLETE')return lang==='zh'?'模型未能完成自动补全，请重试或关闭自动补全后手动填写条件。':'The model could not complete the missing premises. Retry or turn off auto-completion to specify them.';
 if(['INTERVENTION_REJECTED','INTERVENTION_CLARIFY','INTERVENTION_NEGLIGIBLE','UNSUPPORTED_CAUSAL_BRIDGE','INTAKE_INVALID','UNSUPPORTED_PHYSICAL_MODEL','EXPLICIT_YEAR_MISMATCH'].includes(code)){
  const defaults={INTERVENTION_REJECTED:['该输入无法建立有依据的地球历史分叉。','This input cannot establish a supported Earth-history divergence.'],
   INTERVENTION_CLARIFY:['请补充决定地球影响的时间、地点或必要参数。','Please specify the time, location or parameters that determine its effect on Earth.'],
   INTERVENTION_NEGLIGIBLE:['该变化没有足以建立世界线的可支持历史影响。','No supported material historical effect can be established.'],
   UNSUPPORTED_CAUSAL_BRIDGE:['通向地球历史影响的因果过程缺少依据。','The causal path to a material Earth-history effect is unsupported.'],
   INTAKE_INVALID:['模型未完成可靠的输入判断，请重试。','The model did not complete a valid admission assessment.'],
   UNSUPPORTED_PHYSICAL_MODEL:['此物理规律修改需要当前未提供的定量模型。','This physical-law intervention requires a quantitative model that is not available.'],
   EXPLICIT_YEAR_MISMATCH:['模型没有保留你明确指定的年份，已停止生成。','The model changed your explicit year; generation was stopped.']};
  const reason=(lang==='zh'?error.reasonZh:error.reasonEn)||defaults[code][lang==='zh'?0:1];
  return [reason,...list(error.questions).map(q=>typeof q==='string'?q:lang==='zh'?q.zh:q.en)].filter(Boolean).join(' ');
 }
 if(['WORLD_COMPLETENESS_FAILED','HISTORICAL_SUPPORT_INSUFFICIENT','WORLD_INITIALIZATION_INVALID','WORLD_REGIONS_INCOMPLETE','WORLD_PROCESSES_INCOMPLETE','WORLD_CONDITION_INVALID','WORLD_PROCESS_INVALID','WORLD_REVIEW_INVALID','WORLD_REVIEW_INCOMPLETE','WORLD_DOMAINS_INCOMPLETE'].includes(code))
  return lang==='zh'?'该阶段的全球状态、历史覆盖或因果依据未通过审查，世界线未保存。请检查输入或更换模型后重试。':'Global state, historical coverage or causal support failed review. No worldline was saved; revise the input or retry with another model.';
 if(code.startsWith('EXPLORATION_'))return lang==='zh'?'本次局部推演未通过检查，未写入新知识。请补充问题的年代或条件后重试。':'This focused inference did not pass review. No new knowledge was stored; specify the historical year or conditions and retry.';
 if(code==='NOT_AN_EDIT')return lang==='zh'?'这是历史问答，不是历史修改；请使用演算中枢进行提问。':'This is a history question, not an edit. Ask it in the Analysis Core.';
 if(code==='OUT_OF_SCOPE'||code==='NOT_EARTH_ANCHORED')return lang==='zh'?'请输入以地球历史为起点的修改。':'Provide an edit anchored in Earth history.';
 if(code==='ANCHOR_PRECEDES_PARENT')return lang==='zh'?'修改不能早于选中世界线的分叉点。':'The edit cannot predate the selected worldline fork.';
 if(['ANCHOR_INVALID','INVALID_YEAR','INVALID_TIME_RANGE','UNKNOWN_BRANCH_FACT','UNKNOWN_BRANCH_FACT_AT_ANCHOR','CONTRADICTORY_INTERVENTIONS','EMPTY_OR_EXCESSIVE_INTERVENTION'].includes(code))
  return lang==='zh'?'历史干预的时间、对象或约束不成立，请调整输入。':'The historical intervention contains an invalid time, target, or conflicting condition.';
 if(code==='NO_VALID_TRAJECTORY')return lang==='zh'?'模型未能生成可通过因果校验的结果，请重新推演。':'The model could not produce a causally valid result. Try again.';
 if(['WINDOW_EXPANSION_LIMIT','WINDOW_SCOPE_TOO_DENSE'].includes(code))
  return lang==='zh'?'该历史时段已自动按时间、地区和领域拆分，但当前模型仍无法完整生成某个子任务。系统没有用空数据替代历史，请检查模型输出上限或换用容量更高的模型。':'The engine split this historical period by time, region and domain, but the model still could not complete a subsection. No partial or empty history was substituted; check the output capacity.';
 if(code==='GLOBAL_CAUSAL_AUDIT_FAILED')
  return lang==='zh'?'所有子推演已完成，但全局因果一致性复核未通过。世界线未保存，请重新推演。':'Global causal review found inconsistent cross-window dependencies. No partial worldline was saved.';
 if(error?.name==='AbortError'||error?.message==='ABORTED')return lang==='zh'?'推演已停止。':'Simulation stopped.';
 if(error?.message==='INVALID_JSON'||error?.message==='BAD_RESPONSE'){
  const reason=error?.reason;
  const phase=error?.phase;
  const phaseZh=phase==='validation'?'历史干预识别':phase==='synthesis'?'最终世界线总结':phase==='propagation'?'历史时段推演':'结构化结果生成';
  const phaseEn=phase==='validation'?'interpreting the historical intervention':phase==='synthesis'?'summarizing the worldline':phase==='propagation'?'modeling a historical window':'structured output';
  const zhPrefix=phaseZh+'：',enPrefix='During '+phaseEn+': ';
  if(lang==='zh')return zhPrefix+(reason==='truncated'
   ?'模型输出达到长度上限，即使自动恢复仍未获得完整内容。已拒绝保存不完整的历史。'
   :reason==='empty'?'模型返回了空白结构化内容；DeepSeek JSON 模式可能出现这种情况，恢复请求仍未成功。'
   :'模型返回的结构化内容不合法，自动恢复也未成功；已拒绝把不完整结果写入世界线。');
  return enPrefix+(reason==='truncated'?'Model output reached its length limit and recovery did not produce a complete response.'
   :reason==='empty'?'The model returned blank structured output; recovery also failed.'
   :'The model returned malformed structured output after recovery. No incomplete history was saved.');
 }
 if(error?.message==='INVALID_ENDPOINT')return lang==='zh'?'接口地址必须是 HTTPS（本机允许 HTTP）。':'Use an HTTPS API endpoint (HTTP allowed for localhost).';
 if(error?.message==='NOT_CONFIGURED')return lang==='zh'?'请先配置文本模型的接口、模型和密钥。':'Configure the text model endpoint, model and key first.';
 if(error?.message==='IMAGE_NOT_CONFIGURED')return lang==='zh'?'请先在设置中启用并填写生图模型配置。':'Enable and configure an image model in Settings first.';
 if(error?.message==='ANCHOR_PRECEDES_PARENT')return lang==='zh'?'修改早于当前世界线的起点，请先选中现实基线或更早的世界线。':'The change predates the active worldline. Select the baseline or an earlier ancestor first.';
 if(error?.message==='ANCHOR_INVALID')return lang==='zh'?'修改没有有效的地球历史锚点。':'The change has no valid Earth history anchor.';
 if(error?.message==='EMPTY_RESPONSE')return lang==='zh'?'模型没有返回内容。':'The model returned no content.';
 const msg=String(error?.message||error||'Unknown error');
 if(/Failed to fetch|NetworkError|CORS|fetch failed/i.test(msg))return lang==='zh'?'无法连接模型。请检查网络、地址、服务商跨域支持及密钥。':'Cannot connect to the model. Check the network, endpoint, CORS support and API key.';
 return msg.slice(0,360);
}
/**
 * OpenAI-compatible chat bridge shared by UCM-Ω and progressive discovery.
 * A bad 200-OK JSON body is a model format problem, not an API connection problem.
 * Recovery retries the JSON task once with a concise JSON-only instruction.
 * Never accept a partially parsed JSON object as confirmed worldline data.
 */
export async function callChat(config,messages,{signal,json=false,temperature=.35,maxTokens=3200,purpose='other',stage='other',reasoning=false}={}){
 const c=safeConfig(config);
 if(!configured(c))throw new Error('NOT_CONFIGURED');
 if(!validEndpoint(c.endpoint))throw new Error('INVALID_ENDPOINT');
 const meteredProvider=usageBillingProvider(c.provider,c.endpoint);
 const baseBody={model:c.model,messages,temperature,max_tokens:maxTokens,stream:false};
 if(json)baseBody.response_format={type:'json_object'};
 if(c.provider==='deepseek'){
  const think=reasoning||(!json&&maxTokens>256);
  baseBody.thinking={type:think?'enabled':'disabled'};
  if(think){baseBody.max_tokens=Math.max(maxTokens,reasoning?32768:8192);baseBody.reasoning_effort='high';}
  // DeepSeek's max_tokens is an output ceiling, not pre-billed tokens.
  // Give structured historical tasks enough room to finish JSON without
  // discarding detail or paying for repeated truncation/re-generation.
  if(json&&purpose==='simulation')baseBody.max_tokens=Math.max(baseBody.max_tokens,8192);
 }
 const doCall=async({format=json,recovery=false,previousFailure=null}={})=>{
  const startedAt=Date.now();
  const elapsed=()=>Math.max(0,Date.now()-startedAt);
  const body={...baseBody};
  if(!format)delete body.response_format;
  if(recovery){
   const retryNote='The previous reply did not produce a valid complete JSON object. Re-evaluate the original instructions and return ONE complete syntactically correct JSON object only. No markdown, preamble, commentary or code fences. Preserve ALL substantive events, dependencies, historical detail and required keys; never delete events or substitute empty arrays to make the format pass. Do not modify the original user intervention.';
   body.messages=[...messages,{role:'user',content:retryNote}];
   body.temperature=Math.min(Number.isFinite(temperature)?temperature:.35,.2);
   if(previousFailure?.reason==='truncated'){
    body.max_tokens=Math.max(baseBody.max_tokens,Math.ceil(maxTokens*1.4));
   }
  }
  const options={method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${c.key}`},body:JSON.stringify(body),signal};
  if(c.provider==='openrouter'&&typeof location!=='undefined')options.headers['HTTP-Referer']=location.origin;
  let response;
  try{response=await fetch(c.endpoint,options)}
  catch(e){recordRequestUsage({provider:meteredProvider,model:c.model,purpose,stage,elapsedMs:elapsed(),success:false});if(signal?.aborted)throw new DOMException('Aborted','AbortError');throw e}
  if(!response.ok){
   let detail='',failurePayload=null;
   try{failurePayload=await response.json();detail=failurePayload?.error?.message||failurePayload?.message||''}catch{}
   recordRequestUsage({provider:meteredProvider,model:c.model,purpose,stage,elapsedMs:elapsed(),success:false,payload:failurePayload});
   const ex=new Error(`HTTP ${response.status}${detail?`: ${String(detail).slice(0,220)}`:''}`);
   ex.status=response.status;
   throw ex;
  }
  let payload;
  try{payload=await response.json()}
  catch(e){recordRequestUsage({provider:meteredProvider,model:c.model,purpose,stage,elapsedMs:elapsed(),success:false});throw e}
  recordRequestUsage({provider:meteredProvider,model:c.model,purpose,stage,elapsedMs:elapsed(),success:true,payload});
  const choice=payload?.choices?.[0];
  const message=choice?.message||{};
  let result=normalizeModelContent(message.content??message.text??choice?.text??payload?.output_text);
  if(!result&&Array.isArray(payload?.output)){
   result=payload.output.map(item=>normalizeModelContent(item?.content)).filter(Boolean).join('\n');
  }
  if(!result&&message.refusal)throw new Error(message.refusal);
  if(!result){
   if(!json)throw new Error('EMPTY_RESPONSE');
   const err=new ModelJSONError(choice?.finish_reason==='length'?'truncated':'empty');
   err.finishReason=choice?.finish_reason||null;
   throw err;
  }
  if(!json)return result;
  // Some providers terminate at the output limit immediately after a syntactically
  // valid object. Such a response may still omit historical detail: fail closed.
  if(choice?.finish_reason==='length'){
   const err=new ModelJSONError('truncated');
   err.finishReason='length';throw err;
  }
  try{return extractJSON(result)}
  catch(e){
   if(e?.message!=='INVALID_JSON')throw e;
   const err=e instanceof ModelJSONError?e:new ModelJSONError('non_json');
   if(choice?.finish_reason==='length')err.reason='truncated';
   err.finishReason=choice?.finish_reason||null;
   throw err;
  }
 };
 try{return await doCall({format:json})}
 catch(first){
  if(!json||signal?.aborted)throw first;
  // A confirmed 8192-token cutoff in a PRIMARY history window cannot
  // be made whole by another request with the SAME 8192-token ceiling.
  // Its caller's adaptive time/region split is the lossless next step.
  // Retain JSON retries for syntax/blank output, summaries, coverage and
  // smaller requests that can still benefit from another completion.
  if(c.provider==='deepseek'&&purpose==='simulation'&&stage==='historical-window'
     &&first?.reason==='truncated'&&first?.finishReason==='length'
     &&baseBody.max_tokens>=8192)throw first;
  const unsupportedFormat=first?.status===400||first?.status===422;
  const malformed=first?.message==='INVALID_JSON';
  if(!unsupportedFormat&&!malformed)throw first;
  // JSON-mode support varies across API-compatible providers. After one
  // failure, retry without the strict response_format parameter.
  try{return await doCall({format:false,recovery:true,previousFailure:first})}
  catch(second){
   if(second?.message==='INVALID_JSON'&&second instanceof ModelJSONError){
    second.attempts=2;
    if(first?.reason==='truncated'&&second.reason==='incomplete')second.reason='truncated';
   }
   throw second;
  }
 }
}
const CONTEXT=`You are a causal alternate-history simulation engine with a strict Earth-worldline ontology. The immutable reference world is recorded Earth history from the first known writing to 2026-01-01. Accept changes only if they (a) alter a recorded Earth historical phenomenon, (b) change an actual physical constant of this Earth's universe, or (c) explicitly introduce a fictional event ON EARTH at a grounded year in that chronological span (e.g. alien arrival on Earth in 1234). A fictional planet or unknown event elsewhere without an Earth anchor is not a valid edit. After a divergence, named entities and technologies invented by that branch become valid local knowledge and can be revised in later forks. Keep factual baseline distinct from branch assumptions. Propagate plausible causal consequences, respecting chronology, geography, technological prerequisites, demographics, institutional inertia, and uncertainty. Never present speculative results as documented historical fact. Avoid reintroducing baseline events automatically after divergence if no longer plausible. Respond with VALID JSON only, no markdown. Keep strings concise. Produce fields in English and Chinese where specified. All events must use integer historical years from -3200 to 2026; BCE years are negative, there is no year 0. The simulation ends on 2026-01-01.`;
const YEAR_RE=/(?:公元前\s*|\bBCE?\s*)(\d{1,4})|\b(\d{3,4})\s*(?:AD|CE|年)?\b/gi;
export function explicitYears(text){const years=[];for(const m of String(text).matchAll(YEAR_RE)){let y=m[1]?-Number(m[1]):Number(m[2]);if(validYear(y))years.push(y)}return years}
export function inheritedState(branches,parentId,atYear){
 if(!parentId)return {events:[],facts:[]};
 const byId=new Map(branches.map(b=>[b.id,b]));const chain=[];let cursor=byId.get(parentId);const seen=new Set();
 while(cursor&&!seen.has(cursor.id)){seen.add(cursor.id);chain.unshift(cursor);cursor=byId.get(cursor.parentId)}
 const events=[];const facts=[];
 for(const b of chain){
  const next=chain.find(c=>c.parentId===b.id);
  const cap=Math.min(atYear,next?.anchorYear??atYear);
  for(const e of list(b.events))if(e.year<cap)events.push({...e});
  for(const f of list(b.facts))if(f.firstYear<cap)facts.push({...f});
 }
 return {events:uniq(events),facts:uniq(facts)};
}
function uniq(items){return [...new Map(items.map(item=>[item.id,item])).values()]}
export function worldEvents(branches,branch){if(!branch)return BASELINE;let root=branch,visited=new Set();while(root.parentId&&!visited.has(root.id)){visited.add(root.id);const p=branches.find(b=>b.id===root.parentId);if(!p)break;root=p;}return uniq([...BASELINE.filter(e=>e.year<root.anchorYear),...list(branch.inherited?.events),...list(branch.events)]).sort((a,b)=>a.year-b.year)}
export function worldFacts(branches,branch){
 if(!branch)return [];
 const chain=[],seen=new Set();let cursor=branch;
 while(cursor&&!seen.has(cursor.id)){chain.unshift(cursor);seen.add(cursor.id);cursor=branches.find(b=>b.id===cursor.parentId)}
 const items=[...list(branch.inherited?.facts)];
 for(let i=0;i<chain.length;i++){
  const b=chain[i],cap=chain[i+1]?.anchorYear??null;
  for(const fact of [...list(b.facts),...list(b.knowledge)]){
   if(!validYear(fact.firstYear)||(cap!==null&&fact.firstYear>=cap))continue;
   items.push(fact);
  }
 }
 return uniq(items);
}
export function baselineContext(year,count=20){
 const sorted=[...BASELINE].sort((a,b)=>Math.abs(a.year-year)-Math.abs(b.year-year));
 return sorted.slice(0,count).sort((a,b)=>a.year-b.year).map(e=>`${e.year} ${e.en}: ${e.descriptionEn}`).join('\n');
}
export function classifyTemporalIntent(prompt){
 const text=String(prompt||'');
 const discrete=/(发明|发现|研发出|制造出|首次|建成|抵达|登陆|入侵|登基|颁布|签署|创立|invent(?:ed|ion)?|discover(?:ed|y)?|land(?:ed)?|arriv(?:e|ed|al)|enact(?:ed)?|signed|founded)/i.test(text);
 const cumulative=/(天下大乱|渐渐|逐渐|逐步|日益|慢慢|积累|蔓延|传播|衰退|衰亡|衰弱|腐败|动荡|社会失序|长期|多年|gradual(?:ly)?|slowly|over (?:many |several )?(?:years|decades)|social unrest|turmoil|decline|spread|deteriorat(?:e|ion))/i.test(text);
 if(discrete&&!cumulative)return 'point';
 if(cumulative&&!discrete)return 'gradual';
 return null
}
export function normalizeTemporalAnchor(assessment,prompt='',parent=null){
 const anchorYear=nYear(assessment?.anchorYear);
 if(!validYear(anchorYear))throw new Error('ANCHOR_INVALID');
 const timeMode=assessment?.timeMode==='gradual'?'gradual':'point';
 const transitionEndYear=timeMode==='gradual'?nYear(assessment?.transitionEndYear):anchorYear;
 if(!validYear(transitionEndYear)||transitionEndYear<anchorYear||(timeMode==='gradual'&&transitionEndYear===anchorYear))throw new Error('ANCHOR_INVALID');
 if(parent&&anchorYear<parent.anchorYear)throw new Error('ANCHOR_PRECEDES_PARENT');
 const explicit=explicitYears(prompt);
 if(explicit.length&&assessment?.type!=='physical_constant'){
  if(timeMode==='point'&&explicit.length===1&&Math.abs(explicit[0]-anchorYear)>2)throw new Error('ANCHOR_INVALID');
  if(timeMode==='gradual'&&explicit.length===1&&Math.abs(explicit[0]-anchorYear)>2&&Math.abs(explicit[0]-transitionEndYear)>2)throw new Error('ANCHOR_INVALID');
  if(explicit.length>=2&&(anchorYear<Math.min(...explicit)-2||transitionEndYear>Math.max(...explicit)+2))throw new Error('ANCHOR_INVALID');
 }
 return {anchorYear,timeMode,transitionEndYear,timeBasisEn:truncate(assessment?.timeBasisEn||'',320),timeBasisZh:truncate(assessment?.timeBasisZh||'',320)};
}
export function planSegments(start){
 if(!validYear(start))throw new Error('ANCHOR_INVALID');
 if(start===LAST_YEAR)return [[start,LAST_YEAR]];
 const distance=LAST_YEAR-start,count=distance>1800?6:distance>600?5:distance>100?4:distance>15?3:2;
 const ends=[];let from=start;
 for(let i=1;i<=count;i++){let to=Math.min(LAST_YEAR,Math.round(start+distance*i/count));if(to===0)to=1;if(to<from)to=from;ends.push([from,to]);from=to}
 return ends;
}
const normalizedEvent=(raw,range)=>{
 const year=nYear(raw?.year);
 if(!validYear(year)||year<range[0]||year>range[1])return null;
 const en=plain(raw?.en||raw?.title),zh=plain(raw?.zh||en);
 if(!en)return null;
 return {id:makeId(),year,en,zh,descriptionEn:plain(raw?.descriptionEn||raw?.description||en),descriptionZh:plain(raw?.descriptionZh||raw?.descriptionEn||raw?.description||zh),category:['science','technology','culture','governance','exploration','conflict','society','other'].includes(raw?.category)?raw.category:'other',origin:'derived',certainty:['high','medium','low'].includes(raw?.certainty)?raw.certainty:'medium',causes:list(raw?.causes).map(x=>truncate(x,180)).slice(0,4)};
};
const normalizedFact=(raw,range)=>{
 const firstYear=nYear(raw?.firstYear??range[0]);if(!validYear(firstYear)||firstYear<range[0]||firstYear>range[1])return null;
 const nameEn=plain(raw?.nameEn||raw?.name),nameZh=plain(raw?.nameZh||nameEn);
 if(!nameEn)return null;
 return {id:makeId(),firstYear,nameEn,nameZh,descriptionEn:plain(raw?.descriptionEn||raw?.description),descriptionZh:plain(raw?.descriptionZh||raw?.descriptionEn||raw?.description),kind:truncate(raw?.kind||'concept',60),origin:'derived',certainty:['high','medium','low'].includes(raw?.certainty)?raw.certainty:'medium'};
};
function mergeFacts(target,incoming){
 for(const f of incoming){const existing=target.find(x=>x.nameEn?.toLowerCase()===f.nameEn?.toLowerCase());if(existing)Object.assign(existing,{descriptionEn:f.descriptionEn,descriptionZh:f.descriptionZh,firstYear:Math.min(existing.firstYear,f.firstYear)});else target.push(f)}
}
export function sanitizeWorldline(input){
 if(!object(input)||typeof input.id!=='string'||!validYear(input.anchorYear)||!Array.isArray(input.events)||!Array.isArray(input.facts))return null;
 const simulation=sanitizeSimulation(input.simulation);if(input.simulation&&!simulation)return null;
 const scrubEvent=e=>object(e)&&validYear(e.year)&&toText(e.en||e.title)&&toText(e.id)?{...e,id:truncate(e.id,120),causes:list(e.causes).map(x=>truncate(x,120)),links:list(e.links).filter(object),en:plain(e.en||e.title),zh:plain(e.zh||e.en||e.title),descriptionEn:plain(e.descriptionEn||''),descriptionZh:plain(e.descriptionZh||''),origin:e.origin==='user'?'user':'derived',category:truncate(e.category,40)}:null;
 const scrubFact=f=>object(f)&&validYear(f.firstYear)&&toText(f.id)&&toText(f.nameEn)?{...f,id:truncate(f.id,120),nameEn:plain(f.nameEn),nameZh:plain(f.nameZh||f.nameEn),descriptionEn:plain(f.descriptionEn),descriptionZh:plain(f.descriptionZh),kind:truncate(f.kind,60)}:null;
 const gradual=input.timeMode==='gradual',end=gradual?nYear(input.transitionEndYear):input.anchorYear;
 if(!validYear(end)||end<input.anchorYear||(gradual&&end===input.anchorYear))return null;
 return {id:truncate(input.id,100),parentId:toText(input.parentId)||null,anchorYear:input.anchorYear,timeMode:gradual?'gradual':'point',transitionEndYear:end,timeBasisEn:truncate(input.timeBasisEn||'',320),timeBasisZh:truncate(input.timeBasisZh||'',320),prompt:truncate(input.prompt,2000),type:truncate(input.type||'historical_change',50),titleEn:plain(input.titleEn),titleZh:plain(input.titleZh||input.titleEn),summaryEn:truncate(input.summaryEn,7000),summaryZh:truncate(input.summaryZh||input.summaryEn,7000),createdAt:truncate(input.createdAt,40),events:input.events.map(scrubEvent).filter(Boolean),facts:input.facts.map(scrubFact).filter(Boolean),knowledge:list(input.knowledge).map(sanitizeKnowledge).filter(Boolean),inherited:{events:list(input.inherited?.events).map(scrubEvent).filter(Boolean),facts:list(input.inherited?.facts).map(scrubFact).filter(Boolean)},impacts:list(input.impacts).slice(0,8).map(x=>plain(x)),certainty:truncate(input.certainty||'medium',20),simulation,image:object(input.image)?{data:toText(input.image.data).slice(0,5_000_000),prompt:plain(input.image.prompt)}:null};
}
/**
 * The public simulation entry point used by app.js.
 * UCM-Ω/2 advances one authoritative global state with evidence-carrying
 * transitions, era-sensitive windows and independent semantic review.
 * simulateLegacy is retained solely for compatibility with old integrations.
 */
export async function simulate({prompt,branches=[],parentId=null,config,lang='en',signal,onProgress=()=>{},autoComplete=false,clarifications=[]}) {
 if(!configured(config))throw new Error('NOT_CONFIGURED');
 try{
  const {worldline}=await simulateOmega({
   prompt,branches,parentId,baseline:BASELINE,config,lang,signal,onProgress,
   callChat,makeId,autoComplete,clarifications
  });
  return worldline;
 }catch(error){
  if(signal?.aborted||error?.code==='ABORTED')throw new DOMException('Aborted','AbortError');
  throw error;
 }
}

export async function simulateLegacy({prompt,branches=[],parentId=null,config,lang='en',signal,onProgress=()=>{}}){
 prompt=truncate(prompt,2000);if(!prompt)throw new Error('EMPTY_PROMPT');if(!configured(config))throw new Error('NOT_CONFIGURED');
 const parent=branches.find(b=>b.id===parentId)||null;
 const inheritedForValidation=parent?{events:worldEvents(branches,parent).slice(-45),facts:worldFacts(branches,parent).slice(-70)}:{events:[],facts:[]};
 onProgress({phase:'validation',index:0,total:1});
 let assessment=await callChat(config,[
  {role:'system',content:CONTEXT},
  {role:'user',content:`Validate this proposed edit. It MUST refer to Earth, its recorded past, a real physical constant, or a dated fictional event explicitly happening on Earth. Classify the NATURE of the modification rather than the vagueness of its date: timeMode=point for an individual invention, discovery, landing or other discrete act, even when only a dynasty or era is supplied (infer a plausible year); timeMode=gradual for turmoil, declining authority, widespread migration or other accumulating developments (infer their onset and a later establishment year). Do not collapse gradual social change into one instantaneous event. An edit to branch-derived knowledge is allowed only if supplied in the parent world data. For fictional arrivals on Earth, mark earth_intrusion, which is valid even though it did not happen in reality. Assessments need not reject physically impossible changes to actual constants. Return JSON {"valid":boolean,"reasonEn":string,"reasonZh":string,"anchorYear":integer,"timeMode":"point|gradual","transitionEndYear":integer,"timeBasisEn":string,"timeBasisZh":string,"type":"historical_change|earth_intrusion|physical_constant|branch_fact","changeEn":string,"changeZh":string}. For point, transitionEndYear=anchorYear. For gradual, anchorYear is the onset and transitionEndYear is when the changing condition has developed. Explain the inferred historical range briefly in timeBasis. User change: ${JSON.stringify(prompt)}. Parent world local records: ${JSON.stringify(inheritedForValidation).slice(0,10000)}. Date-related baseline: ${explicitYears(prompt).length?baselineContext(explicitYears(prompt)[0],24):"No explicit numeric year; infer the era from the user wording without assuming a default century."}.`}
 ],{signal,json:true,maxTokens:1000,temperature:.12});
 if(assessment.valid!==true)throw new Error(`ANCHOR_INVALID${assessment.reasonEn?`: ${truncate(lang==='zh'?assessment.reasonZh:assessment.reasonEn,180)}`:''}`);
 const intent=classifyTemporalIntent(prompt);
 if(intent==='point'&&!assessment.timeMode)assessment={...assessment,timeMode:'point',transitionEndYear:assessment.anchorYear};
 if((intent&&assessment.timeMode&&intent!==assessment.timeMode)||(intent==='gradual'&&!assessment.timeMode)){
  const corrected=await callChat(config,[
   {role:'system',content:CONTEXT},
   {role:'user',content:`The proposed Earth modification is ${JSON.stringify(prompt)}. Classify it as ${intent}: ${intent==='point'?'a discrete invention/discovery/occurrence, even if the historical era is broad':'a historical condition accumulating over a span, not one sudden occurrence'}. Infer historically plausible timing from the wording. Return JSON {"anchorYear":integer,"transitionEndYear":integer,"timeBasisEn":string,"timeBasisZh":string}. For point return the same year twice; for gradual return onset and later establishment. Previous classification: ${JSON.stringify(assessment)}.`}
  ],{signal,json:true,maxTokens:600,temperature:.12});
  assessment={...assessment,anchorYear:corrected.anchorYear,transitionEndYear:corrected.transitionEndYear,timeBasisEn:corrected.timeBasisEn,timeBasisZh:corrected.timeBasisZh,timeMode:intent};
 }
 const temporal=normalizeTemporalAnchor(assessment,prompt,parent);const year=temporal.anchorYear;
 const knownChange=['historical_change','earth_intrusion','physical_constant','branch_fact'].includes(assessment.type)?assessment.type:'historical_change';
 if(knownChange==='branch_fact'&&!parent)throw new Error('ANCHOR_INVALID');
 const inherited=inheritedState(branches,parentId,year),segments=planSegments(year);
 const branch={id:makeId(),parentId:parent?.id||null,anchorYear:year,...temporal,prompt,type:knownChange,createdAt:new Date().toISOString(),titleEn:'',titleZh:'',summaryEn:'',summaryZh:'',events:[],facts:[],inherited,impacts:[],certainty:'medium',image:null};
 const prior=parent?`${parent.titleEn}\n${parent.summaryEn}`:'Recorded Earth baseline';
 for(let i=0;i<segments.length;i++){
  if(signal?.aborted)throw new DOMException('Aborted','AbortError');
  const range=segments[i];onProgress({phase:'propagation',index:i,total:segments.length});
  const recent=branch.events.slice(-32);const facts=worldFacts(branches,branch).slice(-65);
  const data=await callChat(config,[
   {role:'system',content:CONTEXT},
   {role:'user',content:`Perform checkpoint ${i+1}/${segments.length} for [${range[0]}, ${range[1]}], inclusive. Earth divergence: ${JSON.stringify({prompt,year,type:knownChange,...temporal,changeEn:assessment.changeEn,changeZh:assessment.changeZh})}. In gradual mode, change accumulates between anchorYear and transitionEndYear and does not happen all at once; in point mode a discrete event happens at the inferred anchorYear. Parent state: ${prior}. Inherited facts/events before divergence: ${JSON.stringify(inherited).slice(0,14500)}. This branch's already computed events: ${JSON.stringify(recent).slice(0,14500)}. Accumulated knowledge: ${JSON.stringify(facts).slice(0,12000)}. Relevant baseline comparison ONLY (not assumed to happen after divergence): ${baselineContext(Math.round((range[0]+range[1])/2),16)}. Show realistic causal chains through multiple domains with non-magical second-order consequences. Ensure each event is within [${range[0]},${range[1]}], minimum 3 and maximum 7 consequential events unless the interval is extremely short, and every event includes causes naming earlier entities/events or explicitly the initial change. New technologies, people, institutions and concepts are represented in facts with firstYear, and must not predate their causes. No silent resets to our history. Maintain continuity and uncertainty. OUTPUT JSON {"events":[{"year":integer,"en":string,"zh":string,"descriptionEn":string,"descriptionZh":string,"category":"science|technology|culture|governance|exploration|conflict|society|other","certainty":"high|medium|low","causes":[string]}],"facts":[{"firstYear":integer,"nameEn":string,"nameZh":string,"descriptionEn":string,"descriptionZh":string,"kind":string,"certainty":"high|medium|low"}],"stateEn":string,"stateZh":string}.`}
  ],{signal,json:true,maxTokens:4300,temperature:.48});
  if(!object(data)||!Array.isArray(data.events))throw new Error('BAD_RESPONSE');
  for(const item of data.events.slice(0,10)){const e=normalizedEvent(item,range);if(e&&!branch.events.some(x=>x.year===e.year&&x.en.toLowerCase()===e.en.toLowerCase()))branch.events.push(e)}
  const fresh=list(data.facts).slice(0,18).map(f=>normalizedFact(f,range)).filter(Boolean);
  mergeFacts(branch.facts,fresh);
  branch.summaryEn=plain(data.stateEn||branch.summaryEn);branch.summaryZh=plain(data.stateZh||branch.summaryZh);
 }
 onProgress({phase:'synthesis',index:segments.length,total:segments.length});
 const reviewed=await callChat(config,[
  {role:'system',content:CONTEXT},
  {role:'user',content:`Reconcile the generated worldline to 2026-01-01, with a concise readable snapshot. Do not imply certainty or disguise speculative changes as historical records. Identify any significant causal tensions in the forecast. Output JSON {"titleEn":string,"titleZh":string,"summaryEn":string,"summaryZh":string,"impacts":[string],"certainty":"low|medium|high"}. Original edit: ${prompt}. Temporal range: ${JSON.stringify(temporal)}. Computed events: ${JSON.stringify(branch.events).slice(0,22000)}. New facts: ${JSON.stringify(branch.facts).slice(0,12000)}. Previous state: ${branch.summaryEn}.`}
 ],{signal,json:true,maxTokens:2000,temperature:.3});
 branch.titleEn=truncate(reviewed.titleEn||assessment.changeEn||prompt,90);
 branch.titleZh=truncate(reviewed.titleZh||assessment.changeZh||branch.titleEn,90);
 branch.summaryEn=plain(reviewed.summaryEn||branch.summaryEn);
 branch.summaryZh=plain(reviewed.summaryZh||branch.summaryEn);
 branch.impacts=list(reviewed.impacts).slice(0,8).map(x=>plain(x));
 branch.certainty=['high','medium','low'].includes(reviewed.certainty)?reviewed.certainty:'medium';
 branch.events.sort((a,b)=>a.year-b.year);
 return branch;
}
function terms(text){
 const words=String(text).toLowerCase().match(/[a-z0-9]{3,}|[\u3400-\u9fff]{2,}/g)||[],out=[];
 const common=new Set(['什么','如何','这个','世界','是否','为什么','请问','哪些','情况','怎么']);
 for(const word of words){if(/[\u3400-\u9fff]/.test(word)){if(word.length<=8&&!common.has(word))out.push(word);for(let i=0;i<word.length-1;i++){const part=word.slice(i,i+2);if(!common.has(part))out.push(part)}}else out.push(word)}
 return [...new Set(out)].slice(0,60)
}
function rank(query,item){const hay=JSON.stringify(item).toLowerCase();return terms(query).reduce((score,term)=>score+(hay.includes(term)?term.length:0),0)}
export function retrieveWorld(branches,branch,query,limit=24){
 const events=worldEvents(branches,branch),facts=worldFacts(branches,branch);
 return {events:[...events].sort((a,b)=>rank(query,b)-rank(query,a)).slice(0,limit),facts:[...facts].sort((a,b)=>rank(query,b)-rank(query,a)).slice(0,limit)};
}
export function dialogueEntries(history){
 const entries=[];let pending=null;
 for(let i=0;i<(Array.isArray(history)?history.length:0);i++){
  const m=history[i];if(!m||typeof m.content!=='string')continue;
  if(m.role==='user')pending={question:m.content,index:i};
  else if(m.role==='assistant'&&pending){if(!m.error)entries.push({...pending,answer:m.content});pending=null}
 }
 return entries;
}
export function sanitizeChats(input,branchIds){
 const result=Object.create(null);if(!input||typeof input!=='object'||Array.isArray(input))return result;
 for(const id of ['baseline',...branchIds]){const messages=input[id];if(!Array.isArray(messages))continue;
  result[id]=messages.filter(m=>m&&['user','assistant'].includes(m.role)&&typeof m.content==='string').map(m=>({role:m.role,content:m.content,...(m.error?{error:true}:{})}));
 }
 return result;
}
/**
 * Every analysis-core question launches a branch-scoped local inference.
 * The returned draft records are audited separately from the answer. This
 * function DOES NOT mutate state; the app commits knowledge with the dialogue.
 */
export async function exploreCore({question,branch,branches=[],config,lang='en',history=[],signal,baselineKnowledge=[]}){
 question=truncate(question,1800).trim();if(!question)throw new Error('EMPTY_QUESTION');
 const relatedDialogue=dialogueEntries(history).map(entry=>({entry,score:rank(question,entry)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,6).map(x=>x.entry);
 return exploreWorld({question,branch,events:worldEvents(branches,branch),
  facts:branch?worldFacts(branches,branch):baselineKnowledge,config,lang,history,relatedDialogue,signal,callChat,makeId});
}
export async function askCore(options){return (await exploreCore(options)).answer}

export async function generateImage({prompt,branch,config,signal}){
 const c=safeConfig(config);if(!imageConfigured(c))throw new Error('IMAGE_NOT_CONFIGURED');if(!validEndpoint(c.imageEndpoint))throw new Error('INVALID_ENDPOINT');
 const context=branch?`${branch.titleEn}. ${branch.summaryEn} Key historical features: ${branch.events.slice(-10).map(e=>e.en).join('; ')}.`:'Recorded Earth history';
 const payload={model:c.imageModel,prompt:`Illustrate this specific Earth timeline with historically and materially consistent details. ${context} Requested view: ${truncate(prompt,1100)}. Documentary visual treatment, no text labels.`,size:'1024x1024',n:1};
 const response=await fetch(c.imageEndpoint,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${c.imageKey}`},body:JSON.stringify(payload),signal});
 if(!response.ok){
  let msg='',failure=null;
  try{failure=await response.json();msg=failure?.error?.message||''}catch{}
  recordRequestUsage({provider:c.imageProvider,model:c.imageModel,channel:'image',purpose:'image-generation',success:false,payload:failure});
  throw new Error(`HTTP ${response.status}${msg?`: ${msg.slice(0,180)}`:''}`);
 }
 let json;
 try{json=await response.json()}
 catch(e){recordRequestUsage({provider:c.imageProvider,model:c.imageModel,channel:'image',purpose:'image-generation',success:false});throw e}
 recordRequestUsage({provider:c.imageProvider,model:c.imageModel,channel:'image',purpose:'image-generation',success:true,payload:json});
 const image=json?.data?.[0];
 if(!image)throw new Error('EMPTY_RESPONSE');
 if(image.b64_json){const mime=/^image\/(png|jpeg|webp)$/.test(image.media_type||'')?image.media_type:'image/png';return {data:`data:${mime};base64,${image.b64_json}`,prompt:truncate(prompt,1000)}};
 if(image.url&&/^https:\/\//i.test(image.url))return {data:image.url,prompt:truncate(prompt,1000)};
 throw new Error('BAD_RESPONSE');
}
