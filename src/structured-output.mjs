/**
 * Normalization of OpenAI-compatible content and strict internal JSON objects.
 * A partial or syntactically damaged generation is never accepted as a fact.
 * No raw provider output is logged or stored.
 */
export function normalizeModelContent(content){
 if(typeof content==='string')return content;
 if(Array.isArray(content))return content.map(part=>{
  if(typeof part==='string')return part;
  if(!part||typeof part!=='object')return '';
  if(typeof part.text==='string')return part.text;
  if(typeof part.content==='string')return part.content;
  return '';
 }).filter(Boolean).join('\n');
 return '';
}
export class ModelJSONError extends Error{
 constructor(reason='non_json'){
  super('INVALID_JSON');
  this.name='ModelJSONError';
  this.code='MODEL_JSON_INVALID';
  this.reason=reason;
 }
}
function parseObject(text){
 try{
  const obj=JSON.parse(text);
  return obj&&typeof obj==='object'&&!Array.isArray(obj)?obj:null;
 }catch{return null}
}
export function parseModelJSON(input){
 if(input&&typeof input==='object'&&!Array.isArray(input))return input;
 let text=normalizeModelContent(input).trim();
 if(!text)throw new ModelJSONError('empty');
 text=text.replace(/^\uFEFF/,'').trim();
 // Common model wrappers, but do not silently "fix" invalid JSON content.
 const fenced=text.match(/^```(?:json|JSON)?\s*([\s\S]*?)\s*```\s*$/);
 if(fenced)text=fenced[1].trim();
 const direct=parseObject(text);
 if(direct)return direct;
 // Permit introductory or trailing prose by extracting the first complete
 // TOP-LEVEL JSON object. Never salvage a nested object from a truncated root.
 const first=text.indexOf('{'),firstArray=text.indexOf('[');
 if(first<0)throw new ModelJSONError('non_json');
 if(firstArray>=0&&firstArray<first&&/^[\s\S]*?\[\s*\{/.test(text.slice(0,first+1)))
  throw new ModelJSONError('not_object');
 let depth=0,inString=false,escaped=false;
 for(let i=first;i<text.length;i++){
  const ch=text[i];
  if(inString){
   if(escaped)escaped=false;
   else if(ch==='\\')escaped=true;
   else if(ch==='"')inString=false;
   continue;
  }
  if(ch==='"'){inString=true;continue}
  if(ch==='{')depth++;
  if(ch==='}'){
   depth--;
   if(depth===0){
    const extracted=parseObject(text.slice(first,i+1));
    if(extracted)return extracted;
    throw new ModelJSONError('invalid_syntax');
   }
  }
 }
 throw new ModelJSONError('incomplete');
}
