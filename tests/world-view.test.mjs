import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

test('worldline selection and overview show the same full-history view',()=>{
 const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
 const code=source.slice(source.indexOf('function renderPanel(){'),source.indexOf('function renderArchive(){'));
 const branch={id:'b',parentId:null,anchorYear:123,events:[{id:'event',year:200,en:'Event',origin:'derived'}],facts:[{id:'fact'}],impacts:['Impact'],certainty:'low'};
 const state={tab:'world',mobilePanel:true,branches:[branch],lang:'en'};
 const classes={toggle(){}};const panel={classList:classes,hidden:false,closest:()=>({classList:classes}),setAttribute(){}};
 const content={style:{},innerHTML:''};const nodes={'panel':panel,'panel-content':content,'mobile-scrim':{classList:classes}};
 const context={state,$:id=>nodes[id],active:()=>branch,BASELINE:[],worldEvents:()=>[{id:'inherited'},{id:'event'}],worldFacts:()=>[{id:'fact'},{id:'other'}],worldTitle:b=>b?'A world':'Reality',summary:()=>'Summary',tr:key=>key,h:value=>String(value??''),icon:()=>'',displayYear:y=>String(y),eventLabel:e=>e.en};
 runInNewContext(code+';renderPanel()',context);const selected=content.innerHTML;
 state.tab='overview';runInNewContext('renderPanel()',context);
 assert.equal(content.innerHTML,selected);
 assert.match(selected,/metric-value">2/);
 assert.match(selected,/data-action="delete-branch"/);
 assert.match(selected,/data-value="core"/);
 assert.doesNotMatch(selected,/worldBorn/);
});
