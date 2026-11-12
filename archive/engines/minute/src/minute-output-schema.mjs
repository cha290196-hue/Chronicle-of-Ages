/** Provider-enforced structure for the complete world and its field-patch audits.
 * No event/prose quotas belong here. Graph/content checks remain authoritative.
 */
const string={type:'string'},integer={type:'integer'},boolean={type:'boolean'};
const object=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const array=items=>({type:'array',items});
const choice=(...values)=>({type:'string',enum:values});
const nullable=schema=>({anyOf:[schema,{type:'null'}]});
const strings=array(string);
const region=choice('east-asia','south-asia','west-central-asia','europe','africa','americas','oceania');
const affectedRegion=choice(...region.enum,'global');
const domain=choice('politics','economy','society','science-technology','environment','culture');
const year={type:'integer',minimum:-3200,maximum:2026};
const bilingual=object({en:string,zh:string});
const question=object({en:string,zh:string,options:array(bilingual)});
const admission=object({
 intent:choice('edit','question','irrelevant'),decision:choice('accept','clarify','reject'),valid:boolean,
 reasonEn:string,reasonZh:string,earthRelevance:choice('direct','mechanistic','none','unknown'),
 materiality:choice('material','negligible','unknown'),criticalUnknowns:strings,questions:array(question),
 completions:array(object({field:string,en:string,zh:string})),preservedContext:array(bilingual),uncertaintyNotes:array(bilingual),
 causalBridge:array(object({mechanism:string,evidenceIds:strings,support:choice('established','user-premise','branch-supported')})),
 operations:array(object({kind:choice('historical_change','earth_intrusion','branch_fact','physical_constant'),scope:choice('earth'),
  mode:choice('point','gradual'),startYear:year,endYear:year,target:string,
  value:{anyOf:[string,{type:'number'},boolean,{type:'null'}]},parentFactId:nullable(string),description:string,temporalBasis:string,assumptions:strings}))
});
const eventFields={id:string,y:year,t:string,d:string,c:strings,r:array(affectedRegion),k:domain,s:{type:'integer',minimum:1,maximum:4}};
const event=object(eventFields);
const conditionFields={id:string,t:string,r:array(affectedRegion),k:domain};
const condition=object(conditionFields);
const domainState=object({k:domain,t:string,refs:strings,unknowns:strings});
const regionState=object({r:region,t:string,refs:strings,unknowns:strings,domains:array(domainState)});
const settingFields=Object.fromEntries(domain.enum.map(k=>[k,string]));
const quietPeriod=object({to:year,t:string,refs:strings});
export const MINUTE_WORLD_SCHEMA=object({admission,world:nullable(object({
 title:string,summary:string,conditions:array(condition),
 trajectories:array(object({r:region,events:array(event),quiet:nullable(string),refs:strings})),
 effects:array(event),regions:array(regionState),setting:object(settingFields),quietPeriods:array(quietPeriod),limits:strings
}))});
const patch=(fields,identity)=>object(Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,k===identity?v:nullable(v)])));
const edits=object({
 events:array(patch(eventFields,'id')),conditions:array(patch({...conditionFields,y:year},'id')),drop:strings,
 regions:array(patch({r:region,t:string,refs:strings,unknowns:strings,domains:array(patch({k:domain,t:string,refs:strings,unknowns:strings},'k'))},'r')),
 quietPeriods:nullable(array(quietPeriod)),
 trajectories:nullable(array(object({r:region,eventIds:strings,quiet:nullable(string),refs:strings}))),
 setting:nullable(object(Object.fromEntries(domain.enum.map(k=>[k,nullable(string)])))),
 title:nullable(string),summary:nullable(string),
 text:array(object({kind:choice('event','condition','region','domain','setting'),id:nullable(string),r:nullable(region),k:nullable(domain),
  field:choice('t','d',...domain.enum),from:string,to:string}))
});
export const MINUTE_AUDIT_SCHEMA=object({verdict:choice('pass','repair','reject','clarify'),reason:nullable(string),
 issues:array(object({id:nullable(string),code:string})),notes:strings,questions:array(question),edits:nullable(edits)});

export function strictMinuteRequest(config,stage){
 let endpoint;try{endpoint=new URL(config?.endpoint)}catch{return null}
 if(endpoint.protocol!=='https:'||endpoint.hostname!=='api.deepseek.com'||
  !['/chat/completions','/v1/chat/completions','/beta/chat/completions'].includes(endpoint.pathname.replace(/\/$/,'')))return null;
 if(!['minute-world','minute-review','minute-graph-repair','minute-repair'].includes(stage))return null;
 endpoint.pathname='/beta/chat/completions';
 const name=stage==='minute-world'?'submit_complete_world':'submit_world_audit';
 return {endpoint:endpoint.href,tool:{type:'function',function:{name,strict:true,
  description:stage==='minute-world'?'Submit the admission and entire conditional Earth history. Preserve the full historical content contract.':'Submit the audit verdict and only actual field/text patches to the supplied world.',
  parameters:stage==='minute-world'?MINUTE_WORLD_SCHEMA:MINUTE_AUDIT_SCHEMA}}};
}

/** Validate even a provider claiming strict mode; never trust an ignored schema. */
export function outputSchemaIssue(value,schema,path='$'){
 if(schema.anyOf)return schema.anyOf.some(s=>!outputSchemaIssue(value,s,path))?null:path;
 if(schema.enum&&!schema.enum.includes(value))return path;
 if(schema.type==='null')return value===null?null:path;
 if(schema.type==='object'){
  if(!value||typeof value!=='object'||Array.isArray(value))return path;
  for(const key of schema.required)if(!Object.hasOwn(value,key))return path+'.'+key;
  for(const key of Object.keys(value)){
   if(!Object.hasOwn(schema.properties,key))return path+'.'+key;
   const issue=outputSchemaIssue(value[key],schema.properties[key],path+'.'+key);if(issue)return issue;
  }
  return null;
 }
 if(schema.type==='array'){
  if(!Array.isArray(value))return path;
  for(let i=0;i<value.length;i++){const issue=outputSchemaIssue(value[i],schema.items,path+'['+i+']');if(issue)return issue}
  return null;
 }
 if(schema.type==='integer'){if(!Number.isInteger(value))return path}
 else if(schema.type==='number'){if(typeof value!=='number'||!Number.isFinite(value))return path}
 else if(typeof value!==schema.type)return path;
 if(schema.minimum!==undefined&&value<schema.minimum||schema.maximum!==undefined&&value>schema.maximum)return path;
 return null;
}

/** Strict audit schemas require nullable placeholders. Remove only absent PATCH
 * fields, preserving every non-null string/value and all substantive world data.
 */
export function normalizeMinuteAudit(result){
 const clean=value=>Array.isArray(value)?value.map(clean):value&&typeof value==='object'
  ?Object.fromEntries(Object.entries(value).filter(([,v])=>v!==null).map(([k,v])=>[k,clean(v)])):value;
 const out=clean(result);
 if(out.edits)for(const [key,value]of Object.entries(out.edits))if(Array.isArray(value)&&!value.length)delete out.edits[key];
 return out;
}
