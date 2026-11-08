/**
 * Retry a failed structured historical window by partitioning TIME first,
 * then independent REGIONAL / DOMAIN scopes for a single indivisible year.
 * Never turns truncation into empty history or deletes finished work.
 * Every successful partition is audited by the caller before it is committed.
 */
import {tick,untick} from './ucm-omega.mjs';
const REGIONS=[
 {region:'East Asia, South Asia, Southeast Asia and Oceania'},
 {region:'West Asia, Central Asia and Africa'},
 {region:'Europe and adjacent interactions'},
 {region:'North and South America, and global cross-regional systems'}
];
const DOMAINS=[
 'governance, international relations, war, law and institutions',
 'science, technology, economy, infrastructure and trade',
 'society, population, environment, culture and other consequential processes'
];
export function isStructuredOutputFailure(error){
 return error?.message==='INVALID_JSON'||error?.code==='MODEL_JSON_INVALID';
}
export class WindowExpansionError extends Error{
 constructor(message,window){
  super(message);this.code=message;this.window=window;
 }
}
export async function runAdaptiveWindow({window,execute,onSplit=()=>{},signal,maxDepth=12,maxTasks=72}){
 if(typeof execute!=='function')throw new TypeError('execute required');
 let attempts=0,expansions=0;
 async function visit(w,depth,focus){
  if(signal?.aborted)throw new WindowExpansionError('ABORTED',w);
  if(++attempts>maxTasks)throw new WindowExpansionError('WINDOW_EXPANSION_LIMIT',w);
  try{return [await execute(w,{depth,focus,attempt:attempts})]}
  catch(error){
   if(signal?.aborted)throw new WindowExpansionError('ABORTED',w);
   if(!isStructuredOutputFailure(error))throw error;
   if(depth>=maxDepth)throw new WindowExpansionError('WINDOW_EXPANSION_LIMIT',w);
   const a=tick(w.from),b=tick(w.to);
   let children;
   if(a<b){
    const mid=Math.floor((a+b)/2);
    children=[
     {window:{from:untick(a),to:untick(mid)},focus},
     {window:{from:untick(mid+1),to:untick(b)},focus}
    ];
   }else if(!focus){
    children=REGIONS.map(region=>({window:w,focus:region}));
   }else if(!focus.domain){
    children=DOMAINS.map(domain=>({window:w,focus:{...focus,domain}}));
   }else{
    throw new WindowExpansionError('WINDOW_SCOPE_TOO_DENSE',w);
   }
   expansions++;
   onSplit({window:w,depth,reason:error?.reason||'invalid_json',children:children.length,focus});
   const out=[];
   for(const part of children)out.push(...await visit(part.window,depth+1,part.focus));
   return out;
  }
 }
 const results=await visit(window,0,null);
 return {results,attempts,expansions};
}
