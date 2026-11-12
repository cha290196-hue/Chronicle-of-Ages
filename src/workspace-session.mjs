import {BASELINE} from './data.js';
import {MIN_ZOOM,MAX_ZOOM} from './canvas.js';

export const WORKSPACE_KEY='chronicle-of-ages-workspace-v1';
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const text=value=>typeof value==='string'?value:'';
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const tabs=new Set(['overview','archive','knowledge','core','world','event','fact','cluster','image']);
function selection(value){
 if(!object(value)||!['event','fact','cluster'].includes(value.kind))return null;
 const out={kind:value.kind,branchId:typeof value.branchId==='string'?value.branchId:null,source:value.source==='database'?'database':null};
 if(value.kind==='cluster')out.eventIds=Array.isArray(value.eventIds)?value.eventIds.filter(id=>typeof id==='string'):[];
 else {out.id=text(value.id);if(!out.id)return null}
 return out;
}
function view(value){
 if(!object(value)||!finite(value.year)||!finite(value.zoom)||!finite(value.vertical))return null;
 return {year:value.year,zoom:clamp(value.zoom,MIN_ZOOM,MAX_ZOOM),vertical:clamp(value.vertical,-900,900)};
}
function scroll(value){return finite(value)?Math.max(0,value):0}
function openDetails(value){return Array.isArray(value)?value.filter(index=>Number.isInteger(index)&&index>=0):[]}
function drafts(value,validIds){
 if(!object(value))return {};
 return Object.fromEntries(Object.entries(value).filter(([id,draft])=>validIds.has(id)&&typeof draft==='string'));
}
export function captureWorkspace(state,canvas,positions={}){
 // Whitelist UI state; connection credentials and running requests are never copied.
 return {version:1,activeId:state.activeId??null,tab:state.tab,selected:selection(state.selected),
  mobilePanel:!!state.mobilePanel,modal:state.modal==='settings'?'settings':null,
  input:text(state.input),factQuery:text(state.factQuery),databaseTab:state.databaseTab==='dialogue'?'dialogue':'created',
  coreDrafts:{...state.coreDrafts},imageDrafts:{...state.imageDrafts},
  viewport:view(canvas),panelScroll:scroll(positions.panelScroll),chatScroll:scroll(positions.chatScroll),openDetails:openDetails(positions.openDetails)};
}
export function restoreWorkspace(raw,branches=[],baselineKnowledge=[]){
 if(!object(raw)||raw.version!==1)return null;
 const ids=new Set(branches.map(b=>b.id)),draftIds=new Set(['baseline',...ids]);
 const activeId=ids.has(raw.activeId)?raw.activeId:null;
 let selected=selection(raw.selected),tab=tabs.has(raw.tab)?raw.tab:'overview';
 const events=new Set([...BASELINE,...branches.flatMap(b=>b.events||[])].map(e=>e.id));
 const facts=new Set([...baselineKnowledge,...branches.flatMap(b=>[...(b.facts||[]),...(b.knowledge||[])])].map(f=>f.id));
 if(selected?.branchId&&!ids.has(selected.branchId))selected=null;
 if(selected?.kind==='event'&&!events.has(selected.id))selected=null;
 if(selected?.kind==='fact'&&!facts.has(selected.id))selected=null;
 if(selected?.kind==='cluster'){
  selected.eventIds=selected.eventIds.filter(id=>events.has(id));
  if(!selected.eventIds.length)selected=null;
 }
 if(['event','fact','cluster'].includes(tab)&&selected?.kind!==tab)tab=activeId?'world':'overview';
 if(tab==='world'&&!activeId)tab='overview';
 return {activeId,tab,selected,mobilePanel:!!raw.mobilePanel,modal:raw.modal==='settings'?'settings':null,
  input:text(raw.input),factQuery:text(raw.factQuery),databaseTab:raw.databaseTab==='dialogue'?'dialogue':'created',
  coreDrafts:drafts(raw.coreDrafts,draftIds),imageDrafts:drafts(raw.imageDrafts,draftIds),
  viewport:view(raw.viewport),panelScroll:scroll(raw.panelScroll),chatScroll:scroll(raw.chatScroll),openDetails:openDetails(raw.openDetails)};
}
export function readWorkspace(storage,branches,baselineKnowledge){
 try{return restoreWorkspace(JSON.parse(storage.getItem(WORKSPACE_KEY)||'null'),branches,baselineKnowledge)}catch{return null}
}
export function writeWorkspace(storage,snapshot){
 try{const value=JSON.stringify(snapshot);if(storage.getItem(WORKSPACE_KEY)!==value)storage.setItem(WORKSPACE_KEY,value);return true}catch{return false}
}
