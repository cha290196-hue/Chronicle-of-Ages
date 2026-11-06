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
export function extractJSON(content){
 if(object(content))return content;
 let text=String(content??'').trim();
 text=text.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
 try{return JSON.parse(text)}catch{}
 const left=text.indexOf('{'),right=text.lastIndexOf('}');
 if(left>=0&&right>left){try{return JSON.parse(text.slice(left,right+1))}catch{}}
 throw new Error('INVALID_JSON');
}
export function explainError(error,lang='en'){
 if(error?.name==='AbortError'||error?.message==='ABORTED')return lang==='zh'?'推演已停止。':'Simulation stopped.';
 if(error?.message==='INVALID_JSON'||error?.message==='BAD_RESPONSE')return lang==='zh'?'模型返回格式无效，请重试或更换模型。':'The model returned invalid structured data. Try another model.';
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
export async function callChat(config,messages,{signal,json=false,temperature=.35,maxTokens=3200}={}){
 const c=safeConfig(config);
 if(!configured(c))throw new Error('NOT_CONFIGURED');
 if(!validEndpoint(c.endpoint))throw new Error('INVALID_ENDPOINT');
 const body={model:c.model,messages,temperature,max_tokens:maxTokens,stream:false};
 if(json)body.response_format={type:'json_object'};
 if(c.provider==='deepseek'){body.thinking={type:json?'disabled':'enabled'};if(!json)body.max_tokens=Math.max(maxTokens,8192)}
 const doCall=async(format)=>{
  const options={method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${c.key}`},body:JSON.stringify(format?body:{...body,response_format:undefined}),signal};
  if(c.provider==='openrouter')options.headers['HTTP-Referer']=location.origin;
  let response;
  try{response=await fetch(c.endpoint,options)}catch(e){if(signal?.aborted)throw new DOMException('Aborted','AbortError');throw e}
  if(!response.ok){let detail='';try{const err=await response.json();detail=err?.error?.message||err?.message||''}catch{}const ex=new Error(`HTTP ${response.status}${detail?`: ${detail.slice(0,220)}`:''}`);ex.status=response.status;throw ex}
  const payload=await response.json();
  let result=payload?.choices?.[0]?.message?.content;
  if(Array.isArray(result))result=result.map(a=>a.text||'').join('\n');
  if(!result&&payload?.choices?.[0]?.message?.refusal)throw new Error(payload.choices[0].message.refusal);
  if(!result)throw new Error('EMPTY_RESPONSE');
  return json?extractJSON(result):String(result);
 };
 try{return await doCall(json)}catch(e){if(json&&(e?.status===400||e?.status===422)&&!signal?.aborted)return await doCall(false);throw e}
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
  const cap=Math.min(atYear,...chain.filter(c=>c.parentId===b.id).map(c=>c.anchorYear).concat([atYear]));
  for(const e of list(b.events))if(e.year<=cap)events.push({...e});
  for(const f of list(b.facts))if(f.firstYear<=cap)facts.push({...f});
 }
 return {events:uniq(events),facts:uniq(facts)};
}
function uniq(items){return [...new Map(items.map(item=>[item.id,item])).values()]}
export function worldEvents(branches,branch){if(!branch)return BASELINE;let root=branch,visited=new Set();while(root.parentId&&!visited.has(root.id)){visited.add(root.id);const p=branches.find(b=>b.id===root.parentId);if(!p)break;root=p;}return uniq([...BASELINE.filter(e=>e.year<root.anchorYear),...list(branch.inherited?.events),...list(branch.events)]).sort((a,b)=>a.year-b.year)}
export function worldFacts(branches,branch){return branch?uniq([...list(branch.inherited?.facts),...list(branch.facts)]):[]}
export function baselineContext(year,count=20){
 const sorted=[...BASELINE].sort((a,b)=>Math.abs(a.year-year)-Math.abs(b.year-year));
 return sorted.slice(0,count).sort((a,b)=>a.year-b.year).map(e=>`${e.year} ${e.en}: ${e.descriptionEn}`).join('\n');
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
 const scrubEvent=e=>object(e)&&validYear(e.year)&&toText(e.en||e.title)&&toText(e.id)?{...e,id:truncate(e.id,100),en:plain(e.en||e.title),zh:plain(e.zh||e.en||e.title),descriptionEn:plain(e.descriptionEn||''),descriptionZh:plain(e.descriptionZh||''),origin:e.origin==='user'?'user':'derived',category:truncate(e.category,40)}:null;
 const scrubFact=f=>object(f)&&validYear(f.firstYear)&&toText(f.id)&&toText(f.nameEn)?{...f,id:truncate(f.id,100),nameEn:plain(f.nameEn),nameZh:plain(f.nameZh||f.nameEn),descriptionEn:plain(f.descriptionEn),descriptionZh:plain(f.descriptionZh),kind:truncate(f.kind,60)}:null;
 return {id:truncate(input.id,100),parentId:toText(input.parentId)||null,anchorYear:input.anchorYear,prompt:truncate(input.prompt,2000),type:truncate(input.type||'historical_change',50),titleEn:plain(input.titleEn),titleZh:plain(input.titleZh||input.titleEn),summaryEn:plain(input.summaryEn),summaryZh:plain(input.summaryZh||input.summaryEn),createdAt:truncate(input.createdAt,40),events:input.events.slice(0,200).map(scrubEvent).filter(Boolean),facts:input.facts.slice(0,200).map(scrubFact).filter(Boolean),inherited:{events:list(input.inherited?.events).slice(0,200).map(scrubEvent).filter(Boolean),facts:list(input.inherited?.facts).slice(0,200).map(scrubFact).filter(Boolean)},impacts:list(input.impacts).slice(0,8).map(x=>plain(x)),certainty:truncate(input.certainty||'medium',20),image:object(input.image)?{data:toText(input.image.data).slice(0,5_000_000),prompt:plain(input.image.prompt)}:null};
}
export async function simulate({prompt,branches=[],parentId=null,config,lang='en',signal,onProgress=()=>{}}){
 prompt=truncate(prompt,2000);if(!prompt)throw new Error('EMPTY_PROMPT');if(!configured(config))throw new Error('NOT_CONFIGURED');
 const parent=branches.find(b=>b.id===parentId)||null;
 const inheritedForValidation=parent?{events:worldEvents(branches,parent).slice(-45),facts:worldFacts(branches,parent).slice(-70)}:{events:[],facts:[]};
 onProgress({phase:'validation',index:0,total:1});
 const assessment=await callChat(config,[
  {role:'system',content:CONTEXT},
  {role:'user',content:`Validate this proposed edit. It MUST refer to Earth, its recorded past, a real physical constant, or a dated fictional event explicitly happening on Earth. An edit to branch-derived knowledge is allowed only if supplied in the parent world data. For fictional arrivals on Earth, mark earth_intrusion, which is valid even though it did not happen in reality. Assessments need not reject physically impossible changes to actual constants. Return JSON {"valid":boolean,"reasonEn":string,"reasonZh":string,"anchorYear":integer,"type":"historical_change|earth_intrusion|physical_constant|branch_fact","changeEn":string,"changeZh":string}. User change: ${JSON.stringify(prompt)}. Parent world local records: ${JSON.stringify(inheritedForValidation).slice(0,10000)}. Nearest known baseline: ${baselineContext(explicitYears(prompt)[0]??1500,24)}.`}
 ],{signal,json:true,maxTokens:1000,temperature:.12});
 if(assessment.valid!==true)throw new Error(`ANCHOR_INVALID${assessment.reasonEn?`: ${truncate(lang==='zh'?assessment.reasonZh:assessment.reasonEn,180)}`:''}`);
 const year=nYear(assessment.anchorYear);if(!validYear(year))throw new Error('ANCHOR_INVALID');if(parent&&year<parent.anchorYear)throw new Error('ANCHOR_PRECEDES_PARENT');
 const explicit=explicitYears(prompt);if(explicit.length&&Math.min(...explicit.map(x=>Math.abs(x-year)))>2&&assessment.type!=='physical_constant')throw new Error('ANCHOR_INVALID');
 const knownChange=['historical_change','earth_intrusion','physical_constant','branch_fact'].includes(assessment.type)?assessment.type:'historical_change';
 if(knownChange==='branch_fact'&&!parent)throw new Error('ANCHOR_INVALID');
 const inherited=inheritedState(branches,parentId,year),segments=planSegments(year);
 const branch={id:makeId(),parentId:parent?.id||null,anchorYear:year,prompt,type:knownChange,createdAt:new Date().toISOString(),titleEn:'',titleZh:'',summaryEn:'',summaryZh:'',events:[],facts:[],inherited,impacts:[],certainty:'medium',image:null};
 const prior=parent?`${parent.titleEn}\n${parent.summaryEn}`:'Recorded Earth baseline';
 for(let i=0;i<segments.length;i++){
  if(signal?.aborted)throw new DOMException('Aborted','AbortError');
  const range=segments[i];onProgress({phase:'propagation',index:i,total:segments.length});
  const recent=branch.events.slice(-32);const facts=worldFacts(branches,branch).slice(-65);
  const data=await callChat(config,[
   {role:'system',content:CONTEXT},
   {role:'user',content:`Perform checkpoint ${i+1}/${segments.length} for [${range[0]}, ${range[1]}], inclusive. Earth divergence: ${JSON.stringify({prompt,year,type:knownChange,changeEn:assessment.changeEn,changeZh:assessment.changeZh})}. Parent state: ${prior}. Inherited facts/events before divergence: ${JSON.stringify(inherited).slice(0,14500)}. This branch's already computed events: ${JSON.stringify(recent).slice(0,14500)}. Accumulated knowledge: ${JSON.stringify(facts).slice(0,12000)}. Relevant baseline comparison ONLY (not assumed to happen after divergence): ${baselineContext(Math.round((range[0]+range[1])/2),16)}. Show realistic causal chains through multiple domains with non-magical second-order consequences. Ensure each event is within [${range[0]},${range[1]}], minimum 3 and maximum 7 consequential events unless the interval is extremely short, and every event includes causes naming earlier entities/events or explicitly the initial change. New technologies, people, institutions and concepts are represented in facts with firstYear, and must not predate their causes. No silent resets to our history. Maintain continuity and uncertainty. OUTPUT JSON {"events":[{"year":integer,"en":string,"zh":string,"descriptionEn":string,"descriptionZh":string,"category":"science|technology|culture|governance|exploration|conflict|society|other","certainty":"high|medium|low","causes":[string]}],"facts":[{"firstYear":integer,"nameEn":string,"nameZh":string,"descriptionEn":string,"descriptionZh":string,"kind":string,"certainty":"high|medium|low"}],"stateEn":string,"stateZh":string}.`}
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
  {role:'user',content:`Reconcile the generated worldline to 2026-01-01, with a concise readable snapshot. Do not imply certainty or disguise speculative changes as historical records. Identify any significant causal tensions in the forecast. Output JSON {"titleEn":string,"titleZh":string,"summaryEn":string,"summaryZh":string,"impacts":[string],"certainty":"low|medium|high"}. Original edit: ${prompt}. Computed events: ${JSON.stringify(branch.events).slice(0,22000)}. New facts: ${JSON.stringify(branch.facts).slice(0,12000)}. Previous state: ${branch.summaryEn}.`}
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
function terms(text){return (String(text).toLowerCase().match(/[a-z0-9]{3,}|[\u3400-\u9fff]{2,}/g)||[]).slice(0,25)}
function rank(query,item){const hay=JSON.stringify(item).toLowerCase();return terms(query).reduce((score,term)=>score+(hay.includes(term)?term.length:0),0)}
export function retrieveWorld(branches,branch,query,limit=24){
 const events=worldEvents(branches,branch),facts=worldFacts(branches,branch);
 return {events:[...events].sort((a,b)=>rank(query,b)-rank(query,a)).slice(0,limit),facts:[...facts].sort((a,b)=>rank(query,b)-rank(query,a)).slice(0,limit)};
}
export async function askCore({question,branch,branches,config,lang='en',history=[],signal}){
 const local=retrieveWorld(branches,branch,question);
 const identity=branch?{title:branch.titleEn,summary:branch.summaryEn,year:branch.anchorYear,change:branch.prompt,impacts:branch.impacts}:'Recorded Earth baseline through 2026-01-01';
 const system=`You are the analysis core for one specific version of Earth through 2026-01-01. Respond in ${lang==='zh'?'Chinese':'English'}. Answer the user's question directly and use the supplied branch/world database. Do not import historical facts from the baseline after a divergence as certain unless established by this branch. Distinguish documented Earth history, branch-generated details, and open possibilities. Explain causal links where relevant, and make reasonable extrapolations when the data is incomplete; mark extrapolations clearly. Do not change the saved timeline during an answer. World: ${JSON.stringify(identity)}. Relevant records: ${JSON.stringify(local).slice(0,22000)}.`;
 return await callChat(config,[{role:'system',content:system},...history.slice(-8).map(x=>({role:x.role==='assistant'?'assistant':'user',content:truncate(x.content,2500)})),{role:'user',content:truncate(question,1800)}],{signal,temperature:.5,maxTokens:1900});
}
export async function generateImage({prompt,branch,config,signal}){
 const c=safeConfig(config);if(!imageConfigured(c))throw new Error('IMAGE_NOT_CONFIGURED');if(!validEndpoint(c.imageEndpoint))throw new Error('INVALID_ENDPOINT');
 const context=branch?`${branch.titleEn}. ${branch.summaryEn} Key historical features: ${branch.events.slice(-10).map(e=>e.en).join('; ')}.`:'Recorded Earth history';
 const payload={model:c.imageModel,prompt:`Illustrate this specific Earth timeline with historically and materially consistent details. ${context} Requested view: ${truncate(prompt,1100)}. Documentary visual treatment, no text labels.`,size:'1024x1024',n:1};
 const response=await fetch(c.imageEndpoint,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${c.imageKey}`},body:JSON.stringify(payload),signal});
 if(!response.ok){let msg='';try{msg=(await response.json())?.error?.message||''}catch{}throw new Error(`HTTP ${response.status}${msg?`: ${msg.slice(0,180)}`:''}`)}
 const json=await response.json(),image=json?.data?.[0];
 if(!image)throw new Error('EMPTY_RESPONSE');
 if(image.b64_json){const mime=/^image\/(png|jpeg|webp)$/.test(image.media_type||'')?image.media_type:'image/png';return {data:`data:${mime};base64,${image.b64_json}`,prompt:truncate(prompt,1000)}};
 if(image.url&&/^https:\/\//i.test(image.url))return {data:image.url,prompt:truncate(prompt,1000)};
 throw new Error('BAD_RESPONSE');
}