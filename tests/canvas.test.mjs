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
