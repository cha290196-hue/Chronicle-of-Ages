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
test('core retrieves older related dialogue as context without mutating the world',async()=>{
 const prior=globalThis.fetch,requests=[];
 globalThis.fetch=async(_url,opts)=>{const payload=JSON.parse(opts.body);requests.push(payload);const content=payload.response_format?.type==='json_object'?JSON.stringify({draftAnswer:'Possible chronology',newFacts:[],unresolved:[]}):'A reply';return {ok:true,json:async()=>({choices:[{message:{content}}]})}};
 const branch={id:'world',anchorYear:1200,events:[],facts:[],inherited:{events:[],facts:[]},titleEn:'World',summaryEn:'History',prompt:'Change'};
 const before=structuredClone(branch),history=[{role:'user',content:'Explain the astronomical guild'},{role:'assistant',content:'The guild was founded in 1500.'}];
 for(let i=0;i<10;i++)history.push({role:'user',content:`Unrelated topic ${i}`},{role:'assistant',content:`Response ${i}`});
 try{const out=await askCore({question:'How did the astronomical guild change?',branch,branches:[branch],history,config:{provider:'custom',endpoint:'https://example.com/chat',model:'mock',key:'x'}});assert.equal(out,'A reply');assert.deepEqual(branch,before);assert.equal(requests.length,2,'the question runs a fresh exploration and a natural-answer synthesis');const system=requests[0].messages[0].content;const prompt=requests[0].messages[1].content;assert.match(prompt,/astronomical guild/);assert.match(prompt,/The guild was founded in 1500/);assert.match(system,/2026-01-01/);assert.match(system,/new branch/);}finally{globalThis.fetch=prior}
});
