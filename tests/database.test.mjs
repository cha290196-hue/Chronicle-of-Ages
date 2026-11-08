import test from 'node:test';
import assert from 'node:assert/strict';
import {EXAMPLES} from '../src/examples.js';
import {dialogueEntries,sanitizeChats,askCore} from '../src/core.js';

test('one hundred distinct bilingual examples are ready for the composer',()=>{
 assert.equal(EXAMPLES.length,100);
 for(const lang of ['zh','en']){assert.equal(new Set(EXAMPLES.map(x=>x[lang])).size,100);assert.ok(EXAMPLES.every(x=>x[lang].trim().length>8))}
});
test('dialogue records contain complete successful exchanges only',()=>{
 const messages=[{role:'user',content:'A?'},{role:'assistant',content:'A answer'},{role:'user',content:'failed'},{role:'assistant',content:'network error',error:true},{role:'user',content:'pending'}];
 assert.deepEqual(dialogueEntries(messages),[{question:'A?',answer:'A answer',index:0}]);
});
test('import restores baseline and matching world chats while ignoring unrelated data',()=>{
 const result=sanitizeChats({baseline:[{role:'user',content:'base'}],branch:[{role:'user',content:'a'},{role:'assistant',content:'failed',error:true}],other:[{role:'user',content:'other'}]},['branch']);
 assert.deepEqual(Object.keys(result).sort(),['baseline','branch']);
 assert.equal(result.branch[1].error,true);
 assert.deepEqual(Object.keys(sanitizeChats(undefined,['branch'])),[]);
});
