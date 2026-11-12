import {clarificationQuestions,clarificationAnswers,renderClarificationDrawer,renderCompletionNotes,renderIntakeDiagnostics} from './clarification.mjs';
import {BASELINE,FIRST_YEAR,LAST_YEAR,displayYear,eventLabel} from './data.js';
import {EXAMPLES} from './examples.js';
import {renderUsageDashboard} from './usage-dashboard.mjs';
import {getUsagePrice,setUsagePrice,clearUsageMeter} from './usage-meter.mjs';
import {planWorldlineDeletion} from './worldline-deletion.mjs';
import {mergeKnowledge,sanitizeKnowledge} from './exploration-knowledge.mjs';
import {formatAnswer} from './answer-format.js';
import {t} from './i18n.js?v=20261107-world-database';
import {WorldCanvas} from './canvas.js?v=20261107-tooltipfix';
import {captureWorkspace,readWorkspace,writeWorkspace} from './workspace-session.mjs';
import {DEFAULT_CONFIG,PROVIDERS,IMAGE_PROVIDERS,withTextPreset,safeConfig,configured,imageConfigured,validEndpoint,makeId,simulate,exploreCore,generateImage,explainError,worldEvents,worldFacts,sanitizeWorldline,dialogueEntries,sanitizeChats,callChat} from './core.js?v=20261107-core-answer';

const $=id=>document.getElementById(id);
const h=x=>String(x??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const icon=(name,size=18)=>{const paths={
 globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/>',
 branches:'<circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="18" cy="18" r="2"/><path d="M6 8v5c0 3 4 5 7 5h3M6 12c1-4 5-6 10-6"/>',
 database:'<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>',
 message:'<path d="M20 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-4-.95L3 20l1-4.7a8.5 8.5 0 1 1 16-3.8Z"/><path d="M8 11h8M8 14h5"/>',
 layout:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M9 9h12"/>',
 settings:'<path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="m19.4 15 .1.1 1.3 1-1.5 2.6-1.6-.6a8 8 0 0 1-2.2 1.3l-.3 1.7h-3l-.4-1.7a8 8 0 0 1-2.2-1.3L8 18.7l-1.5-2.6 1.3-1a8 8 0 0 1 0-2.6l-1.3-1L8 8.9l1.6.6a8 8 0 0 1 2.2-1.3l.4-1.7h3l.3 1.7a8 8 0 0 1 2.2 1.3l1.6-.6 1.5 2.6-1.3 1a8 8 0 0 1 0 2.5Z" transform="translate(-1 -1)"/>',
 close:'<path d="M5 5l14 14M19 5 5 19"/>',plus:'<path d="M12 5v14M5 12h14"/>',minus:'<path d="M5 12h14"/>',
 target:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
 arrow:'<path d="M4 12h16M13 5l7 7-7 7"/>',back:'<path d="m15 18-6-6 6-6"/>',
 download:'<path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/>',upload:'<path d="M12 17V4m-4 4 4-4 4 4M4 16v5h16v-5"/>',
 image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
 edit:'<path d="m14 4 6 6M3 21l4-1 13-13a2 2 0 0 0-4-4L3 16Z"/>',
 trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6"/>',
 chevron:'<path d="m9 18 6-6-6-6"/>',check:'<path d="m4 12 5 5L20 6"/>',
 layers:'<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
 search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
 box:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18M3 12h18"/>',
 moon:'<path d="M20.9 13.1A8.6 8.6 0 0 1 10.9 3.1 8.8 8.8 0 1 0 20.9 13.1Z"/>',
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>',
 expand:'<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/>'};return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.box}</svg>`};
const STATE_KEY='chronicle-of-ages-v1';const CONFIG_KEY='chronicle-of-ages-connection-v1';
const root=$('app');
function loadState(){try{const data=JSON.parse(localStorage.getItem(STATE_KEY)||'{}');const branches=Array.isArray(data.branches)?data.branches.map(sanitizeWorldline).filter(Boolean):[];return {lang:data.lang==='zh'?'zh':'en',autoComplete:data.autoComplete!==false,pendingClarification:null,branches,activeId:branches.some(b=>b.id===data.activeId)?data.activeId:null,chats:typeof data.chats==='object'&&data.chats?data.chats:{},baselineKnowledge:Array.isArray(data.baselineKnowledge)?data.baselineKnowledge.map(sanitizeKnowledge).filter(Boolean):[],tab:'overview',selected:null,modal:null,busy:null,input:'',query:'',factQuery:'',formError:'',formDiagnostics:[],toast:null,mobilePanel:false,controller:null,questionBusy:false,imageBusy:false};}catch{return {lang:'en',autoComplete:true,pendingClarification:null,branches:[],activeId:null,chats:{},baselineKnowledge:[],tab:'overview',selected:null,modal:null,busy:null,input:'',query:'',factQuery:'',formError:'',formDiagnostics:[],toast:null,mobilePanel:false,controller:null,questionBusy:false,imageBusy:false}}}
const state=loadState();
let savedWorkspace=null;try{savedWorkspace=readWorkspace(localStorage,state.branches,state.baselineKnowledge)}catch{}
state.coreDrafts={};state.imageDrafts={};
if(savedWorkspace){const {viewport,panelScroll,chatScroll,openDetails,...restored}=savedWorkspace;Object.assign(state,restored)}
let theme='light';try{theme=localStorage.getItem('chronicle-of-ages-theme')==='dark'?'dark':'light'}catch{}
let config;try{const saved=JSON.parse(localStorage.getItem(CONFIG_KEY)||'{}');const key=saved.remember?saved.key:(sessionStorage.getItem('chronicle-key')||'');const imageKey=saved.remember?(saved.imageKey||(saved.imageModel?saved.key:'')):(sessionStorage.getItem('chronicle-image-key')||(saved.imageModel?key:''));config=safeConfig({...saved,key,imageKey})}catch{config={...DEFAULT_CONFIG}}
let canvas,toastTimer,queryTimer;
let workspaceSaveTimer,restoringWorkspace=true;
let exampleIndex=Math.floor(Math.random()*EXAMPLES.length);
const tr=k=>t(state.lang,k);
const active=()=>state.branches.find(b=>b.id===state.activeId)||null;
const worldTitle=b=>b?(state.lang==='zh'?b.titleZh:b.titleEn)||b.prompt:tr('baseTitle');
const summary=b=>b?(state.lang==='zh'?b.summaryZh:b.summaryEn)||b.summaryEn:tr('rootDescription');
const eventDesc=e=>state.lang==='zh'?(e.descriptionZh||e.descriptionEn):(e.descriptionEn||e.descriptionZh);
const factName=f=>state.lang==='zh'?(f.nameZh||f.nameEn):f.nameEn;
const factDesc=f=>state.lang==='zh'?(f.descriptionZh||f.descriptionEn):f.descriptionEn;
function persist(){
 try{const data={version:2,lang:state.lang,autoComplete:state.autoComplete,branches:state.branches,activeId:state.activeId,chats:state.chats,baselineKnowledge:state.baselineKnowledge};localStorage.setItem(STATE_KEY,JSON.stringify(data));scheduleWorkspaceSave();return true}catch{notify(tr('errStorage'),true);return false}
}
function saveWorkspaceNow(){
 clearTimeout(workspaceSaveTimer);if(restoringWorkspace||!canvas)return;
 state.input=$('history-input')?.value??state.input;
 const details=Array.from($('panel-content')?.querySelectorAll('details')||[]);
 const snapshot=captureWorkspace(state,canvas,{panelScroll:$('panel-content')?.scrollTop||0,chatScroll:$('chat-log')?.scrollTop||0,openDetails:details.flatMap((detail,index)=>detail.open?[index]:[])});
 try{writeWorkspace(localStorage,snapshot)}catch{}
}
function scheduleWorkspaceSave(){if(!restoringWorkspace){clearTimeout(workspaceSaveTimer);workspaceSaveTimer=setTimeout(saveWorkspaceNow,160)}}
function persistConfig(){const c={...config};if(!c.remember){delete c.key;delete c.imageKey}localStorage.setItem(CONFIG_KEY,JSON.stringify(c));for(const [name,key] of [['chronicle-key',config.key],['chronicle-image-key',config.imageKey]]){if(!config.remember&&key)sessionStorage.setItem(name,key);else sessionStorage.removeItem(name)}}
function notify(message,error=false){
 const old=$('toast');if(old)old.remove();
 const div=document.createElement('div');div.className=`toast${error?' error persistent':''}`;div.id='toast';div.setAttribute('role',error?'alert':'status');
 div.textContent=message;
 if(error){
  const dismiss=document.createElement('button');dismiss.type='button';dismiss.className='toast-dismiss';
  dismiss.textContent='×';dismiss.setAttribute('aria-label',state.lang==='zh'?'关闭错误提示':'Dismiss error');
  dismiss.addEventListener('click',()=>div.remove());div.appendChild(dismiss);
 }
 document.body.appendChild(div);clearTimeout(toastTimer);
 if(!error)toastTimer=setTimeout(()=>div.remove(),3800);
}
function mount(){
 document.documentElement.lang=state.lang;
 root.innerHTML=`<div class="shell"><header class="topbar"><div class="logo"><img class="logo-mark" src="./assets/app-icon.svg?v=20261112-pixel-icon" width="38" height="38" alt="Chronicle of Ages"><div class="logo-type"><div class="logo-name">CHRONICLE OF AGES</div><div class="logo-sub" id="logo-sub"></div></div></div><div class="topdivider"></div><div class="breadcrumb" id="breadcrumb"></div><div class="spacer"></div><div class="top-tools"><div class="top-right-dot"></div><button class="text-button" data-action="export" title="Export">${icon('download',15)}<span id="export-label"></span></button><button class="icon-button" data-action="theme" id="theme-button" type="button"></button><button class="text-button" data-action="settings" id="settings-button" title="Settings">${icon('settings',15)}<span id="settings-label"></span></button><div class="lang-switch" role="group" aria-label="Language"><button data-action="language" data-value="en" id="lang-en">EN</button><button data-action="language" data-value="zh" id="lang-zh">中</button></div><button class="text-button" data-action="fullscreen" id="fullscreen-button" title="Fullscreen">${icon('expand',15)}<span id="fullscreen-label"></span></button></div></header>
 <div class="workspace"><nav class="rail" aria-label="Main navigation" id="nav"></nav><section class="stage" aria-label="Interactive worldline canvas"><canvas id="world-canvas" aria-label="Interactive chronology; scroll to zoom and drag to pan"></canvas><div class="stage-top"><div class="eyebrow" id="stage-eyebrow"></div><h1 class="stage-title" id="stage-title"></h1><p class="stage-sub" id="stage-sub"></p></div><div class="stage-coord"><div class="coord-index" id="coord-index"></div><div class="coord-count" id="coord-count"></div><div class="coord-caption" id="coord-caption"></div></div><div class="stage-bottomleft"><span class="little-circle"></span><span class="mono small muted" id="stage-bottomlabel"></span></div><div class="stage-bottomright"><button class="zoom-button" data-action="zoom-in" aria-label="Zoom in">${icon('plus',16)}</button><button class="zoom-button" data-action="zoom-out" aria-label="Zoom out">${icon('minus',16)}</button><span class="zoom-sep"></span><button class="zoom-button" data-action="fit" aria-label="Fit all">${icon('expand',15)}</button><button class="zoom-button" data-action="reset" aria-label="Reset view">${icon('target',16)}</button></div><div class="hover-tooltip" id="canvas-tooltip" hidden></div><div class="composer-wrap" id="composer"></div></section><button class="mobile-scrim" id="mobile-scrim" type="button" data-action="close-mobile-panel" aria-label="Close inspector"></button><aside class="panel" id="panel" aria-label="Worldline inspector"><div class="panel-resize" id="panel-resize" role="separator" aria-orientation="vertical" tabindex="0"></div><div class="panel-header"><button class="panel-close" data-action="close-panel" aria-label="Close panel">${icon('close',16)}</button></div><div class="panel-scroll" id="panel-content"></div></aside></div></div><div id="overlay-root"></div><input type="file" id="import-file" accept="application/json,.json" hidden>`;
 canvas=new WorldCanvas($('world-canvas'),{onEvent:(event,branchId)=>{state.selected={kind:'event',id:event.id,branchId};state.tab='event';state.mobilePanel=true;persist();render()},onBranch:(id)=>{state.activeId=id;state.selected=null;state.tab=id?'world':'overview';state.mobilePanel=!!id;persist();render()},onCluster:(events,branchId)=>{state.selected={kind:'cluster',eventIds:events.map(e=>e.id),branchId};state.tab='cluster';state.mobilePanel=true;render()},onYear:year=>{if($('coord-count'))$('coord-count').textContent=displayYear(Math.trunc(Math.max(FIRST_YEAR,Math.min(LAST_YEAR,year))),state.lang);scheduleWorkspaceSave()}});
 const formInput=$('import-file');formInput.addEventListener('change',importFile);
 root.addEventListener('click',handleClick);
 setupPanelResize();
 setInterval(rotateExample,9000);
 root.addEventListener('submit',handleSubmit);
 root.addEventListener('input',handleInput);
 root.addEventListener('input',event=>{const key=active()?.id||'baseline';if(event.target.name==='core-question')state.coreDrafts[key]=event.target.value;if(event.target.name==='image-prompt')state.imageDrafts[key]=event.target.value;scheduleWorkspaceSave()});
 root.addEventListener('click',scheduleWorkspaceSave);root.addEventListener('submit',scheduleWorkspaceSave);
 root.addEventListener('scroll',scheduleWorkspaceSave,{capture:true,passive:true});
 root.addEventListener('toggle',scheduleWorkspaceSave,true);
 document.addEventListener('keydown',handleKey);document.addEventListener('keyup',scheduleWorkspaceSave);
 window.addEventListener('pagehide',saveWorkspaceNow);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')saveWorkspaceNow()});
 document.addEventListener('fullscreenchange',()=>{const button=$('fullscreen-button');if(!button)return;const label=document.fullscreenElement?tr('exitFullscreen'):tr('fullscreen');button.title=label;button.setAttribute('aria-label',label);$('fullscreen-label').textContent=label});
 render();
 if(savedWorkspace?.viewport){Object.assign(canvas,savedWorkspace.viewport);canvas.invalidate();$('coord-count').textContent=displayYear(Math.trunc(Math.max(FIRST_YEAR,Math.min(LAST_YEAR,canvas.year))),state.lang)}
 requestAnimationFrame(()=>{if(savedWorkspace){Array.from($('panel-content').querySelectorAll('details')).forEach((detail,index)=>{detail.open=savedWorkspace.openDetails.includes(index)});$('panel-content').scrollTop=savedWorkspace.panelScroll;const log=$('chat-log');if(log)log.scrollTop=savedWorkspace.chatScroll}restoringWorkspace=false;saveWorkspaceNow()});
 window.addEventListener('chronicle-usage-updated',()=>{if(state.modal==='settings')refreshUsageDashboard()});
 window.addEventListener('storage',event=>{if(event.key?.startsWith('chronicle-of-ages-usage')&&state.modal==='settings')refreshUsageDashboard()});
}
function setupPanelResize(){
 const handle=$('panel-resize'),workspace=handle.closest('.workspace');
 try{const saved=Number(localStorage.getItem('chronicle-panel-width'));if(saved>=280)workspace.style.setProperty('--panel-width',`${saved}px`)}catch{}
 const bounds=()=>({min:280,max:Math.max(280,Math.min(850,workspace.clientWidth-420))});
 const setWidth=width=>{const {min,max}=bounds();const value=Math.round(Math.max(min,Math.min(max,width)));workspace.style.setProperty('--panel-width',`${value}px`);handle.setAttribute('aria-valuemin',min);handle.setAttribute('aria-valuemax',max);handle.setAttribute('aria-valuenow',value);return value};
 const saveWidth=value=>{try{localStorage.setItem('chronicle-panel-width',String(value))}catch{}};
 handle.addEventListener('pointerdown',event=>{if(event.button!==0||!window.matchMedia('(min-width:851px)').matches)return;event.preventDefault();handle.setPointerCapture(event.pointerId);document.body.classList.add('resizing-panel');setWidth(workspace.getBoundingClientRect().right-event.clientX)});
 handle.addEventListener('pointermove',event=>{if(handle.hasPointerCapture(event.pointerId))setWidth(workspace.getBoundingClientRect().right-event.clientX)});
 const stop=event=>{if(handle.hasPointerCapture(event.pointerId)){handle.releasePointerCapture(event.pointerId);saveWidth(parseFloat(workspace.style.getPropertyValue('--panel-width')))}document.body.classList.remove('resizing-panel')};
 handle.addEventListener('pointerup',stop);handle.addEventListener('pointercancel',stop);
 handle.addEventListener('keydown',event=>{if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;event.preventDefault();const width=$('panel').getBoundingClientRect().width;saveWidth(setWidth(width+(event.key==='ArrowLeft'?20:-20)))});
}
function rotateExample(){if(EXAMPLES.length<2)return;let next=exampleIndex;while(next===exampleIndex)next=Math.floor(Math.random()*EXAMPLES.length);exampleIndex=next;updateExamplePlaceholder()}
function updateExamplePlaceholder(){const input=$('history-input');if(input)input.placeholder=(state.lang==='zh'?'例如：':'For example: ')+EXAMPLES[exampleIndex][state.lang]}
function applyTheme(){document.documentElement.dataset.theme=theme;const btn=$('theme-button');if(!btn)return;const label=state.lang==='zh'?(theme==='dark'?'切换到日间模式':'切换到夜间模式'):(theme==='dark'?'Switch to light mode':'Switch to dark mode');btn.innerHTML=icon(theme==='dark'?'sun':'moon',18);btn.title=label;btn.setAttribute('aria-label',label);btn.setAttribute('aria-pressed',String(theme==='dark'))}
function render(){document.documentElement.lang=state.lang;applyTheme();
 $('panel-resize').setAttribute('aria-label',state.lang==='zh'?'调整面板宽度':'Resize panel');$('logo-sub').textContent=tr('subtitle');$('breadcrumb').innerHTML=`${h(tr('reference'))} &nbsp;/&nbsp; <strong>${h(worldTitle(active()))}</strong>`;
 $('export-label').textContent=tr('share');$('fullscreen-label').textContent=document.fullscreenElement?tr('exitFullscreen'):tr('fullscreen');$('fullscreen-button').title=document.fullscreenElement?tr('exitFullscreen'):tr('fullscreen');$('fullscreen-button').setAttribute('aria-label',document.fullscreenElement?tr('exitFullscreen'):tr('fullscreen'));$('settings-label').textContent=tr('settings');$('settings-button').title=tr('settings');$('settings-button').setAttribute('aria-label',tr('settings'));$('lang-en').classList.toggle('active',state.lang==='en');$('lang-zh').classList.toggle('active',state.lang==='zh');
 const b=active();$('stage-eyebrow').classList.toggle('active-world',!!b);$('stage-eyebrow').textContent=b?tr('active'):tr('record');$('stage-title').textContent=b?worldTitle(b):tr('headline');$('stage-sub').textContent=b?tr('branchInput'):tr('headlineSub');
 $('coord-index').textContent=b?tr('worldline')+' / '+String(state.branches.indexOf(b)+2).padStart(3,'0'):tr('frame');$('coord-count').textContent=displayYear(Math.trunc(Math.max(FIRST_YEAR,Math.min(LAST_YEAR,canvas.year))),state.lang);$('coord-caption').textContent=tr('timeLimit');$('stage-bottomlabel').textContent=tr('zoom');
 renderNav();renderComposer();renderPanel();renderOverlay();canvas.setState(state.branches,state.activeId,state.lang);
}
function renderNav(){
 const mobileLabels=state.lang==='zh'?{overview:'时间线',archive:'世界线',knowledge:'世界数据库',core:'演算中枢',image:'生图'}:{overview:'TIMELINE',archive:'WORLDS',knowledge:'RECORDS',core:'CORE',image:'VISUALS'};
 let tabs=[['overview','globe','overview'],['archive','branches','worlds'],['knowledge','database','knowledge'],['core','message','central']];
 $('nav').innerHTML=tabs.map(([key,ico,label])=>`<button data-action="tab" data-value="${key}" class="${state.tab===key||(['world','event','fact','edit-event','edit-fact','create-record'].includes(state.tab)&&key==='overview')?'selected':''}" aria-label="${h(tr(label))}" aria-current="${state.tab===key?'page':'false'}">${icon(ico,19)}<span class="tooltip-label">${h(tr(label))}</span><span class="nav-short-label">${h(mobileLabels[key])}</span></button>`).join('')+`<div class="rail-sep"></div><button data-action="image" class="${state.tab==='image'?'selected':''}" aria-label="${h(tr('image'))}">${icon('image',19)}<span class="tooltip-label">${h(tr('image'))}</span><span class="nav-short-label">${h(mobileLabels.image)}</span></button><button data-action="settings" class="rail-bottom" aria-label="${h(tr('settings'))}">${icon('settings',19)}<span class="tooltip-label">${h(tr('settings'))}</span></button>`;
}
function renderComposer(){$('composer').innerHTML=`<form class="composer" id="simulate-form"><div class="composer-head"><div class="composer-label"><span>${icon('layers',14)}</span>${h(tr('modify'))}<span class="slash">/</span><span style="font-weight:400;color:#a3a3a0">${h(tr('worldline'))}</span></div></div>${state.formError?`<div class="admission-feedback" role="status">${h(state.formError)}${renderIntakeDiagnostics(state.formDiagnostics,state.lang)}</div>`:''}<textarea id="history-input" name="history-input" maxlength="2000" rows="2" placeholder="${h(tr('prompt'))}" aria-label="${h(tr('prompt'))}">${h(state.input)}</textarea><div class="composer-footer"><button type="submit" class="primary-btn" ${state.busy?'disabled':''}>${h(state.busy?tr('running'):tr('run'))} ${icon('arrow',15)}</button></div></form>`;updateExamplePlaceholder()}
function renderPanel(){
 const tab=state.tab;const panel=$('panel');panel.classList.toggle('mobile-open',state.mobilePanel);panel.hidden=!state.mobilePanel;panel.closest('.workspace').classList.toggle('panel-open',state.mobilePanel);$('mobile-scrim')?.classList.toggle('visible',state.mobilePanel);panel.setAttribute('aria-hidden',String(!state.mobilePanel));if(tab!=='core'){$('panel-content').style.padding='';$('panel-content').style.display='';$('panel-content').style.flexDirection='';}

 if(tab==='core'){renderCore();return}
 let content='';if(tab==='archive')content=renderArchive();else if(tab==='knowledge')content=renderKnowledge();else if(tab==='world')content=renderOverview();else if(tab==='cluster')content=renderCluster();else if(tab==='event')content=renderEvent();else if(tab==='fact')content=renderFact();else if(tab==='image')content=renderImage();else content=renderOverview();
 $('panel-content').innerHTML=content;
}
function labelPanel(k){return `<span class="panel-eyebrow">${h(tr(k))}</span>`}
function metrics(arr){return `<div class="metric-grid">${arr.map(([k,val])=>`<div class="metric"><div class="metric-value">${h(val)}</div><div class="metric-label">${h(tr(k))}</div></div>`).join('')}</div>`}
function renderWorldState(b){
 if(!b?.simulation)return '';
 const sim=b.simulation,last=sim.snapshots.at(-1)?.state;
 const names={'east-asia':['东亚','East Asia'],'south-asia':['南亚','South Asia'],'west-central-asia':['西亚与中亚','West & Central Asia'],europe:['欧洲','Europe'],africa:['非洲','Africa'],americas:['美洲','Americas'],oceania:['大洋洲','Oceania']};
 const domainNames={politics:['政治','Politics'],economy:['经济','Economy'],society:['社会','Society'],'science-technology':['科技','Science & technology'],environment:['环境','Environment'],culture:['文化','Culture']};
 return renderCompletionNotes(b,state.lang)+(sim.version===3?`<p class="muted">${state.lang==='zh'?'完整世界已完成':'World completed'} · ${Math.round((sim.timing?.elapsedMs||0)/1000)} ${state.lang==='zh'?'秒 · 在演算中枢继续探索细节':'seconds · Explore details in the Core'}</p>`:'')+`<details class="world-state"><summary>${state.lang==='zh'?'世界状态':'World state'}<span>${sim.milestoneIds.length} ${state.lang==='zh'?'项大事件':'milestones'} · ${sim.fullEventCount} ${state.lang==='zh'?'项演化事件':'events'}</span></summary>${(last?.regions||[]).map(r=>`<article><h4>${h(names[r.region]?.[state.lang==='zh'?0:1]||r.region)}</h4><p>${h(r.summary)}</p>${r.unknowns?.length?`<p class="muted">${h(r.unknowns.join(' · '))}</p>`:''}${sim.outputPolicy?`<details class="regional-domains"><summary>${state.lang==='zh'?'六领域详情':'Six domain details'}</summary>${(r.domains||[]).map(d=>`<section><h5>${h(domainNames[d.domain]?.[state.lang==='zh'?0:1]||d.domain)}</h5><p>${h(d.summary)}</p>${d.unknowns?.length?`<p class="muted">${h(d.unknowns.join(' · '))}</p>`:''}</section>`).join('')}</details>`:''}</article>`).join('')}${sim.limits?.length?`<details class="world-uncertainty"><summary>${state.lang==='zh'?'推演假设与不确定性':'Assumptions and uncertainty'}</summary>${sim.limits.map(note=>`<p>${h(note)}</p>`).join('')}</details>`:''}</details>`;
}
function renderOverview(){const b=active();const events=b?worldEvents(state.branches,b):BASELINE;const facts=b?worldFacts(state.branches,b):[];
 const recent=[...(b?b.events:BASELINE)].sort((a,c)=>a.year-c.year);return `<div class="line-accent"></div>${labelPanel(b?'active':'baseline')}<h2 class="panel-title">${h(worldTitle(b))}</h2><p class="panel-body">${h(summary(b))}</p><div class="section-rule"></div>${renderWorldState(b)}${metrics([['eventCount',events.length],['knowledgeCount',facts.length]])}<div class="section-rule"></div><div style="display:flex;justify-content:space-between;align-items:center"> <h3 class="mini-heading">${h(tr('timeline'))}</h3><span class="record-tag">${b?displayYear(b.anchorYear,state.lang):tr('dateRange')}</span></div><div class="list-stack">${recent.map(e=>`<button class="list-row" data-action="select-event" data-id="${h(e.id)}" data-branch="${h(b?.id||'')}"><div class="list-row-top"><span>${h(displayYear(e.year,state.lang))}</span><span>${h(e.origin==='recorded'?tr('recorded'):tr('derived'))}</span></div><div class="list-row-title">${h(eventLabel(e,state.lang))}</div></button>`).join('')}</div>${b?`<div class="section-rule"></div><div class="meta-list"><div class="meta-row"><span>${h(tr('upstream'))}</span><span>${h(worldTitle(state.branches.find(x=>x.id===b.parentId)))}</span></div><div class="meta-row"><span>${h(tr('confidence'))}</span><span>${h(b.certainty==='conditional'?(state.lang==='zh'?'条件推演':'Conditional'):b.certainty)}</span></div><div class="meta-row"><span>${h(tr('forked'))}</span><span>${h(b.timeMode==='gradual'?displayYear(b.anchorYear,state.lang)+' — '+displayYear(b.transitionEndYear,state.lang):displayYear(b.anchorYear,state.lang))}</span></div></div>${b.impacts?.length?`<div class="section-rule"></div><h3 class="mini-heading">${h(tr('impact'))}</h3><ul class="impact-list">${b.impacts.map(x=>`<li>${h(x)}</li>`).join('')}</ul>`:''}<div class="section-rule"></div><button class="primary-btn panel-wide-action" data-action="tab" data-value="core">${h(tr('central'))} ${icon('arrow',14)}</button><button class="secondary-btn panel-wide-action" data-action="tab" data-value="knowledge">${h(tr('knowledge'))} ${icon('chevron',14)}</button><button class="ghost-btn" style="margin-top:15px" data-action="delete-branch" data-id="${h(b.id)}">${h(tr('delete'))}</button>`:`<div class="section-rule"></div><span class="badge">${h(tr('offline'))}</span>`}`}
function renderArchive(){let cards=[`<button class="list-row" data-action="set-active" data-id=""><div class="list-row-top"><span>001 / ${h(tr('baseline'))}</span><span>${!active()?tr('current'):''}</span></div><div class="list-row-title">${h(tr('baseTitle'))}</div><div class="list-row-sub">${h(tr('dateRange'))}</div></button>`];
 for(let i=0;i<state.branches.length;i++){const b=state.branches[i];cards.push(`<button class="list-row" data-action="set-active" data-id="${h(b.id)}"><div class="list-row-top"><span>${String(i+2).padStart(3,'0')} / ${h(tr('branch'))}</span><span>${active()?.id===b.id?tr('current'):h(b.timeMode==='gradual'?displayYear(b.anchorYear,state.lang)+' — '+displayYear(b.transitionEndYear,state.lang):displayYear(b.anchorYear,state.lang))}</span></div><div class="list-row-title">${h(worldTitle(b))}</div><div class="list-row-sub">${h(b.prompt)}</div></button>`)}
 return `<div class="line-accent"></div><h2 class="panel-title">${h(tr('worlds'))}</h2><p class="panel-body">${h(tr('dateRange'))}</p>${metrics([['branchCount',state.branches.length],['total',BASELINE.length+state.branches.reduce((a,b)=>a+b.events.length,0)]])}<div class="section-rule"></div><div class="list-stack">${cards.join('')}</div><div class="section-rule"></div><button class="secondary-btn panel-wide-action" data-action="import">${icon('upload',14)} ${h(tr('upload'))}</button><button class="secondary-btn panel-wide-action" data-action="export">${icon('download',14)} ${h(tr('download'))}</button>`}
function databaseResults(){
 const b=active(),query=(state.factQuery||'').trim().toLowerCase(),matches=x=>!query||JSON.stringify(x).toLowerCase().includes(query);
 const events=worldEvents(state.branches,b).filter(matches).slice().reverse();
 const facts=(b?worldFacts(state.branches,b):state.baselineKnowledge).filter(matches);
 const dialogue=dialogueEntries(state.chats[b?.id||'baseline']).filter(matches).slice().reverse();
 const eventRows=events.map(e=>`<button class="list-row" data-action="select-event" data-source="database" data-id="${h(e.id)}" data-branch="${h(b?.id||'')}"><div class="list-row-top"><span>${h(displayYear(e.year,state.lang))}</span><span>${h(e.origin==='recorded'?tr('recorded'):tr('derived'))}</span></div><div class="list-row-title">${h(eventLabel(e,state.lang))}</div><div class="list-row-sub">${h(eventDesc(e))}</div></button>`).join('');
 const factRows=facts.map(f=>`<button class="list-row" data-action="select-fact" data-id="${h(f.id)}"><div class="list-row-top"><span>${h(displayYear(f.firstYear,state.lang))}</span><span>${h(tr('generatedFact'))}</span></div><div class="list-row-title">${h(factName(f))}</div><div class="list-row-sub">${h(factDesc(f))}</div></button>`).join('');
 const dialogueRows=dialogue.map(d=>`<details class="database-dialogue"><summary><span>${h(d.question)}</span>${icon('chevron',14)}</summary><div class="database-answer answer-formatted">${formatAnswer(d.answer)}</div></details>`).join('');
 const empty=`<div class="empty-state">${h(tr(query?'noSearch':'empty'))}</div>`;
 const showDialogue=state.databaseTab==='dialogue';
 return `<div class="database-tabs" role="group" aria-label="${h(tr('collection'))}"><button type="button" data-action="database-tab" data-value="created" aria-pressed="${!showDialogue}" class="${!showDialogue?'active':''}">${h(tr('createdRecords'))} <span>${events.length+facts.length}</span></button><button type="button" data-action="database-tab" data-value="dialogue" aria-pressed="${showDialogue}" class="${showDialogue?'active':''}">${h(tr('dialogueRecords'))} <span>${dialogue.length}</span></button></div><div class="list-stack">${showDialogue?(dialogueRows||empty):(eventRows+factRows||empty)}</div>`;
}
function renderKnowledge(){const b=active();return `<div class="line-accent"></div><h2 class="panel-title">${h(tr('collection'))}</h2><p class="panel-body">${h(worldTitle(b))}</p><input class="search-field" type="search" id="fact-query" value="${h(state.factQuery)}" placeholder="${h(tr('search'))}" aria-label="${h(tr('search'))}"><div id="fact-results">${databaseResults()}</div>`}

function locateRecord(kind,id){const b=active();if(kind==='fact')return (b?worldFacts(state.branches,b):state.baselineKnowledge).find(f=>f.id===id)||null;const inspected=state.selected?.branchId?state.branches.find(x=>x.id===state.selected.branchId):null;return (inspected?worldEvents(state.branches,inspected):b?worldEvents(state.branches,b):BASELINE).find(e=>e.id===id)||BASELINE.find(e=>e.id===id)}
function renderCluster(){
 const chosen=state.selected,branch=state.branches.find(b=>b.id===chosen?.branchId)||null;
 const records=worldEvents(state.branches,branch).filter(e=>chosen?.eventIds?.includes(e.id));
 return `<div class="line-accent"></div><h2 class="panel-title">${state.lang==='zh'?'聚合事件':'Grouped events'}</h2><p class="panel-body">${records.length} ${state.lang==='zh'?'条历史记录':'historical records'}</p><div class="list-stack">${records.map(e=>`<button class="list-row" data-action="select-event" data-id="${h(e.id)}" data-branch="${h(branch?.id||'')}"><div class="list-row-top">${h(displayYear(e.year,state.lang))}</div><div class="list-row-title">${h(eventLabel(e,state.lang))}</div></button>`).join('')}</div>`;
}
function causeLabel(id){
 const b=active(),records=[...worldEvents(state.branches,b),...worldFacts(state.branches,b),...(b?.simulation?.genesis?.conditions||[]),...(b?.simulation?.actions||[])];
 const r=records.find(r=>r.id===id);return r?(r.en?eventLabel(r,state.lang):r.nameEn?factName(r):r.description||r.target):id;
}
function renderEvent(){const e=locateRecord('event',state.selected?.id);if(!e)return renderOverview();return `<div class="panel-subnav"><button class="back-link" data-action="tab" data-value="${state.selected?.source==='database'?'knowledge':active()?'world':'overview'}">${icon('back',13)} ${h(tr('back'))}</button></div><div class="line-accent"></div>${labelPanel('details')}<h2 class="panel-title">${h(eventLabel(e,state.lang))}</h2><div style="margin-bottom:22px"><span class="badge ${e.origin==='recorded'?'':'dark'}">${h(tr(e.origin==='recorded'?'recorded':e.origin==='user'?'user':'derived'))}</span></div><div class="meta-list"><div class="meta-row"><span>${h(tr('year'))}</span><span>${h(displayYear(e.year,state.lang))}</span></div><div class="meta-row"><span>${h(tr('source'))}</span><span>${h(e.category||'history')}</span></div>${e.certainty?`<div class="meta-row"><span>${h(tr('confidence'))}</span><span>${h(e.certainty)}</span></div>`:''}</div><div class="section-rule"></div><p class="detail-copy">${h(eventDesc(e))}</p>${e.causes?.length?`<div class="section-rule"></div><h3 class="mini-heading">${h(tr('causality'))}</h3><ul class="impact-list">${e.causes.map(c=>`<li>${h(causeLabel(c))}${e.links?.find(l=>l.causeId===c)?.mechanism?`<p class="causal-mechanism">${h(e.links.find(l=>l.causeId===c).mechanism)}</p>`:''}</li>`).join('')}</ul>`:''}<div class="inspector-actions"><button class="secondary-btn" data-action="focus-event" data-year="${e.year}">${icon('target',14)} ${h(tr('focusHere'))}</button></div>`}
function renderFact(){const f=locateRecord('fact',state.selected?.id);if(!f)return renderKnowledge();return `<div class="panel-subnav"><button class="back-link" data-action="tab" data-value="knowledge">${icon('back',13)} ${h(tr('knowledge'))}</button></div><div class="line-accent"></div>${labelPanel('generatedFact')}<h2 class="panel-title">${h(factName(f))}</h2><span class="badge">${h(tr('derived'))}</span><div class="section-rule"></div><div class="meta-list"><div class="meta-row"><span>${h(tr('year'))}</span><span>${h(displayYear(f.firstYear,state.lang))}</span></div><div class="meta-row"><span>${h(tr('source'))}</span><span>${h(f.kind||'concept')}</span></div><div class="meta-row"><span>${h(tr('confidence'))}</span><span>${h(f.certainty||'medium')}</span></div></div><div class="section-rule"></div><p class="detail-copy">${h(factDesc(f))}</p>`}

function renderImage(){const b=active();return `<div class="line-accent"></div><h2 class="panel-title">${h(tr('imageTitle'))}</h2><p class="panel-body">${h(tr('imageInfo'))}</p><div class="image-box">${b?.image?.data?`<img class="image-preview" src="${h(b.image.data)}" alt="${h(b.image.prompt)}">`:`<div class="image-empty">${h(tr('noImage'))}</div>`}<form id="image-form"><div class="panel-field"><label>${h(tr('imagePrompt'))}</label><textarea name="image-prompt" maxlength="1100" required placeholder="${h(tr('imagePrompt'))}">${h(state.imageDrafts?.[b?.id||'baseline']??b?.image?.prompt??'')}</textarea></div><button class="primary-btn panel-wide-action" type="submit" ${state.imageBusy?'disabled':''}>${h(state.imageBusy?tr('running'):tr('generate'))} ${icon('arrow',13)}</button></form></div><p class="footnote">${h(tr('imageModel'))}: ${h(config.imageModel||'—')}</p>`}
function renderCore(){const b=active();const key=b?.id||'baseline';const chat=Array.isArray(state.chats[key])?state.chats[key]:[];
 $('panel-content').style.padding='0';$('panel-content').style.display='flex';$('panel-content').style.flexDirection='column';
 $('panel-content').innerHTML=`<div class="chat"><div class="chat-log" id="chat-log">${chat.length?chat.map(msg=>`<div class="chat-item ${msg.role==='user'?'user':'assistant'}"><span class="chat-role">${msg.role==='user'?'YOU':h(tr('central'))}</span><div class="chat-bubble ${msg.role==='assistant'?'answer-formatted':''}">${msg.role==='assistant'?formatAnswer(msg.content):h(msg.content)}</div></div>`).join(''):`<div class="line-accent"></div><h2 class="panel-title">${h(worldTitle(b))}</h2><p class="panel-body">${h(tr('coreGreeting'))}</p><span class="badge">${h(tr('timeLimit'))}</span>`}${state.questionBusy&&state.pendingChatKey===key?`<div class="chat-item assistant"><span class="chat-role">${h(tr('central'))}</span><div class="thinking-dots" role="status" aria-label="${h(state.lang==='zh'?'正在思考':'Thinking')}"><span></span><span></span><span></span></div></div>`:''}</div><form class="chat-form" id="core-form"><textarea name="core-question" maxlength="1800" rows="2" placeholder="${h(tr('ask'))}" aria-label="${h(tr('ask'))}" ${state.questionBusy?'disabled':''}>${h(state.coreDrafts?.[key]||'')}</textarea><button type="submit" aria-label="${h(tr('send'))}" ${state.questionBusy?'disabled':''}>${icon('arrow',18)}</button></form></div>`;
 const log=$('chat-log');if(log)log.scrollTop=log.scrollHeight;
}
function currentMode(c){return c.textEnabled?(c.imageEnabled?'both':'text'):'image'}
function showConfigMode(form){
 const mode=form.querySelector('[name="mode"]:checked')?.value||'text';
 form.querySelector('[data-channel="text"]').hidden=mode==='image';
 form.querySelector('[data-channel="image"]').hidden=mode==='text';
 const probe=form.querySelector('[data-action="test-config"]');if(probe)probe.hidden=mode==='image';
 for(const field of form.querySelectorAll('[data-channel="text"] input,[data-channel="text"] select'))field.disabled=mode==='image';
 for(const field of form.querySelectorAll('[data-channel="image"] input,[data-channel="image"] select'))field.disabled=mode==='text';
}
const u=(zh,en)=>state.lang==='zh'?zh:en;
function refreshUsageDashboard(){
 const host=$('usage-dashboard');if(!host)return;
 host.innerHTML=renderUsageDashboard({lang:state.lang,
  provider:$('setting-provider')?.value||config.provider,model:$('setting-model')?.value||config.model,
  endpoint:$('setting-endpoint')?.value||config.endpoint});
}
function refreshUsagePricing(){refreshUsageDashboard()}
function saveUsagePricing(){
 const provider=$('setting-provider')?.value||config.provider,model=String($('setting-model')?.value||config.model).trim();
 const input=$('usage-price-input')?.value,output=$('usage-price-output')?.value;
 if(!model||input===''||output===''){notify(u('请填写模型名称和输入、输出单价。','Enter the model and both rates.'),true);return}
 try{
  const saved=setUsagePrice({provider,model,inputPerMillion:input,outputPerMillion:output});
  if(!saved){notify(u('浏览器无法保存单价。','Browser could not save rates.'),true);return}
  refreshUsageDashboard();notify(u('模型单价已保存。','Model prices saved.'));
 }catch{notify(u('单价必须是非负数字。','Prices must be valid nonnegative numbers.'),true)}
}
function clearUsageStatistics(){
 if(!confirm(u('确定清空当前浏览器的 API 用量记录？世界线和模型配置不受影响。','Clear API usage history on this browser? Worldlines and model settings will be preserved.')))return;
 if(!clearUsageMeter()){notify(u('浏览器无法清空用量记录。','Could not clear browser usage history.'),true);return}
 refreshUsageDashboard();notify(u('已清空用量记录。','Usage history cleared.'));
}
function renderOverlay(){const dest=$('overlay-root');if(state.modal==='settings'){const mode=currentMode(config);
 dest.innerHTML=`<div class="backdrop" id="backdrop"><div class="dialog settings-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div class="dialog-head"><div><div class="panel-eyebrow">${h(tr('connection'))}</div><h2 class="dialog-title" id="dialog-title">${h(tr('provider'))}</h2></div><button class="panel-close" type="button" data-action="close-modal" aria-label="${h(tr('close'))}">${icon('close',20)}</button></div><form class="dialog-inner" id="settings-form"><fieldset class="mode-fieldset"><legend>${h(tr('apiMode'))}</legend><div class="mode-selector" role="radiogroup">${[['text','modeText'],['image','modeImage'],['both','modeBoth']].map(([value,label])=>'<label class="mode-option"><input type="radio" name="mode" value="'+value+'" '+(mode===value?'checked':'')+'><span>'+h(tr(label))+'</span></label>').join('')}</div></fieldset><div id="usage-dashboard">${renderUsageDashboard({lang:state.lang,provider:config.provider,model:config.model,endpoint:config.endpoint})}</div><section class="settings-section" data-channel="text"><div class="settings-section-head"><strong>${h(tr('textConfig'))}</strong><span>${h(tr('textConfigNote'))}</span></div><div class="preset-shortcuts"><button type="button" data-action="deepseek-quick" data-value="deepseek-flash">DeepSeek Flash</button></div><p class="form-caption">${h(state.lang==='zh'?'动态展开全球历史，目标两分钟内完成。DeepSeek 推演与审查统一使用 Flash。':'History expands dynamically, targeting completion within two minutes. DeepSeek generation and review both use Flash.')}</p><div class="form-field"><label for="setting-provider">${h(tr('providerPreset'))}</label><select name="provider" id="setting-provider"><option value="deepseek" ${config.provider==='deepseek'?'selected':''}>DeepSeek</option><option value="openrouter" ${config.provider==='openrouter'?'selected':''}>${h(tr('openrouter'))}</option><option value="openai" ${config.provider==='openai'?'selected':''}>${h(tr('openai'))}</option><option value="custom" ${config.provider==='custom'?'selected':''}>${h(tr('custom'))}</option></select></div><div class="form-field"><label for="setting-endpoint">${h(tr('endpoint'))}</label><input id="setting-endpoint" name="endpoint" type="url" required spellcheck="false" value="${h(config.endpoint)}" placeholder="https://.../chat/completions"></div><div class="form-field"><label for="setting-model">${h(tr('model'))}</label><input id="setting-model" name="model" required maxlength="180" spellcheck="false" value="${h(config.model)}" placeholder="e.g. openai/gpt-4o-mini"></div><div class="form-field"><label for="setting-key">${h(tr('key'))}</label><input id="setting-key" name="key" type="password" autocomplete="off" spellcheck="false" value="${h(config.key)}" placeholder="sk-…"></div></section><section class="settings-section" data-channel="image"><div class="settings-section-head"><strong>${h(tr('imageConfig'))}</strong><span>${h(tr('imageConfigNote'))}</span></div><div class="form-field"><label for="setting-imageProvider">${h(tr('providerPreset'))}</label><select name="imageProvider" id="setting-imageProvider"><option value="openrouter" ${config.imageProvider==='openrouter'?'selected':''}>${h(tr('openrouter'))}</option><option value="openai" ${config.imageProvider==='openai'?'selected':''}>${h(tr('openai'))}</option><option value="custom" ${config.imageProvider==='custom'?'selected':''}>${h(tr('custom'))}</option></select></div><div class="form-row"><div class="form-field"><label for="setting-imageModel">${h(tr('imageModel'))}</label><input id="setting-imageModel" name="imageModel" required value="${h(config.imageModel)}" placeholder="e.g. gpt-image-1" spellcheck="false"></div><div class="form-field"><label for="setting-imageEndpoint">${h(tr('imageEndpoint'))}</label><input id="setting-imageEndpoint" name="imageEndpoint" type="url" required value="${h(config.imageEndpoint)}" placeholder="https://.../images/generations" spellcheck="false"></div></div><div class="form-field"><label for="setting-imageKey">${h(tr('imageKey'))}</label><input id="setting-imageKey" name="imageKey" type="password" autocomplete="off" spellcheck="false" value="${h(config.imageKey)}" placeholder="sk-…"></div></section><label class="switch-row"><input type="checkbox" name="remember" ${config.remember?'checked':''}><span>${h(tr('remember'))}</span></label><p class="form-caption">${h(tr('apiHelp'))}</p><div class="form-error" id="settings-error"></div><div class="dialog-actions"><button type="button" class="secondary-btn" data-action="test-config">${h(tr('probe'))}</button><button type="submit" class="primary-btn">${h(tr('save'))} ${icon('arrow',14)}</button></div></form></div></div>`;
 showConfigMode($('settings-form'));
 }else if(state.modal==='clarification'&&state.pendingClarification){
  dest.innerHTML=renderClarificationDrawer(state.pendingClarification,state.lang);
  dest.querySelector('textarea')?.focus();
 }else dest.innerHTML='';
 if(state.busy)renderBusy();
}
function renderBusy(){let host=$('busy-overlay');if(!state.busy){host?.remove();return}if(!host){host=document.createElement('div');host.id='busy-overlay';host.className='busy-overlay';document.body.appendChild(host)}const s=state.busy;
 const review=s.stage==='minute-review'||s.stage==='minute-repair',seconds=Math.floor((s.elapsedMs||0)/1000),progress=review?85:Math.min(78,5+seconds*1.5);
 const title=state.lang==='zh'?(review?'审查全球历史与因果':'推演完整世界历史'):(review?'Reviewing global history and causes':'Computing the complete world history');
 host.innerHTML=`<div class="busy-card"><div class="busy-index">${h(tr('loading'))} &nbsp;/&nbsp; ${review?'02':'01'}</div><div class="busy-title">${h(title)}</div><p class="panel-body" style="margin-bottom:0">${h(s.input)}</p><div class="busy-line"><span style="width:${progress}%"></span></div><div class="busy-foot"><span>${state.lang==='zh'?`已用 ${seconds} 秒 · 目标2分钟内`:`${seconds}s elapsed · Target within 2 minutes`}</span><button type="button" data-action="stop" id="stop-calculation">${h(tr('abort'))}</button></div></div>`;host.querySelector('[data-action="stop"]').addEventListener('click',()=>state.controller?.abort());
}
function handleClick(event){const btn=event.target.closest('[data-action]');if(!btn)return;const action=btn.dataset.action,val=btn.dataset.value;
 if(action==='clarification-choice'){const input=$('clarify-'+btn.dataset.question);if(input&&state.pendingClarification){input.value=btn.dataset.answer||'';input.setCustomValidity('');state.pendingClarification.values[btn.dataset.question]=input.value;input.focus()}return}
 if(action==='tab'){state.tab=val;state.selected=null;state.mobilePanel=val!=='overview'||!window.matchMedia('(max-width: 680px)').matches;renderNav();renderPanel();return}
 if(action==='close-panel'||action==='close-mobile-panel'){state.mobilePanel=false;state.tab='overview';renderNav();renderPanel();return}
 if(action==='theme'){theme=theme==='dark'?'light':'dark';try{localStorage.setItem('chronicle-of-ages-theme',theme)}catch{}applyTheme();return}
 if(action==='fullscreen'){void toggleFullscreen();return}
 if(action==='settings'){state.modal='settings';renderOverlay();return}if(action==='close-modal'){state.modal=null;renderOverlay();return}
 if(action==='language'){state.input=$('history-input')?.value||state.input;state.lang=val;persist();render();return}
 if(action==='zoom-in'){canvas.zoomAt(1.4);return}if(action==='zoom-out'){canvas.zoomAt(1/1.4);return}if(action==='fit'){canvas.fit();return}if(action==='reset'){canvas.focus(1680,.36);return}
 if(action==='set-active'){state.activeId=btn.dataset.id||null;state.selected=null;state.tab=state.activeId?'world':'overview';state.mobilePanel=true;persist();render();return}
 if(action==='select-event'){const bId=btn.dataset.branch||null;state.selected={kind:'event',id:btn.dataset.id,branchId:bId,source:btn.dataset.source||null};state.tab='event';state.mobilePanel=true;persist();render();return}
 if(action==='database-tab'){state.databaseTab=val;if($('fact-results'))$('fact-results').innerHTML=databaseResults();return}
 if(action==='select-fact'){state.selected={kind:'fact',id:btn.dataset.id};state.tab='fact';renderNav();renderPanel();return}
 if(action==='focus-event'){canvas.focus(Number(btn.dataset.year),Math.max(canvas.zoom,.9));state.mobilePanel=false;renderPanel();return}
 if(action==='delete-branch'){deleteBranch(btn.dataset.id);return}
 if(action==='image'){state.tab='image';state.mobilePanel=true;renderNav();renderPanel();return}
 if(action==='export'){exportData();return}if(action==='import'){$('import-file').click();return}
 if(action==='test-config'){testConfig();return}
 if(action==='save-usage-price'){saveUsagePricing();return}
 if(action==='clear-usage'){clearUsageStatistics();return}
 if(action==='deepseek-quick'){const form=$('settings-form');if(!form)return;const preset=withTextPreset(extractConfig(form),'deepseek','deepseek-flash');const modeBefore=form.querySelector('[name=mode]:checked')?.value||'text';form.querySelector(`[name=mode][value=${modeBefore==='both'?'both':'text'}]`).checked=true;showConfigMode(form);$('setting-provider').value='deepseek';$('setting-endpoint').value=preset.endpoint;$('setting-model').value=preset.model;$('setting-key').focus();$('settings-error').textContent=tr('deepseekReady');refreshUsagePricing();return}
}
function handleInput(e){if(e.target.name?.startsWith('clarify-')&&state.pendingClarification){const key=e.target.name.slice(8);state.pendingClarification.values[key]=e.target.value;e.target.setCustomValidity('');return}if(e.target.id==='history-input'){state.input=e.target.value;state.formError='';state.formDiagnostics=[];$('composer')?.querySelector('.admission-feedback')?.remove();return}if(e.target.id==='fact-query'){state.factQuery=e.target.value;clearTimeout(queryTimer);queryTimer=setTimeout(()=>{if($('fact-results'))$('fact-results').innerHTML=databaseResults()},70);return}
 if(e.target.name==='mode'){showConfigMode($('settings-form'));$('settings-error').textContent='';return}
 if(e.target.id==='setting-provider'){const preset=PROVIDERS[e.target.value];if(preset){$('setting-endpoint').value=preset.endpoint;if(preset.model)$('setting-model').value=preset.model}refreshUsagePricing();return}
 if(e.target.id==='setting-model'||e.target.id==='setting-endpoint'){refreshUsagePricing();return}
 if(e.target.id==='setting-imageProvider'){const preset=IMAGE_PROVIDERS[e.target.value];if(preset)$('setting-imageEndpoint').value=preset.imageEndpoint;return}}
async function handleSubmit(event){event.preventDefault();const id=event.target.id;
 if(id==='clarification-form')return submitClarifications(event.target);
 if(id==='simulate-form')return startSimulation();
 if(id==='settings-form')return saveConfig(event.target);
 if(id==='core-form')return submitQuestion(event.target);
 if(id==='image-form')return submitImage(event.target);
}
async function toggleFullscreen(){
 try{
  if(document.fullscreenElement)await document.exitFullscreen();
  else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();
  else throw new Error('UNSUPPORTED');
 }catch{notify(tr('fullscreenError'),true)}
}
function handleKey(event){if(event.key==='Escape'&&state.modal){state.modal=null;renderOverlay();return}if(event.key==='Escape'&&state.mobilePanel){state.mobilePanel=false;renderNav();renderPanel();return}if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){if(event.target.id==='history-input'){event.preventDefault();startSimulation()}else if(event.target.name==='core-question'){event.preventDefault();$('core-form')?.requestSubmit()}}}
function extractConfig(form){const data=new FormData(form),mode=data.get('mode')||'text';return safeConfig({
 provider:mode==='image'?config.provider:data.get('provider'),endpoint:mode==='image'?config.endpoint:data.get('endpoint'),model:mode==='image'?config.model:data.get('model'),key:mode==='image'?config.key:data.get('key'),
 imageProvider:mode==='text'?config.imageProvider:data.get('imageProvider'),imageEndpoint:mode==='text'?config.imageEndpoint:data.get('imageEndpoint'),imageModel:mode==='text'?config.imageModel:data.get('imageModel'),imageKey:mode==='text'?config.imageKey:data.get('imageKey'),
 textEnabled:mode!=='image',imageEnabled:mode!=='text',remember:data.has('remember')})}
function saveConfig(form){const next=extractConfig(form);const err=$('settings-error');
 if((next.textEnabled&&!validEndpoint(next.endpoint))||(next.imageEnabled&&!validEndpoint(next.imageEndpoint))){err.textContent=explainError(new Error('INVALID_ENDPOINT'),state.lang);return}
 config=next;try{persistConfig()}catch{notify(tr('errStorage'),true)}state.modal=null;renderOverlay();notify(tr('savingDone'))}
async function testConfig(){const next=extractConfig($('settings-form'));const err=$('settings-error');if(!configured(next)){err.textContent=explainError(new Error('NOT_CONFIGURED'),state.lang);return}const btn=document.querySelector('[data-action="test-config"]');btn.disabled=true;btn.textContent=tr('testing');const ac=new AbortController();const timer=setTimeout(()=>ac.abort(),18000);
 try{await callChat(next,[{role:'user',content:'Reply with OK.'}],{signal:ac.signal,maxTokens:32,temperature:0,purpose:'connection-test'});err.textContent=tr('tested')}catch(e){err.textContent=explainError(e,state.lang)}finally{clearTimeout(timer);btn.disabled=false;btn.textContent=tr('probe')}
}
function submitClarifications(form){
 const pending=state.pendingClarification;if(!pending||state.busy)return;
 let answers;
 try{answers=clarificationAnswers(pending.questions,new FormData(form))}
 catch{const blank=pending.questions.find(q=>!form.elements.namedItem('clarify-'+q.id)?.value.trim());const input=blank&&form.elements.namedItem('clarify-'+blank.id);if(input){input.setCustomValidity(state.lang==='zh'?'请填写这一项条件。':'Please answer this question.');input.reportValidity()}return}
 state.modal=null;state.pendingClarification=null;renderOverlay();
 return startSimulation({prompt:pending.prompt,parentId:pending.parentId,autoComplete:false,clarifications:[...pending.clarifications,...answers]});
}
async function startSimulation(options={}){if(state.busy)return;const prompt=String(options.prompt??$('history-input')?.value??state.input??'').trim();if(!prompt){notify(tr('errEmpty'),true);return}if(prompt.length>2000){notify(tr('errLength'),true);return}if(!configured(config)){state.modal='settings';renderOverlay();notify(tr('errModel'),true);return}
 const parentId=options.parentId===undefined?state.activeId:options.parentId;
 const autoComplete=options.autoComplete??state.autoComplete,clarifications=options.clarifications||[];
 state.input=prompt;state.formError='';state.formDiagnostics=[];$('composer')?.querySelector('.admission-feedback')?.remove();state.pendingClarification=null;const ac=new AbortController();state.controller=ac;state.busy={input:prompt,phase:'validation',index:0,total:1};renderBusy();const button=document.querySelector('#simulate-form button[type="submit"]');if(button)button.disabled=true;
 try{const result=await simulate({prompt,branches:state.branches,parentId,autoComplete,clarifications,config,lang:state.lang,signal:ac.signal,onProgress:update=>{state.busy={...state.busy,...update};renderBusy()}});state.branches.push(result);state.activeId=result.id;state.selected=null;state.tab='world';state.mobilePanel=true;state.input='';const saved=persist();canvas.focus(Math.min(2026,result.anchorYear+Math.max(110,Math.floor((2026-result.anchorYear)*.35))),.31);if(saved)notify(tr('complete'));else notify(state.lang==='zh'?'推演已完成，但浏览器存储空间不足，结果尚未保存。请立即使用右上角“导出”备份世界线。':'Simulation completed but storage is full. Export your worldline now to avoid losing it.',true)}
 catch(e){
  if(e.code==='INTERVENTION_CLARIFY'&&!autoComplete){
   state.pendingClarification={prompt,parentId,clarifications,questions:clarificationQuestions(e,state.lang),values:{}};state.modal='clarification';
  }else{state.formDiagnostics=e.intakeDiagnostics||[];state.formError=explainError(e,state.lang);notify(state.formError,true)}
 }finally{state.busy=null;state.controller=null;$('busy-overlay')?.remove();render()}
}
async function submitQuestion(form){if(state.questionBusy)return;const input=form.querySelector('[name="core-question"]');const question=input?.value.trim();if(!question)return;if(!configured(config)){state.modal='settings';renderOverlay();notify(tr('errModel'),true);return}const branch=active();const key=branch?.id||'baseline';const history=Array.isArray(state.chats[key])?state.chats[key]:[];const previous=[...history];history.push({role:'user',content:question});state.chats[key]=history;(state.coreDrafts??={})[key]='';state.questionBusy=true;state.pendingChatKey=key;renderPanel();
 try{
  const explored=await exploreCore({question,branch,branches:state.branches,config,lang:state.lang,history:previous,baselineKnowledge:state.baselineKnowledge});
  const oldKnowledge=branch?(branch.knowledge||[]):state.baselineKnowledge;
  const merged=mergeKnowledge(oldKnowledge,explored.knowledge);
  if(merged.stats.conflicts||merged.stats.invalid)throw Object.assign(new Error('EXPLORATION_COMMIT_CONFLICT'),{code:'EXPLORATION_COMMIT_CONFLICT'});
  if(branch)branch.knowledge=merged.facts;else state.baselineKnowledge=merged.facts;
  history.push({role:'assistant',content:explored.answer});
  if(!persist()){
   state.chats[key]=previous;
   if(branch)branch.knowledge=oldKnowledge;else state.baselineKnowledge=oldKnowledge;
  }
 }
 catch(e){history.push({role:'assistant',content:explainError(e,state.lang),error:true});persist()}
 finally{state.questionBusy=false;state.pendingChatKey=null;if(state.tab==='core')renderPanel()}
}
async function submitImage(form){if(state.imageBusy)return;const input=String(new FormData(form).get('image-prompt')||'').trim();if(!input)return;if(!active()){notify(tr('noBranch'),true);return}if(!imageConfigured(config)){state.modal='settings';renderOverlay();notify(tr('imageConfigRequired'),true);return}
 state.imageBusy=true;renderPanel();const controller=new AbortController();try{const result=await generateImage({prompt:input,branch:active(),config,signal:controller.signal});active().image=result;persist();notify(tr('complete'))}catch(e){notify(explainError(e,state.lang),true)}finally{state.imageBusy=false;renderPanel()}
}

function deleteBranch(id){
 if(state.busy||state.questionBusy||state.imageBusy)return;
 const plan=planWorldlineDeletion(state.branches,id,state.chats);
 if(!plan)return;
 const title=state.lang==='zh'?(plan.selected.titleZh||plan.selected.titleEn||plan.selected.prompt||id):(plan.selected.titleEn||plan.selected.titleZh||plan.selected.prompt||id);
 const message=state.lang==='zh'
  ?`确定删除选中的世界线「${title}」吗？${plan.descendantCount?`\n其下 ${plan.descendantCount} 条后继世界线也会一并删除。`:''}\n相关历史、知识库和对话记录将一起移除，且无法撤销。其他平行世界线不会受影响。`
  :`Delete the selected worldline "${title}"?${plan.descendantCount?`\nIts ${plan.descendantCount} descendant worldlines will also be deleted.`:''}\nAssociated history, knowledge and conversations will be removed permanently. Unrelated worldlines will remain.`;
 if(!confirm(message))return;
 const previous={branches:state.branches,chats:state.chats,activeId:state.activeId,
  tab:state.tab,selected:state.selected,mobilePanel:state.mobilePanel};
 state.branches=plan.branches;state.chats=plan.chats;
 state.activeId=null;state.selected=null;state.tab='archive';state.mobilePanel=true;
 if(!persist()){
  Object.assign(state,previous);render();return;
 }
 render();
 notify(state.lang==='zh'?`已删除 ${plan.removedCount} 条世界线。`:`Deleted ${plan.removedCount} worldline(s).`);
}
function exportData(){const snapshot={format:'chronicle-of-ages',version:2,exportedAt:new Date().toISOString(),worldlines:state.branches,chats:state.chats,baselineKnowledge:state.baselineKnowledge};const blob=new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'});const href=URL.createObjectURL(blob),a=document.createElement('a');a.href=href;a.download=`chronicle-of-ages-${new Date().toISOString().slice(0,10)}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),1800);notify(tr('exported'))}
async function importFile(event){const file=event.target.files?.[0];event.target.value='';if(!file)return;try{if(file.size>20_000_000)throw new Error('too large');const raw=JSON.parse(await file.text());if(raw.format!=='chronicle-of-ages'||![1,2].includes(raw.version)||!Array.isArray(raw.worldlines)||raw.worldlines.length>100)throw new Error('invalid');const valid=raw.worldlines.map(sanitizeWorldline).filter(Boolean);if(valid.length!==raw.worldlines.length||new Set(valid.map(x=>x.id)).size!==valid.length)throw new Error('invalid');state.branches=valid;state.activeId=null;state.tab='archive';state.chats=sanitizeChats(raw.chats??state.chats,valid.map(b=>b.id));state.baselineKnowledge=Array.isArray(raw.baselineKnowledge)?raw.baselineKnowledge.map(sanitizeKnowledge).filter(Boolean):[];persist();render();notify(tr('imported'))}catch{notify(tr('invalidImport'),true)}}
window.addEventListener('error',e=>{console.error('Chronicle:',e.error||e.message)});
mount();
