import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldCanvas,MAX_ZOOM,fitCanvasText} from '../src/canvas.js';

test('terminal events have a distinct hit target from the worldline selection tip',()=>{
 const ctx=new Proxy({measureText:()=>({width:40})},{get:(o,k)=>k in o?o[k]:()=>{}});
 const canvas=Object.create(WorldCanvas.prototype);
 Object.assign(canvas,{ctx,width:1200,height:800,zoom:1,lang:'en',hit:[],x:year=>1000+(year-2026),nodeActive:()=>true});
 canvas.nodes([{id:'endpoint-event',year:2026,en:'A terminal event'}],400,'B',true);
 canvas.drawTip(1000,400,'B',true);
 assert.equal(canvas.nearest(1000,372).event.id,'endpoint-event');
 assert.equal(canvas.nearest(1000,400).kind,'tip');
});

test('same-year clusters expose every event through a list instead of repeatedly selecting the first',()=>{
 const events=[{id:'a',year:1700},{id:'b',year:1700},{id:'c',year:1700}];
 let opened=null,focused=false;
 const canvas=Object.create(WorldCanvas.prototype);
 Object.assign(canvas,{zoom:MAX_ZOOM,onCluster:(all,id)=>{opened={all,id}},focus:()=>{focused=true},onEvent:()=>assert.fail('must not discard siblings')});
 canvas.zoomCluster({cluster:events,branchId:'B'});
 assert.deepEqual(opened,{all:events,id:'B'});assert.equal(focused,false);
});

test('cluster selection increases zoom and centers around the selected period',()=>{
 let target;
 const view={zoom:.36,focus:(year,zoom)=>{target=[year,zoom]}};
 WorldCanvas.prototype.zoomCluster.call(view,{cluster:[{year:1939},{year:1969}]});
 assert.equal(target[0],1954);
 assert.ok(target[1]>.36 && target[1]<=MAX_ZOOM);
});

test('a cluster at maximum zoom remains selectable',()=>{
 let selected;
 const events=[{id:'a',year:2020},{id:'b',year:2020}];
 const view={zoom:MAX_ZOOM,onEvent:(event,branchId)=>selected=[event.id,branchId]};
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

test('wheel zoom passes the former limit, keeps the pointer year fixed and reverses at the new limit',()=>{
 for(const mobile of [false,true]){
  const view=Object.create(WorldCanvas.prototype);
  Object.assign(view,{mobile,width:1200,year:1939,zoom:12,clearTooltip(){},invalidate(){},onYear(){}});
  const pointer=340,year=view.at(pointer);let prevented=0;
  view.wheel({deltaY:-10000,offsetX:pointer,preventDefault(){prevented++}});
  assert.equal(view.zoom,MAX_ZOOM);assert.ok(view.zoom>12);
  assert.ok(Math.abs(view.at(pointer)-year)<1e-9);
  view.wheel({deltaY:120,offsetX:pointer,preventDefault(){prevented++}});
  assert.ok(view.zoom<MAX_ZOOM);assert.ok(view.zoom>12);
  assert.ok(Math.abs(view.at(pointer)-year)<1e-9);assert.equal(prevented,2);
 }
});

test('long multilingual labels are shortened by measured width with complete Unicode characters',()=>{
 const ctx={measureText:text=>({width:Array.from(text).reduce((n,c)=>n+(c.charCodeAt(0)>127?12:6),0)})};
 for(const text of ['世界历史重大事件与工业化进程中的制度变化','Unusually wide historical event WWWWWWWWWWW','历史📚事件与世界🌍发展']){
  const fitted=fitCanvasText(ctx,text,80);
  assert.ok(ctx.measureText(fitted).width<=80);
  assert.ok(fitted.endsWith('…'));assert.ok(text.startsWith(fitted.slice(0,-1)));
  assert.equal(fitted.isWellFormed(),true);
 }
 assert.equal(fitCanvasText(ctx,'short',80),'short');
 assert.equal(fitCanvasText(ctx,'wide',1),'');
});

test('event and branch titles retain natural glyph widths while font size increases with zoom',()=>{
 const titleSizes=[];
 for(const zoom of [.36,12,MAX_ZOOM])for(const width of [390,1200])for(const lang of ['zh','en']){
  const records=[];
  const base={font:'10px system-ui',letterSpacing:'1px',measureText(text){
   const size=Number(/([\d.]+)px/.exec(this.font)[1]);
   return {width:Array.from(text).reduce((n,c)=>n+size*(c.charCodeAt(0)>127?1:.64),0)};
  },fillText(...args){records.push({args,font:this.font,width:this.measureText(args[0]).width,letterSpacing:this.letterSpacing})}};
  const ctx=new Proxy(base,{get:(o,k)=>k in o?o[k]:()=>{}});
  const view=Object.create(WorldCanvas.prototype);
  const event={id:'long',year:1900,zh:'世界历史重大事件的完整标题不得横向挤压变形以及国际制度变迁',en:'WWWWWWWWWW: International historical developments and institutional transformation'};
  Object.assign(view,{ctx,width,height:800,zoom,lang,hit:[],active:'b',hover:{event},x:()=>200,nodeActive:()=>true});
  view.nodes([event],400,'b',true);
  titleSizes.push(Number(/([\d.]+)px/.exec(records[0].font)[1]));
  view.drawBranchTrace=()=>({curveEnd:180,y:300});
  view.branch({id:'b',titleZh:event.zh,titleEn:event.en},0);
  assert.equal(records.length,3);
  for(const record of records){
   assert.equal(record.args.length,3,'fillText must not compress text with a maxWidth argument');
   assert.equal(record.letterSpacing,'0px');
   assert.ok(record.args[1]+record.width<=width-12+1e-9,'labels must fit the viewport at their natural width');
  }
 }
 assert.ok(Math.max(...titleSizes)>Math.min(...titleSizes));
 assert.ok(Math.min(...titleSizes)>=12);
});
