import {sanitizeSimulation} from './world-model.mjs';
import {exploreWorld} from './world-exploration.mjs';
import { simulateMinute } from './chronicle-adapter.mjs';
import {recordRequestUsage} from './usage-meter.mjs';
import {usageBillingProvider} from './deepseek-pricing.mjs';
import {parseModelJSON,normalizeModelContent,ModelJSONError} from './structured-output.mjs';
import {auditKnowledge,sanitizeKnowledge,summarizeKnowledge} from './exploration-knowledge.mjs';
import {BASELINE,validYear} from './data.js';
import {migrateTextModel} from './model-routing.mjs';
import {strictMinuteRequest,outputSchemaIssue,normalizeMinuteAudit} from './minute-output-schema.mjs';

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
 c.model=migrateTextModel(c.model).slice(0,180);c.imageModel=String(c.imageModel||'').trim().slice(0,180);
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
 if(code==='MODEL_COMPLETION_INTERRUPTED'){
  const reasons={insufficient_system_resource:['模型服务资源不足，中途停止了生成。','The model service stopped generation because resources were unavailable.'],
   aborted:['模型服务中途取消了生成。','The model service aborted generation.'],content_filter:['模型服务拦截了这次生成。','The model service filtered this generation.']};
  return (reasons[error.reason]||['模型服务未完成本次生成。','The model service did not complete this generation.'])[lang==='zh'?0:1]+(lang==='zh'?'未保存本次结果。':' No result was saved.');
 }
 if(code==='MODEL_OUTPUT_CONTRACT')return lang==='zh'?'模型服务没有返回约定的完整结构，本次推演未保存。':'The provider did not return the required complete structure. No result was saved.';
 if(code==='MINUTE_DEADLINE')return lang==='zh'?'两分钟的推演预算已用完，未保存未完成的世界线。请重试或使用响应更快的模型。':'The two-minute inference budget expired. No incomplete worldline was saved. Retry or use a faster responding model.';
 if(code==='MINUTE_REVIEW_REJECTED')return (lang==='zh'?'这次宏观推演未通过内容审查。':'This macro history did not pass content review.')+((error.reason||error[lang==='zh'?'reasonZh':'reasonEn'])?' '+(error.reason||error[lang==='zh'?'reasonZh':'reasonEn']):'');
 if(code.startsWith('MINUTE_'))return (lang==='zh'?'模型的完整世界结果未通过检查，未保存世界线。':'The complete world result failed validation. No worldline was saved.')+' ['+code+']';
 if(code==='INTAKE_MODEL_INVALID'){
  const cause=String(error.causeCode||'INTAKE_INVALID');
  return (lang==='zh'?'模型对输入的解析在自动修正后仍未通过检查，请重试；这不表示你的历史设想无效。':'The model could not encode the input after automatic repair. Retry; this does not establish that your premise is invalid.')+' ['+cause+']';
 }
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
 if(code.startsWith('EXPLORATION_'))return lang==='zh'?'本次世界细节补全未通过一致性检查，未写入新设定，请重试。':'This world-detail completion did not pass consistency checks. No new settings were stored; please retry.';
 if(code==='NOT_AN_EDIT')return lang==='zh'?'这是历史问答，不是历史修改；请使用演算中枢进行提问。':'This is a history question, not an edit. Ask it in the Analysis Core.';
 if(code==='OUT_OF_SCOPE'||code==='NOT_EARTH_ANCHORED')return lang==='zh'?'请输入以地球历史为起点的修改。':'Provide an edit anchored in Earth history.';
 if(code==='ANCHOR_PRECEDES_PARENT')return lang==='zh'?'修改不能早于选中世界线的分叉点。':'The edit cannot predate the selected worldline fork.';
 if(code==='INVALID_YEAR')return lang==='zh'?'年份须在公元前3200年至2026年之间，且不存在公元0年。':'Years must be within 3200 BCE–2026 CE; there is no year zero.';
 if(['ANCHOR_INVALID','INVALID_TIME_RANGE','UNKNOWN_BRANCH_FACT','UNKNOWN_BRANCH_FACT_AT_ANCHOR','CONTRADICTORY_INTERVENTIONS','EMPTY_OR_EXCESSIVE_INTERVENTION','UNKNOWN_INTERVENTION_KIND','INVALID_TIME_MODE','MISSING_TARGET'].includes(code))
  return (lang==='zh'?'干预的时间或事实引用未通过检查，请查看检查详情。':'The intervention time or fact reference failed validation. See admission details.')+' ['+code+']';
 if(code==='NO_VALID_TRAJECTORY')return lang==='zh'?'模型未能生成可通过因果校验的结果，请重新推演。':'The model could not produce a causally valid result. Try again.';
 if(['WINDOW_EXPANSION_LIMIT','WINDOW_SCOPE_TOO_DENSE'].includes(code))
  return lang==='zh'?'该历史时段已自动按时间、地区和领域拆分，但当前模型仍无法完整生成某个子任务。系统没有用空数据替代历史，请检查模型输出上限或换用容量更高的模型。':'The engine split this historical period by time, region and domain, but the model still could not complete a subsection. No partial or empty history was substituted; check the output capacity.';
 if(code==='GLOBAL_CAUSAL_AUDIT_FAILED')
  return lang==='zh'?'所有子推演已完成，但全局因果一致性复核未通过。世界线未保存，请重新推演。':'Global causal review found inconsistent cross-window dependencies. No partial worldline was saved.';
 if(error?.name==='AbortError'||error?.message==='ABORTED')return lang==='zh'?'推演已停止。':'Simulation stopped.';
 if(error?.message==='INVALID_JSON'||error?.message==='BAD_RESPONSE'){
  const reason=error?.reason;
  const phase=error?.minuteDiagnostics?.stage||error?.phase;
   const phaseZh=phase==='minute-world'?'全球宏观推演':phase==='minute-review'?'完整世界审查':['minute-graph-repair','minute-repair'].includes(phase)?'世界结果修正':phase==='validation'?'历史干预识别':phase==='synthesis'?'最终世界线总结':phase==='propagation'?'历史时段推演':'结构化结果生成';
   const phaseEn=phase==='minute-world'?'computing the complete macro history':phase==='minute-review'?'reviewing the complete world':['minute-graph-repair','minute-repair'].includes(phase)?'correcting the world result':phase==='validation'?'interpreting the historical intervention':phase==='synthesis'?'summarizing the worldline':phase==='propagation'?'modeling a historical window':'structured output';
  const zhPrefix=phaseZh+'：',enPrefix='During '+phaseEn+': ';
   const retried=error?.attempts>1;
   const reasons={truncated:['模型输出达到长度上限，未获得完整内容。','Model output reached its length limit.'],
    empty:['模型返回了空白内容。','The model returned blank output.'],
    incomplete:['模型返回的数据未完整闭合。','The model returned an incomplete JSON object.'],
    invalid_syntax:['模型返回的数据有语法错误。','The model returned data with invalid JSON syntax.'],
    not_object:['模型没有返回要求的数据对象。','The model did not return the required JSON object.'],
    non_json:['模型没有按要求的数据格式返回结果。','The model did not return the required JSON data.']};
   const detail=reasons[reason]||['模型返回的数据格式错误。','The model returned malformed structured output.'];
   if(lang==='zh')return zhPrefix+detail[0]+(retried?'自动重试后仍未成功。':'')+'未保存本次结果，已有世界线不受影响。';
   return enPrefix+detail[1]+(retried?' One automatic retry also failed.':'')+' No result was saved; existing worldlines are unchanged.';
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
 * OpenAI-compatible chat bridge shared by the bounded engine and progressive discovery.
 * A bad 200-OK JSON body is a model format problem, not an API connection problem.
 * Recovery retries the JSON task once with a concise JSON-only instruction.
 * Never accept a partially parsed JSON object as confirmed worldline data.
 */
export async function callChat(config,messages,{signal,json=false,temperature=.35,maxTokens=3200,purpose='other',stage='other',reasoning=false,profile=null}={}){
 const bounded=profile==='minute';
 const c=safeConfig(config);
 if(!configured(c))throw new Error('NOT_CONFIGURED');
 if(!validEndpoint(c.endpoint))throw new Error('INVALID_ENDPOINT');
 const meteredProvider=usageBillingProvider(c.provider,c.endpoint);
 const strict=json&&bounded?strictMinuteRequest(c,stage):null;
 const endpoint=strict?.endpoint||c.endpoint;
 const baseBody={model:c.model,messages,temperature,max_tokens:maxTokens,stream:false};
 if(json)baseBody.response_format={type:'json_object'};
 if(strict){
  delete baseBody.response_format;
  baseBody.tools=[strict.tool];
  baseBody.tool_choice={type:'function',function:{name:strict.tool.function.name}};
  // A forced, strict tool encodes data; it never invokes executable code.
  baseBody.thinking={type:'disabled'};
 }
 if(c.provider==='deepseek'){
  const think=!strict&&(reasoning||(!json&&maxTokens>256));
  baseBody.thinking={type:think?'enabled':'disabled'};
  if(think){baseBody.max_tokens=bounded?maxTokens:Math.max(maxTokens,reasoning?32768:8192);baseBody.reasoning_effort=bounded?'low':'high';}
  // DeepSeek's max_tokens is an output ceiling, not pre-billed tokens.
  // Give structured historical tasks enough room to finish JSON without
  // discarding detail or paying for repeated truncation/re-generation.
  if(!bounded&&json&&purpose==='simulation')baseBody.max_tokens=Math.max(baseBody.max_tokens,8192);
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
  try{response=await fetch(endpoint,options)}
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
  if(['insufficient_system_resource','aborted','content_filter'].includes(choice?.finish_reason))
   throw Object.assign(new Error('MODEL_COMPLETION_INTERRUPTED'),{code:'MODEL_COMPLETION_INTERRUPTED',reason:choice.finish_reason});
  if(strict){
   if(choice?.finish_reason==='length')throw Object.assign(new ModelJSONError('truncated'),{finishReason:'length'});
   const calls=message.tool_calls;
   if(choice?.finish_reason!=='tool_calls'||!Array.isArray(calls)||calls.length!==1||calls[0]?.type!=='function'||calls[0].function?.name!==strict.tool.function.name)
    throw Object.assign(new Error('MODEL_OUTPUT_CONTRACT'),{code:'MODEL_OUTPUT_CONTRACT',reason:'tool_envelope'});
   let value;
   try{if(typeof calls[0].function.arguments!=='string')throw new TypeError('arguments');value=JSON.parse(calls[0].function.arguments)}
   catch{throw new ModelJSONError('invalid_syntax')}
   const field=outputSchemaIssue(value,strict.tool.function.parameters);
   if(field)throw Object.assign(new Error('MODEL_OUTPUT_CONTRACT'),{code:'MODEL_OUTPUT_CONTRACT',reason:'schema',field});
   return stage==='minute-world'?value:normalizeMinuteAudit(value);
  }
  const contentOptions={separator:json?'':'\n'};
  let result=normalizeModelContent(message.content??message.text??choice?.text??payload?.output_text,contentOptions);
  if(!result&&Array.isArray(payload?.output)){
   result=payload.output.map(item=>normalizeModelContent(item?.content,contentOptions)).filter(Boolean).join(contentOptions.separator);
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
   if(first instanceof ModelJSONError)first.attempts=1;
   if(strict||!json||signal?.aborted)throw first;
  const unsupportedFormat=first?.status===400||first?.status===422;
  const malformed=first?.message==='INVALID_JSON';
  if(!unsupportedFormat&&!malformed)throw first;
   // The minute engine supplies its shared deadline signal to BOTH attempts.
   // Recover a format failure once, but never regenerate length-limited history
   // or increase the bounded engine's transport capacity. Unrelated HTTP errors
   // cannot be repaired by changing JSON mode.
   if(bounded&&(first?.reason==='truncated'||(unsupportedFormat&&!/response_format|json[\s_-]?(?:object|mode)/i.test(first.message))))throw first;
   // Keep JSON mode for malformed bounded output; remove it only when the
   // provider explicitly rejects it. Preserve the legacy non-minute fallback.
   try{return await doCall({format:bounded&&!unsupportedFormat,recovery:true,previousFailure:first})}
  catch(second){
   if(second?.message==='INVALID_JSON'&&second instanceof ModelJSONError){
    second.attempts=2;
    if(first?.reason==='truncated'&&second.reason==='incomplete')second.reason='truncated';
   }
   throw second;
  }
 }
}
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
export function sanitizeWorldline(input){
 if(!object(input)||typeof input.id!=='string'||!validYear(input.anchorYear)||!Array.isArray(input.events)||!Array.isArray(input.facts))return null;
 const bodyText=s=>String(s??'').trim();
 const simulation=sanitizeSimulation(input.simulation);if(input.simulation&&!simulation)return null;
 const scrubEvent=e=>object(e)&&validYear(e.year)&&toText(e.en||e.title)&&toText(e.id)?{...e,id:truncate(e.id,120),causes:list(e.causes).map(x=>truncate(x,120)),links:list(e.links).filter(object),en:plain(e.en||e.title),zh:plain(e.zh||e.en||e.title),descriptionEn:bodyText(e.descriptionEn||''),descriptionZh:bodyText(e.descriptionZh||''),origin:e.origin==='user'?'user':'derived',category:truncate(e.category,40)}:null;
 const scrubFact=f=>object(f)&&validYear(f.firstYear)&&toText(f.id)&&toText(f.nameEn)?{...f,id:truncate(f.id,120),nameEn:plain(f.nameEn),nameZh:plain(f.nameZh||f.nameEn),descriptionEn:bodyText(f.descriptionEn),descriptionZh:bodyText(f.descriptionZh),kind:truncate(f.kind,60)}:null;
 const gradual=input.timeMode==='gradual',end=gradual?nYear(input.transitionEndYear):input.anchorYear;
 if(!validYear(end)||end<input.anchorYear||(gradual&&end===input.anchorYear))return null;
 return {id:truncate(input.id,100),parentId:toText(input.parentId)||null,anchorYear:input.anchorYear,timeMode:gradual?'gradual':'point',transitionEndYear:end,timeBasisEn:truncate(input.timeBasisEn||'',320),timeBasisZh:truncate(input.timeBasisZh||'',320),prompt:truncate(input.prompt,2000),type:truncate(input.type||'historical_change',50),titleEn:plain(input.titleEn),titleZh:plain(input.titleZh||input.titleEn),summaryEn:bodyText(input.summaryEn),summaryZh:bodyText(input.summaryZh||input.summaryEn),createdAt:truncate(input.createdAt,40),events:input.events.map(scrubEvent).filter(Boolean),facts:input.facts.map(scrubFact).filter(Boolean),knowledge:list(input.knowledge).map(sanitizeKnowledge).filter(Boolean),inherited:{events:list(input.inherited?.events).map(scrubEvent).filter(Boolean),facts:list(input.inherited?.facts).map(scrubFact).filter(Boolean)},impacts:list(input.impacts).slice(0,8).map(x=>plain(x)),certainty:truncate(input.certainty||'medium',20),simulation,image:object(input.image)?{data:toText(input.image.data).slice(0,5_000_000),prompt:plain(input.image.prompt)}:null};
}
/**
 * The public simulation entry point used by app.js.
 * Chronicle Minute creates a complete macro history and independently reviews it
 * within a bounded budget. The previous generators are sealed in archive/.
 */
export async function simulate({prompt,branches=[],parentId=null,config,lang='en',signal,onProgress=()=>{},autoComplete=false,clarifications=[],budgetMs}) {
 if(!configured(config))throw new Error('NOT_CONFIGURED');
 try{
  const {worldline}=await simulateMinute({
   prompt,branches,parentId,baseline:BASELINE,config,lang,signal,onProgress,
   callChat,makeId,autoComplete,clarifications,budgetMs
  });
  return worldline;
 }catch(error){
  if(signal?.aborted||error?.code==='ABORTED')throw new DOMException('Aborted','AbortError');
  throw error;
 }
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
