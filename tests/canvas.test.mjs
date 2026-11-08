import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldCanvas} from '../src/canvas.js';

test('same-year clusters expose every event through a list instead of repeatedly selecting the first',()=>{
 const events=[{id:'a',year:1700},{id:'b',year:1700},{id:'c',year:1700}];
 let opened=null,focused=false;
 const canvas=Object.create(WorldCanvas.prototype);
 Object.assign(canvas,{zoom:12,onCluster:(all,id)=>{opened={all,id}},focus:()=>{focused=true},onEvent:()=>assert.fail('must not discard siblings')});
 canvas.zoomCluster({cluster:events,branchId:'B'});
 assert.deepEqual(opened,{all:events,id:'B'});assert.equal(focused,false);
});

test('cluster selection increases zoom and centers around the selected period',()=>{
 let target;
 const view={zoom:.36,focus:(year,zoom)=>{target=[year,zoom]}};
 WorldCanvas.prototype.zoomCluster.call(view,{cluster:[{year:1939},{year:1969}]});
 assert.equal(target[0],1954);
 assert.ok(target[1]>.36 && target[1]<=12);
});

test('a cluster at maximum zoom remains selectable',()=>{
 let selected;
 const events=[{id:'a',year:2020},{id:'b',year:2020}];
 const view={zoom:12,onEvent:(event,branchId)=>selected=[event.id,branchId]};
 WorldCanvas.prototype.zoomCluster.call(view,{cluster:events,branchId:'world-2'});
 assert.deepEqual(selected,['a','world-2']);
});

test('mobile historical origin is centered and baseline clears bottom dock',()=>{
 const view={mobile:true,width:390,height:786,year:1,zoom:.36,vertical:0};
 const center=WorldCanvas.prototype.x.call(view,1);
 assert.equal(center,195);
 assert.equal(WorldCanvas.prototype.at.call(view,center),1);
 assert.equal(WorldCanvas.prototype.baseY.call(view),359);
});

test('desktop chronology projection remains unchanged',()=>{
 const view={mobile:false,width:1200,height:700,year:1680,zoom:.36,vertical:0};
 assert.equal(WorldCanvas.prototype.x.call(view,1680),648);
 assert.equal(WorldCanvas.prototype.at.call(view,648),1680);
 assert.equal(WorldCanvas.prototype.baseY.call(view),413);
});

test('touch pointer movement never leaves a timeline hover tooltip',()=>{
 const previous=globalThis.document,tooltip={hidden:false};
 globalThis.document={getElementById:()=>tooltip};
 try{
  const view=Object.create(WorldCanvas.prototype);
  Object.assign(view,{mobile:true,hover:{event:{id:'e'}},drag:null,pinching:null,pointers:new Map(),el:{style:{}},hit:[],invalidate(){},nearest(){throw Error('mobile hover must not inspect nodes')}});
  view.pointerMove({pointerType:'touch',pointerId:1,offsetX:30,offsetY:40});
  assert.equal(tooltip.hidden,true);
  assert.equal(view.hover,null);
 }finally{globalThis.document=previous}
});
test('desktop hover clears immediately upon leaving the canvas',()=>{
 const previous=globalThis.document,tooltip={hidden:true,style:{}};
 globalThis.document={getElementById:()=>tooltip};
 try{
  const view=Object.create(WorldCanvas.prototype);
  Object.assign(view,{mobile:false,lang:'en',width:400,height:500,hover:null,drag:null,pinching:null,pointers:new Map(),el:{style:{}},invalidate(){},nearest(){return {cluster:[{year:100},{year:101}]}}});
  view.pointerMove({pointerType:'mouse',pointerId:1,offsetX:110,offsetY:140});
  assert.equal(tooltip.hidden,false);
  assert.match(tooltip.textContent,/2 events/);
  view.clearTooltip();
  assert.equal(tooltip.hidden,true);
  assert.equal(view.hover,null);
 }finally{globalThis.document=previous}
});
test('pointer cancellation hides tooltip without selecting an event',()=>{
 const previous=globalThis.document,tooltip={hidden:false};
 globalThis.document={getElementById:()=>tooltip};
 try{
  let clicked=0;
  const view=Object.create(WorldCanvas.prototype);
  Object.assign(view,{mobile:true,hover:{event:{id:'x'}},drag:{x:50,y:50,year:1,vertical:0,moved:false},pinching:null,pointers:new Map([[5,{x:50,y:50}]]),el:{style:{}},onYear(){},onEvent(){clicked++},nearest(){return {event:{id:'x'}}},invalidate(){}});
  view.pointerUp({pointerType:'touch',pointerId:5,offsetX:50,offsetY:50},true);
  assert.equal(clicked,0);
  assert.equal(tooltip.hidden,true);
 }finally{globalThis.document=previous}
});

test('selected grandchild carries the baseline and all ancestor segments',()=>{
 const root={id:'b',parentId:null,anchorYear:123,timeMode:'point',events:[]};
 const child={id:'c',parentId:'b',anchorYear:800,timeMode:'gradual',transitionEndYear:830,events:[]};
 const view=Object.create(WorldCanvas.prototype);
 Object.assign(view,{active:'c',branches:[root,child],_lineage:null});
 assert.deepEqual(view.selectedLineage().map(x=>x.id),['b','c']);
 assert.equal(view.nodeActive(null,100),true);
 assert.equal(view.nodeActive(null,200),false);
 assert.equal(view.nodeActive('b',500),true);
 assert.equal(view.nodeActive('b',1000),false);
 assert.equal(view.nodeActive('c',900),true);
});
test('line segments are not click targets; only 2026 tips choose a world',()=>{
 const view=Object.create(WorldCanvas.prototype);
 view.mobile=true;view.hit=[{kind:'tip',x:300,y:110,branchId:'c'},{x:160,y:110,event:{id:'e'},branchId:'b'}];
 assert.equal(view.nearest(160,110).event.id,'e');
 assert.equal(view.nearest(250,110),null);
 assert.equal(view.nearest(299,110).branchId,'c');
});
test('touching a branch endpoint selects it but event nodes only inspect',()=>{
 const previous=globalThis.document;globalThis.document={getElementById:()=>null};
 try{
 const view=Object.create(WorldCanvas.prototype);
 let switches=[],inspected=[];
 Object.assign(view,{mobile:true,hover:null,pointers:new Map(),pinching:null,drag:{moved:false},el:{style:{}},invalidate(){},onYear(){},onBranch:id=>switches.push(id),onEvent:(e)=>inspected.push(e.id),nearest:()=>({kind:'tip',branchId:'c'})});
 view.pointerUp({pointerId:1,offsetX:50,offsetY:50});
 assert.deepEqual(switches,['c']);
 view.drag={moved:false};view.nearest=()=>({event:{id:'e'},branchId:'b'});view.pointerUp({pointerId:2,offsetX:40,offsetY:40});
 assert.deepEqual(inspected,['e']);assert.equal(switches.length,1);
 }finally{globalThis.document=previous}
});
test('gradual worldlines use a dotted bend while point forks stay solid',()=>{
 const calls=[],ctx=new Proxy({}, {get(_t,key){if(key==='setLineDash')return v=>calls.push([...v]);if(key==='save'||key==='restore'||key==='beginPath'||key==='moveTo'||key==='bezierCurveTo'||key==='lineTo'||key==='stroke'||key==='rect'||key==='clip')return()=>{};return undefined},set(){return true}});
 const view=Object.create(WorldCanvas.prototype);
 Object.assign(view,{ctx,width:500,height:400,year:100,zoom:1,vertical:0,mobile:true,branches:[],active:null});
 view.drawBranchTrace({id:'g',parentId:null,anchorYear:120,timeMode:'gradual',transitionEndYear:170},0);
 assert.ok(calls.some(d=>d[0]===6));
 calls.length=0;
 view.drawBranchTrace({id:'p',parentId:null,anchorYear:120,timeMode:'point',transitionEndYear:120},0);
 assert.ok(!calls.some(d=>d.length));
});
