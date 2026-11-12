import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {BASELINE} from '../src/data.js';
import {MAX_ZOOM} from '../src/canvas.js';
import {WORKSPACE_KEY,captureWorkspace,restoreWorkspace,readWorkspace,writeWorkspace} from '../src/workspace-session.mjs';

const branches=[{id:'B',events:[{id:'e'}],facts:[{id:'f'}],knowledge:[{id:'k'}]}];
const state={branches,activeId:'B',tab:'event',selected:{kind:'event',id:'e',branchId:'B'},mobilePanel:true,input:'还没提交的历史输入',factQuery:'制度',databaseTab:'dialogue',coreDrafts:{B:'未发送的问题'},imageDrafts:{B:'未生成的图片描述'}};
const camera={year:1024.25,zoom:78.5,vertical:-123};
function memoryStorage(){const values=new Map();return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)}}

test('reload round-trip restores the active world, inspection, camera, queries, drafts and scroll positions',()=>{
 const storage=memoryStorage(),before=structuredClone(state);
 const snapshot=captureWorkspace(state,camera,{panelScroll:156,chatScroll:290,openDetails:[0,2]});
 assert.equal(writeWorkspace(storage,snapshot),true);
 const restored=readWorkspace(storage,branches);
 for(const key of ['activeId','tab','selected','mobilePanel','input','factQuery','databaseTab','coreDrafts','imageDrafts'])assert.deepEqual(restored[key],snapshot[key]);
 assert.deepEqual(restored.viewport,camera);assert.equal(restored.panelScroll,156);assert.equal(restored.chatScroll,290);
 assert.deepEqual(restored.openDetails,[0,2]);
 assert.deepEqual(state,before);assert.equal(storage.values.size,1);assert.ok(storage.values.has(WORKSPACE_KEY));
});

test('workspace snapshots exclude credentials, model configuration, world content and live request flags',()=>{
 const snapshot=captureWorkspace({...state,key:'secret',imageKey:'private',config:{key:'other-secret'},busy:{running:true},questionBusy:true,imageBusy:true,controller:{},modal:'clarification'},camera);
 for(const key of ['key','imageKey','config','branches','chats','busy','questionBusy','imageBusy','controller'])assert.equal(Object.hasOwn(snapshot,key),false,key);
 assert.equal(snapshot.modal,null);
 assert.equal(restoreWorkspace({...snapshot,busy:{running:true},key:'secret'},branches).busy,undefined);
});

test('missing, malformed, future and blocked storage safely fall back without touching world data',()=>{
 const storage=memoryStorage();assert.equal(readWorkspace(storage,branches),null);
 for(const raw of ['{bad','null','[]','{"version":99}']){storage.setItem(WORKSPACE_KEY,raw);assert.equal(readWorkspace(storage,branches),null)}
 const blocked={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}};
 assert.equal(readWorkspace(blocked,branches),null);assert.equal(writeWorkspace(blocked,captureWorkspace(state,camera)),false);
});

test('deleted worlds and stale inspections are not reopened',()=>{
 const raw=captureWorkspace(state,camera);
 const restored=restoreWorkspace(raw,[]);
 assert.equal(restored.activeId,null);assert.equal(restored.tab,'overview');assert.equal(restored.selected,null);
 assert.deepEqual(restored.coreDrafts,{});assert.deepEqual(restored.imageDrafts,{});
 const stale=restoreWorkspace({...raw,selected:{kind:'event',id:'deleted',branchId:'B'}},branches);
 assert.equal(stale.tab,'world');assert.equal(stale.selected,null);
});

test('baseline events, generated facts and valid cluster selections survive restoration',()=>{
 const raw=captureWorkspace(state,camera);
 const baseline=restoreWorkspace({...raw,activeId:null,selected:{kind:'event',id:BASELINE[0].id}},branches);
 assert.equal(baseline.tab,'event');assert.equal(baseline.selected.id,BASELINE[0].id);
 const fact=restoreWorkspace({...raw,tab:'fact',selected:{kind:'fact',id:'k'}},branches);
 assert.equal(fact.tab,'fact');assert.equal(fact.selected.id,'k');
 const group=restoreWorkspace({...raw,tab:'cluster',selected:{kind:'cluster',branchId:'B',eventIds:['e','deleted']}},branches);
 assert.equal(group.tab,'cluster');assert.deepEqual(group.selected.eventIds,['e']);
});

test('invalid camera numbers are ignored and finite zoom stays within supported bounds',()=>{
 const raw=captureWorkspace(state,camera);
 assert.equal(restoreWorkspace({...raw,viewport:{year:0,zoom:Infinity,vertical:0}},branches).viewport,null);
 const restored=restoreWorkspace({...raw,viewport:{year:1939,zoom:1e9,vertical:-1e9}},branches);
 assert.deepEqual(restored.viewport,{year:1939,zoom:MAX_ZOOM,vertical:-900});
});

test('unchanged snapshots do not rewrite storage on pointer or scroll notifications',()=>{
 const storage=memoryStorage();let writes=0;const set=storage.setItem;storage.setItem=(...args)=>{writes++;set(...args)};
 const snapshot=captureWorkspace(state,camera);
 writeWorkspace(storage,snapshot);writeWorkspace(storage,snapshot);
 assert.equal(writes,1);
 writeWorkspace(storage,{...snapshot,input:''});assert.equal(writes,2);
 assert.equal(readWorkspace(storage,branches).input,'');
});

test('startup applies the saved camera after world selection and restores scroll after first render',()=>{
 const source=readFileSync('src/app.js','utf8');
 const code=source.slice(source.indexOf('function mount(){'),source.indexOf('function setupPanelResize(){'));
 const nodes=new Map(),events=[],frames=[];
 const element=()=>({textContent:'',scrollTop:0,addEventListener(){},querySelectorAll:()=>[]});
 const $=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id)};
 const savedWorkspace={viewport:camera,panelScroll:156,chatScroll:290,openDetails:[]};
 const context={$,state:{lang:'zh'},savedWorkspace,restoringWorkspace:true,canvas:null,root:{innerHTML:'',addEventListener(){}},
  WorldCanvas:class{constructor(){Object.assign(this,{year:1,zoom:.36,vertical:0})}invalidate(){}},icon:()=>'',document:{documentElement:{},addEventListener(){}},
  render(){context.canvas.vertical=500},setupPanelResize(){},setInterval(){},rotateExample(){},importFile(){},handleClick(){},handleSubmit(){},handleInput(){},handleKey(){},scheduleWorkspaceSave(){},saveWorkspaceNow(){},
  requestAnimationFrame:fn=>frames.push(fn),window:{addEventListener:(...args)=>events.push(args)},FIRST_YEAR:-3000,LAST_YEAR:2026,displayYear:String};
 runInNewContext(code+';mount()',context);
 assert.equal(context.canvas.year,camera.year);assert.equal(context.canvas.zoom,camera.zoom);assert.equal(context.canvas.vertical,camera.vertical);
 frames.forEach(fn=>fn());assert.equal($('panel-content').scrollTop,156);assert.equal($('chat-log').scrollTop,290);assert.equal(context.restoringWorkspace,false);
 assert.ok(events.some(([name])=>name==='pagehide'));
});
