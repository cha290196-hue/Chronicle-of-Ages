import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldCanvas} from '../src/canvas.js';

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
