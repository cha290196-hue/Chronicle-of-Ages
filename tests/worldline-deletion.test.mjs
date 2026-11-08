import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {planWorldlineDeletion} from '../src/worldline-deletion.mjs';

const branches=[
 {id:'B',parentId:null,titleZh:'明朝延续'},
 {id:'C',parentId:'B',titleZh:'明朝延续后的分叉'},
 {id:'D',parentId:null,titleZh:'独立的其他分支'},
 {id:'E',parentId:'C',titleZh:'C 的后继'},
 {id:'F',parentId:'D',titleZh:'D 的后继'}
];
const chats={baseline:[{role:'user',content:'real'}],B:[1],C:[2],D:[3],E:[4],F:[5]};

test('selected worldline deletion cascades to descendants and preserves unrelated parallel histories',()=>{
 const before=structuredClone(branches),saved=structuredClone(chats);
 const plan=planWorldlineDeletion(branches,'B',chats);
 assert.deepEqual([...plan.removedIds].sort(),['B','C','E']);
 assert.equal(plan.removedCount,3);
 assert.equal(plan.descendantCount,2);
 assert.deepEqual(plan.branches.map(x=>x.id),['D','F']);
 assert.deepEqual(Object.keys(plan.chats).sort(),['D','F','baseline']);
 assert.deepEqual(branches,before,'preview must be pure before confirmation');
 assert.deepEqual(chats,saved,'chat history must not mutate before confirmation');
});
test('leaf deletion removes exactly one chosen line and keeps its parent/siblings',()=>{
 const result=planWorldlineDeletion(branches,'C',chats);
 assert.deepEqual([...result.removedIds].sort(),['C','E']);
 assert.deepEqual(result.branches.map(x=>x.id),['B','D','F']);
 assert.equal(result.chats.B[0],1);
});
test('baseline and invalid or absent selections cannot be deleted',()=>{
 assert.equal(planWorldlineDeletion(branches,null,chats),null);
 assert.equal(planWorldlineDeletion(branches,'',chats),null);
 assert.equal(planWorldlineDeletion(branches,'baseline',chats),null);
 assert.equal(planWorldlineDeletion(branches,'unknown',chats),null);
 assert.equal(planWorldlineDeletion([], 'B', chats),null);
});
test('malformed cyclic parent references cannot trap deletion in an infinite loop',()=>{
 const broken=[{id:'X',parentId:'Y'},{id:'Y',parentId:'X'},{id:'Z',parentId:null}];
 const result=planWorldlineDeletion(broken,'X',{X:[1],Y:[2],Z:[3]});
 assert.equal(result.removedCount,2);
 assert.deepEqual(result.branches.map(x=>x.id),['Z']);
 assert.deepEqual(Object.keys(result.chats),['Z']);
});
test('composer displays a delete action only for an active branch and handles it without form submit',async()=>{
 const app=await readFile('src/app.js','utf8');
 const css=await readFile('assets/style.css','utf8');
 assert.match(app,/active\(\)\?\x60<button type="button" class="composer-delete"/);
 assert.match(app,/data-action="delete-selected-worldline"/);
 assert.match(app,/action==='delete-selected-worldline'\?state\.activeId/);
 assert.match(app,/const plan=planWorldlineDeletion\(state\.branches,id,state\.chats\)/);
 assert.match(app,/if\(!confirm\(message\)\)return/);
 assert.match(app,/if\(!persist\(\)\)/);
 assert.match(css,/\.composer-parent-name\{overflow:hidden;text-overflow:ellipsis/);
 assert.match(css,/\.composer-delete:disabled/);
});
