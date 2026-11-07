import test from 'node:test';
import assert from 'node:assert/strict';
import {formatAnswer} from '../src/answer-format.js';

test('renders headings and emphasis without showing markdown markers',()=>{
 const result=formatAnswer('### 标题\n\n自由的**说明**\n- 一个条目');
 assert.match(result,/<div class="answer-heading">标题<\/div>/);
 assert.match(result,/<strong>说明<\/strong>/);
 assert.match(result,/answer-bullet/);
 assert.doesNotMatch(result,/###|\*\*/);
});
test('escapes untrusted model output even inside code blocks',()=>{
 const result=formatAnswer('### <img src=x onerror=alert(1)>\n```html\n<script>alert(1)</script>\n```');
 assert.doesNotMatch(result,/<img|<script/);
 assert.match(result,/&lt;img/);
 assert.match(result,/&lt;script&gt;/);
});
test('plain prose stays intact without an imposed structure',()=>{
 assert.equal(formatAnswer('第一句。\n第二句。'),'<div>第一句。</div><div>第二句。</div>');
});

test('core displays the waiting animation only for the world being queried',async()=>{
 const {readFileSync}=await import('node:fs');
 const {runInNewContext}=await import('node:vm');
 const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
 const code=source.slice(source.indexOf('function renderCore(){'),source.indexOf('function currentMode('));
 const panel={style:{},innerHTML:''},log={scrollTop:0,scrollHeight:0};
 const state={chats:{branch:[{role:'user',content:'是什么？'}]},questionBusy:true,pendingChatKey:'branch',lang:'zh'};
 const context={$:id=>id==='panel-content'?panel:log,active:()=>({id:'branch'}),state,tr:key=>key,worldTitle:()=>'',h:x=>String(x),formatAnswer,icon:()=>''};
 runInNewContext(code+';renderCore()',context);
 assert.match(panel.innerHTML,/class="thinking-dots"/);
 assert.match(panel.innerHTML,/role="status"/);
 state.pendingChatKey='other';runInNewContext('renderCore()',context);
 assert.doesNotMatch(panel.innerHTML,/class="thinking-dots"/);
});
