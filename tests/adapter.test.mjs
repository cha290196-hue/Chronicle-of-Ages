import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateOmega} from '../src/chronicle-adapter.mjs';

const a={kind:'earth_intrusion',scope:'earth',mode:'point',startYear:1234,endYear:1234,target:'Earth arrival',value:'yes',description:'A fictional fleet reaches Earth'};
test('adapter keeps questions out of the historical edit path',async()=>{
 const callChat=async()=>({intent:'question',valid:true,operations:[]});
 await assert.rejects(()=>simulateOmega({prompt:'What happened in Rome?',callChat,makeId:()=> 'x'}),/NOT_AN_EDIT/);
});