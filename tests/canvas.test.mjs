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
