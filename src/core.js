import {sanitizeSimulation} from './world-model.mjs';
import {simulatePromptWorld,explorePromptWorld} from './chronicle-adapter.mjs';
import {sanitizePromptWorldline} from './prompt-world.mjs';
import {recordRequestUsage} from './usage-meter.mjs';
import {usageBillingProvider} from './deepseek-pricing.mjs';
import {parseModelJSON,normalizeModelContent,ModelJSONError} from './structured-output.mjs';
import {sanitizeKnowledge} from './exploration-knowledge.mjs';
import {BASELINE,validYear} from './data.js';
import {migrateTextModel} from './model-routing.mjs';
import {readChatStream} from './chat-stream.mjs';

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
 if(code==='PROMPT_OUTPUT_INVALID')return lang==='zh'?'模型返回的结果缺少显示或保存所需的数据格式，请重试。':'The model response is missing data needed for display or storage. Please retry.';
 if(code==='MODEL_COMPLETION_INTERRUPTED'){
  const reasons={insufficient_system_resource:['模型服务资源不足，中途停止了生成。','The model service stopped generation because resources were unavailable.'],
   aborted:['模型服务中途取消了生成。','The model service aborted generation.'],content_filter:['模型服务拦截了这次生成。','The model service filtered this generation.']};
  return (reasons[error.reason]||['模型服务未完成本次生成。','The model service did not complete this generation.'])[lang==='zh'?0:1]+(lang==='zh'?'未保存本次结果。':' No result was saved.');
 }
 if(code==='MODEL_OUTPUT_CONTRACT')return lang==='zh'?'模型服务没有返回约定的完整结构，本次推演未保存。':'The provider did not return the required complete structure. No result was saved.';
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
 * OpenAI-compatible transport for world creation and Core exploration.
 * A bad 200-OK JSON body is a model format problem, not an API connection problem.
 * Recovery retries the JSON task once with a concise JSON-only instruction.
 * Never accept a partially parsed JSON object as confirmed worldline data.
 */
export async function callChat(config,messages,{signal,json=false,temperature=.35,maxTokens=3200,purpose='other',stage='other',reasoning=false,profile=null,onProgress=null}={}){
 const promptLed=profile==='prompt-llm';
 const c=safeConfig(config);
 if(!configured(c))throw new Error('NOT_CONFIGURED');
 if(!validEndpoint(c.endpoint))throw new Error('INVALID_ENDPOINT');
 const meteredProvider=usageBillingProvider(c.provider,c.endpoint);
 const endpoint=c.endpoint;
 const baseBody={model:c.model,messages,temperature,max_tokens:maxTokens,stream:false};
 if(promptLed&&typeof onProgress==='function'){baseBody.stream=true;baseBody.stream_options={include_usage:true}}
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
 const doCall=async({format=json,recovery=false,previousFailure=null,omitTokenLimit=false,omitStreamOptions=false,disableStream=false}={})=>{
  const startedAt=Date.now();
  const elapsed=()=>Math.max(0,Date.now()-startedAt);
  const body={...baseBody};
  if(omitStreamOptions||disableStream)delete body.stream_options;
  if(disableStream)body.stream=false;
  onProgress?.({status:'waiting',receivedChars:0});
  if(omitTokenLimit)delete body.max_tokens;
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
  try{payload=/text\/event-stream/i.test(response.headers?.get('content-type')||'')
    ?await readChatStream(response,{signal,onProgress:onProgress||undefined}):await response.json()}
  catch(e){recordRequestUsage({provider:meteredProvider,model:c.model,purpose,stage,elapsedMs:elapsed(),success:false});throw e}
  recordRequestUsage({provider:meteredProvider,model:c.model,purpose,stage,elapsedMs:elapsed(),success:true,payload});
  const choice=payload?.choices?.[0];
  const message=choice?.message||{};
  if(['insufficient_system_resource','aborted','content_filter'].includes(choice?.finish_reason))
   throw Object.assign(new Error('MODEL_COMPLETION_INTERRUPTED'),{code:'MODEL_COMPLETION_INTERRUPTED',reason:choice.finish_reason});
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
   if(!json||signal?.aborted)throw first;
  const unsupportedFormat=first?.status===400||first?.status===422;
  const malformed=first?.message==='INVALID_JSON';
  if(promptLed){
   if(first?.reason==='truncated')throw first;
   if(unsupportedFormat&&baseBody.stream&&/stream_options|include_usage/i.test(first.message))return doCall({omitStreamOptions:true});
   if(unsupportedFormat&&baseBody.stream&&/\bstream(?:ing)?\b/i.test(first.message))return doCall({disableStream:true});
   if(unsupportedFormat&&/max[_ -]?(?:tokens|completion[_ -]?tokens)|output[_ -]?tokens/i.test(first.message))return doCall({omitTokenLimit:true});
   if(unsupportedFormat&&!/response_format|json[\s_-]?(?:object|mode)/i.test(first.message))throw first;
   if(unsupportedFormat||malformed)return doCall({format:!unsupportedFormat,recovery:malformed});
   throw first;
  }
  if(!unsupportedFormat&&!malformed)throw first;
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
 if(input?.simulation?.version===4)return sanitizePromptWorldline(input);
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
 * One model-led generation creates the world; code only adapts display/storage.
 * Legacy admission, graph, coverage and review engines are not called here.
 */
export async function simulate({prompt,branches=[],parentId=null,config,lang='en',signal,onProgress=()=>{},autoComplete=false,clarifications=[],budgetMs}) {
 if(!configured(config))throw new Error('NOT_CONFIGURED');
 try{
  const {worldline}=await simulatePromptWorld({
   prompt,branches,parentId,baseline:BASELINE,config,lang,signal,onProgress,
   callChat,makeId,clarifications
  });
  return worldline;
 }catch(error){
  if(signal?.aborted||error?.code==='ABORTED')throw new DOMException('Aborted','AbortError');
  throw error;
 }
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
 * The model answers and supplies world settings in the same response.
 * This function does not mutate state; the app saves settings with the dialogue.
 */
export async function exploreCore({question,branch,branches=[],config,lang='en',history=[],signal,baselineKnowledge=[]}){
 question=truncate(question,1800).trim();if(!question)throw new Error('EMPTY_QUESTION');
 return explorePromptWorld({question,branch,events:worldEvents(branches,branch),
  facts:branch?worldFacts(branches,branch):baselineKnowledge,config,lang,history,signal,callChat,makeId});
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
