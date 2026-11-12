import {BASELINE,FIRST_YEAR,LAST_YEAR,displayYear,eventLabel} from './data.js';

const clamp=(n,lo,hi)=>Math.min(hi,Math.max(lo,n));
export const MIN_ZOOM=.025;
export const MAX_ZOOM=240;
export function fitCanvasText(ctx,value,maxWidth){
 const text=String(value??'');
 if(ctx.measureText(text).width<=maxWidth)return text;
 if(ctx.measureText('…').width>maxWidth)return '';
 const characters=Array.from(text);let low=0,high=characters.length;
 while(low<high){const middle=Math.ceil((low+high)/2);if(ctx.measureText(characters.slice(0,middle).join('')+'…').width<=maxWidth)low=middle;else high=middle-1}
 return characters.slice(0,low).join('')+'…';
}
export class WorldCanvas{
 constructor(element,{onEvent=()=>{},onBranch=()=>{},onYear=()=>{},onCluster=null}={}){
  this.el=element;this.ctx=element.getContext('2d');this.onEvent=onEvent;this.onBranch=onBranch;this.onYear=onYear;this.onCluster=onCluster;
  this.mobile=window.matchMedia('(max-width: 680px)').matches;this.year=this.mobile?1:1680;this.zoom=.36;this.vertical=0;this.drag=null;this.hit=[];this.branches=[];this.active=null;this.lang='en';this.pointers=new Map();this.pinching=null;this.hover=null;this.width=1;this.height=1;this.dpr=1;this._raf=0;
  this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(element);
  element.addEventListener('pointerdown',e=>this.pointerDown(e));element.addEventListener('pointermove',e=>this.pointerMove(e));element.addEventListener('pointerup',e=>this.pointerUp(e));element.addEventListener('pointercancel',e=>this.pointerUp(e,true));element.addEventListener('pointerleave',()=>this.clearTooltip());
  element.addEventListener('wheel',e=>this.wheel(e),{passive:false});element.addEventListener('dblclick',e=>{const item=this.nearest(e.offsetX,e.offsetY);if(item?.cluster)this.zoomCluster(item);else if(item?.event)this.focus(item.event.year,Math.max(.38,this.zoom));});
  this.resize();
 }
 dispose(){this.clearTooltip();this.resizeObserver.disconnect();cancelAnimationFrame(this._raf)}
 clearTooltip(){const tip=document.getElementById('canvas-tooltip');if(tip)tip.hidden=true;if(this.hover){this.hover=null;this.invalidate()}}
 setState(branches,active,lang){const changed=this.active!==active;this.branches=branches||[];this.active=active;this.lang=lang;
  if(changed&&active){const i=this.branches.findIndex(b=>b.id===active);if(i>=0){const base=this.mobile?(this.height-68)*.5:this.height*.59;this.vertical=this.height*.5-base+144+i*114}}
  this.invalidate()}
 resize(){const r=this.el.getBoundingClientRect();if(!r.width||!r.height)return;this.width=r.width;this.height=r.height;this.dpr=Math.min(2.5,window.devicePixelRatio||1);this.el.width=Math.floor(r.width*this.dpr);this.el.height=Math.floor(r.height*this.dpr);this.ctx.setTransform(this.dpr,0,0,this.dpr,0,0);this.invalidate()}
 invalidate(){if(!this._raf)this._raf=requestAnimationFrame(()=>{this._raf=0;this.draw()})}
 x(y){return this.width*(this.mobile?.5:.54)+(y-this.year)*this.zoom}
 at(x){return this.year+(x-this.width*(this.mobile?.5:.54))/this.zoom}
 baseY(){return (this.mobile?(this.height-68)*.5:this.height*.59)+this.vertical}
 laneY(index){return this.baseY()-144-index*114}
 focus(year,zoom=this.zoom){if(Number.isFinite(year)){this.year=year;this.zoom=clamp(zoom,MIN_ZOOM,MAX_ZOOM);this.vertical=0;this.invalidate();this.onYear(this.year)}}
 fit(){this.zoom=clamp((this.width-160)/(LAST_YEAR-FIRST_YEAR),MIN_ZOOM,MAX_ZOOM);this.year=(FIRST_YEAR+LAST_YEAR)/2;this.vertical=0;this.invalidate();this.onYear(this.year)}
 zoomAt(factor,x=this.width/2){const before=this.at(x);this.zoom=clamp(this.zoom*factor,MIN_ZOOM,MAX_ZOOM);this.year=before-(x-this.width*(this.mobile?.5:.54))/this.zoom;this.invalidate();this.onYear(this.year)}
 nearest(x,y){
 let tip=null,tipDist=this.mobile?24:17;
 for(const h of this.hit){if(h.kind!=='tip')continue;const d=Math.hypot(h.x-x,h.y-y);if(d<tipDist){tip=h;tipDist=d}}
 if(tip)return tip;
 let closest=null,best=this.mobile?19:18;
 for(const h of this.hit){if(h.kind==='tip')continue;const d=Math.hypot(h.x-x,h.y-y);if(d<best){closest=h;best=d}}
 return closest
}
selectedLineage(){
 if(!this.active)return [];
 const byId=new Map(this.branches.map(b=>[b.id,b])),chain=[],seen=new Set();
 let b=byId.get(this.active);
 while(b&&!seen.has(b.id)){chain.unshift(b);seen.add(b.id);b=byId.get(b.parentId)}
 return chain
}
nodeActive(branchId,year){
 if(!this.active)return branchId==null;
 const lineage=this._lineage||this.selectedLineage();
 if(!lineage.length)return branchId==null;
 if(branchId==null)return year<lineage[0].anchorYear;
 const i=lineage.findIndex(b=>b.id===branchId);
 return i>=0&&year>=lineage[i].anchorYear&&year<(lineage[i+1]?.anchorYear??LAST_YEAR+1)
}
 zoomCluster(item){const events=item?.cluster;if(!events?.length)return;const from=events[0].year,to=events.at(-1).year;
  if(this.onCluster){this.onCluster(events,item.branchId);if(from===to||this.zoom>=MAX_ZOOM)return}
  if(this.zoom>=MAX_ZOOM){this.onEvent(events[0],item.branchId);return}this.focus(Math.round((from+to)/2),Math.max(this.zoom*2.8,Math.min(MAX_ZOOM,72/Math.max(to-from,1))))}
 pointerDown(e){if(e.button!==0&&e.pointerType==='mouse')return;this.clearTooltip();this.el.setPointerCapture?.(e.pointerId);this.pointers.set(e.pointerId,{x:e.offsetX,y:e.offsetY});if(this.pointers.size===2){const p=[...this.pointers.values()];this.pinching={distance:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y),zoom:this.zoom};this.drag=null;return}this.drag={x:e.offsetX,y:e.offsetY,year:this.year,vertical:this.vertical,moved:false};this.el.style.cursor='grabbing'}
 pointerMove(e){if(this.pointers.has(e.pointerId))this.pointers.set(e.pointerId,{x:e.offsetX,y:e.offsetY});if(this.pointers.size>=2&&this.pinching){const p=[...this.pointers.values()],d=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);const mid=(p[0].x+p[1].x)/2;this.zoomAt((this.pinching.zoom*clamp(d/Math.max(this.pinching.distance,1),.25,4))/this.zoom,mid);return}
 if(this.drag){const dx=e.offsetX-this.drag.x,dy=e.offsetY-this.drag.y;if(Math.hypot(dx,dy)>5)this.drag.moved=true;this.year=this.drag.year-dx/this.zoom;this.vertical=clamp(this.drag.vertical+dy,-900,900);this.invalidate();this.onYear(this.year)}else{if(this.mobile||e.pointerType==='touch'){this.clearTooltip();return}const item=this.nearest(e.offsetX,e.offsetY);this.hover=item;this.el.style.cursor=item?'pointer':'grab';this.invalidate();const tip=document.getElementById('canvas-tooltip');if(tip){if(item){tip.hidden=false;tip.textContent=item.kind==='tip'?(this.lang==='zh'?'切换世界线':'Select worldline'):item.cluster?(item.cluster.length+' '+(this.lang==='zh'?'个事件 · 点击放大':'events · click to zoom')):item.event?`${displayYear(item.event.year,this.lang)} · ${eventLabel(item.event,this.lang)}`:(this.lang==='zh'?'选择世界线':'Select worldline');tip.style.left=`${clamp(e.offsetX+18,8,this.width-230)}px`;tip.style.top=`${clamp(e.offsetY-20,8,this.height-54)}px`}else tip.hidden=true}}
 }
 pointerUp(e,cancelled=false){this.clearTooltip();this.pointers.delete(e.pointerId);const prior=this.drag;this.drag=null;if(this.pointers.size<2)this.pinching=null;this.el.style.cursor='grab';if(!cancelled&&prior&&!prior.moved){const hit=this.nearest(e.offsetX,e.offsetY);if(hit?.kind==='tip')this.onBranch(hit.branchId??null);else if(hit?.cluster)this.zoomCluster(hit);else if(hit?.event)this.onEvent(hit.event,hit.branchId)}else if(prior)this.onYear(this.year)}
 wheel(e){this.clearTooltip();e.preventDefault();const factor=Math.exp(-e.deltaY*.0012);this.zoomAt(factor,e.offsetX)}
 draw(){
 const ctx=this.ctx,w=this.width,h=this.height;if(!w||!h)return;
 ctx.clearRect(0,0,w,h);ctx.fillStyle='#fafaf9';ctx.fillRect(0,0,w,h);
 this.grid();this.hit=[];this._lineage=this.selectedLineage();
 const base=this.baseY();
 // Each world has a full FIRST_YEAR .. LAST_YEAR history. Shared spans use the ancestor's stroke.
 this.worldline(FIRST_YEAR,LAST_YEAR,base,!!this.active);
 for(let i=0;i<this.branches.length;i++)this.branch(this.branches[i],i);
 if(this.active&&this._lineage.length){
  const root=this._lineage[0];
  this.darkSegment(FIRST_YEAR,root.anchorYear,base);
  for(let i=0;i<this._lineage.length;i++){
   const b=this._lineage[i],index=this.branches.findIndex(v=>v.id===b.id);
   if(index>=0)this.drawBranchTrace(b,index,this._lineage[i+1]?.anchorYear??LAST_YEAR,true);
  }
 }
 const markers=[];
 this.nodes(BASELINE,base,null,!this.active,markers);
 for(let i=0;i<this.branches.length;i++){const b=this.branches[i];this.nodes((b.events||[]).filter(e=>this.showAllEvents||e.milestone!==false),this.laneY(i),b.id,b.id===this.active,markers)}
 for(const marker of markers)this.drawEventMarker(marker);
 const tipX=this.x(LAST_YEAR);
 this.drawTip(tipX,base,null,!this.active);
 for(let i=0;i<this.branches.length;i++)this.drawTip(tipX,this.laneY(i),this.branches[i].id,this.branches[i].id===this.active);
 this.endCaps();
}
 darkSegment(from,to,y){
 const ctx=this.ctx,x1=this.x(from),x2=this.x(to);
 if(x2<0||x1>this.width)return;
 ctx.save();ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(x1,y);ctx.lineTo(x2,y);ctx.strokeStyle='#171717';ctx.lineWidth=2.8;ctx.lineCap='round';ctx.stroke();ctx.restore();
}
 drawTip(x,y,branchId,selected){
 if(x<0||x>this.width||y<0||y>this.height)return;
 const ctx=this.ctx;ctx.save();ctx.setLineDash([]);ctx.beginPath();ctx.arc(x,y,selected?7:6,0,Math.PI*2);ctx.fillStyle='#fafaf9';ctx.fill();ctx.strokeStyle=selected?'#161616':'#b4b4af';ctx.lineWidth=selected?3:1.9;ctx.stroke();ctx.restore();
 this.hit.push({kind:'tip',x,y,branchId});
}
 drawEventMarker({x,y,radius,current,grouped,isActive}){
 const ctx=this.ctx;ctx.save();ctx.setLineDash([]);
 ctx.fillStyle='#fafaf9';ctx.strokeStyle=isActive?'#151515':'#aaa';ctx.lineWidth=current?2.7:grouped?2.3:1.9;
 ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();ctx.stroke();
 if(!grouped){ctx.beginPath();ctx.arc(x,y,1.2,0,Math.PI*2);ctx.fillStyle=isActive?'#1d1d1d':'#bcbcbc';ctx.fill()}
 ctx.restore();
}
 drawBranchTrace(branch,index,stopYear=LAST_YEAR,selected=false){
 const ctx=this.ctx,ancestor=this.branches.findIndex(b=>b.id===branch.parentId),parentY=ancestor<0?this.baseY():this.laneY(ancestor),y=this.laneY(index),start=this.x(branch.anchorYear),fullEnd=this.x(LAST_YEAR),end=this.x(stopYear);
 if(fullEnd<0||start>this.width||end<start)return;
 const gradual=branch.timeMode==='gradual'&&Number.isFinite(branch.transitionEndYear)&&branch.transitionEndYear>branch.anchorYear;
 const curveEnd=gradual?Math.min(fullEnd,Math.max(start+Math.min(16,Math.max(0,fullEnd-start)),this.x(branch.transitionEndYear))):Math.min(fullEnd,start+clamp((fullEnd-start)*.2,18,90));
 const width=Math.max(curveEnd-start,0.1);
 ctx.save();
 if(stopYear<LAST_YEAR){ctx.beginPath();ctx.rect(-20000,-20000,Math.max(0,end+20000),this.height+40000);ctx.clip()}
 ctx.strokeStyle=selected?'#171717':'#b9b9b5';ctx.lineWidth=selected?2.9:1.55;ctx.lineCap='round';ctx.lineJoin='round';
 ctx.setLineDash(gradual?[6,6]:[]);
 ctx.beginPath();ctx.moveTo(start,parentY);ctx.bezierCurveTo(start+width*.35,parentY,curveEnd-width*.35,y,curveEnd,y);ctx.stroke();ctx.setLineDash([]);
 if(curveEnd<fullEnd){ctx.beginPath();ctx.moveTo(curveEnd,y);ctx.lineTo(fullEnd,y);ctx.stroke()}
 ctx.restore();
 return {start,curveEnd,end,y,parentY,gradual}
}
 grid(){const ctx=this.ctx,w=this.width,h=this.height;
  ctx.strokeStyle='#e8e8e5';ctx.lineWidth=1;ctx.setLineDash([1,7]);
  const rowBase=this.baseY();for(let y=((rowBase%114)+114)%114;y<h;y+=114){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}
  let interval=[1,2,5,10,20,50,100,200,500,1000,2000].find(v=>v*this.zoom>=96)||2000;
  const start=Math.floor(this.at(0)/interval)*interval;
  ctx.letterSpacing='0px';ctx.font='10px "Inter",system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='top';
  for(let year=start;year<=this.at(w)+interval;year+=interval){const tickYear=year===0?1:year;const x=this.x(tickYear);if(x<0||x>w)continue;const eraOrigin=this.mobile&&year===0;ctx.strokeStyle=eraOrigin?'#b9b9b4':'#e9e9e6';ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();ctx.fillStyle=eraOrigin?'#41413d':'#ababaa';ctx.font=eraOrigin?'600 11px system-ui':'10px system-ui';ctx.fillText(displayYear(tickYear,this.lang),x,Math.max(12,Math.min(this.baseY()+43,h-36)))}
  ctx.setLineDash([]);
 }
 worldline(from,to,y,muted){const ctx=this.ctx,x1=this.x(from),x2=this.x(to);if(x2<0||x1>this.width)return;
 ctx.lineCap='round';ctx.strokeStyle=muted?'#c8c8c6':'#21211f';ctx.lineWidth=muted?1.5:2.3;ctx.beginPath();ctx.moveTo(x1,y);ctx.lineTo(x2,y);ctx.stroke();
 ctx.fillStyle=muted?'#b8b8b7':'#21211f';ctx.beginPath();ctx.arc(clamp(x1,-100,this.width+100),y,3,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(clamp(x2,-100,this.width+100),y,4,0,Math.PI*2);ctx.fill();
 if(x1<this.width-90&&x2>0){ctx.save();ctx.font='600 10px system-ui';ctx.letterSpacing='1px';ctx.textAlign='left';ctx.fillStyle=muted?'#aaa':'#414141';ctx.fillText(this.lang==='zh'?'现实世界线 / 001':'REALITY / 001',clamp(x1+22,16,this.width-150),y-23);ctx.restore()}
 }

 nodes(events,y,branchId,unmuted,markers=null){
  const ctx=this.ctx;
  const pendingMarkers=markers??[];
  ctx.save();ctx.letterSpacing='0px';
  const titleSize=10.5,dateSize=9,dateOffset=16;
  const labelLimit=Math.max(0,Math.min(170,this.width-24));
  const visible=events.filter(e=>this.x(e.year)>-25&&this.x(e.year)<this.width+25).sort((a,b)=>a.year-b.year);
  const clusters=[];
  // Coalesce nearby timestamps at this zoom. Click a group to inspect its period.
  for(const e of visible){
   const x=this.x(e.year),last=clusters.at(-1);
   if(last&&x-last.firstX<18&&(this.zoom<MAX_ZOOM||x===last.firstX)){last.events.push(e);last.xSum+=x}
   else clusters.push({events:[e],firstX:x,xSum:x});
  }
  const rows=[{dy:-43,right:-999},{dy:70,right:-999},{dy:-83,right:-999},{dy:110,right:-999}];
  for(const group of clusters){
   const x=group.xSum/group.events.length,e=group.events[0],grouped=group.events.length>1;
   // Keep terminal events independently clickable beside the world-selection tip.
   const nodeY=Math.abs(x-this.x(LAST_YEAR))<26?y-28:y;
   const current=grouped?this.hover?.cluster===group.events:this.hover?.event?.id===e.id;
   const isActive=this.nodeActive(branchId,e.year);
   const radius=grouped?5.6:current?6:4;
   ctx.fillStyle='#fafaf9';ctx.strokeStyle=isActive?'#151515':'#aaa';ctx.lineWidth=current?2.7:grouped?2.3:1.9;
   if(nodeY!==y){ctx.beginPath();ctx.moveTo(x,y-8);ctx.lineTo(x,nodeY+8);ctx.stroke()}
   pendingMarkers.push({x,y:nodeY,radius,current,grouped,isActive});
   this.hit.push(grouped?{x,y:nodeY,cluster:group.events,branchId}:{x,y:nodeY,event:e,branchId});
   if(grouped){
    if(group.events.length>1){ctx.textAlign='center';ctx.textBaseline='bottom';ctx.font=`600 ${dateSize}px system-ui`;ctx.fillStyle=isActive?'#656563':'#b4b4b1';ctx.fillText(String(group.events.length),x,nodeY-11)}
    continue;
   }
   if(this.zoom<.14||x<12||x>this.width-12)continue;
   const titleFont=`${current?'600':'500'} ${titleSize}px system-ui`,dateFont=`${dateSize}px system-ui`;
   ctx.font=titleFont;const shortened=fitCanvasText(ctx,eventLabel(e,this.lang),labelLimit),titleWidth=ctx.measureText(shortened).width;
   ctx.font=dateFont;const date=fitCanvasText(ctx,displayYear(e.year,this.lang),labelLimit);
   const width=Math.max(titleWidth,ctx.measureText(date).width);
   const left=clamp(x+10,12,Math.max(12,this.width-width-12));
   const row=rows.find(track=>y+track.dy>38&&y+track.dy<this.height-80&&left>track.right+16);
   if(!row)continue;
   const top=y+row.dy;
   const above=top<nodeY,edge=nodeY+(above?-1:1)*(radius+4);
   const bend=above?Math.min(top+14,edge):Math.max(top+14,edge);
   ctx.strokeStyle=isActive?'#c4c4c1':'#e0e0dd';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,edge);ctx.lineTo(x,bend);ctx.lineTo(left-2,bend);ctx.stroke();
   ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillStyle=isActive?'#40403c':'#9a9a96';ctx.font=titleFont;ctx.fillText(shortened,left,top);
   ctx.font=dateFont;ctx.fillStyle=isActive?'#999994':'#c1c1bd';ctx.fillText(date,left,top+dateOffset);
   row.right=left+width;
  }
  ctx.restore();
  if(!markers)for(const marker of pendingMarkers)this.drawEventMarker(marker);
 }

 branch(branch,i){
 const p=this.drawBranchTrace(branch,i,LAST_YEAR,false);if(!p)return;
 const ctx=this.ctx,active=this.active===branch.id;
 if(p.curveEnd+18<this.width&&p.curveEnd+18>0){
  ctx.save();ctx.letterSpacing='0px';ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.font='600 10px system-ui';ctx.fillStyle=active?'#292929':'#a1a19d';
  const left=clamp(p.curveEnd+12,12,Math.max(12,this.width-180));
  const title=fitCanvasText(ctx,`${String(i+2).padStart(3,'0')} / ${(this.lang==='zh'?branch.titleZh:branch.titleEn)||branch.prompt}`,Math.min(270,this.width-left-12));
  ctx.fillText(title,left,p.y-19);
  ctx.restore();
 }
}
 endCaps(){const ctx=this.ctx,x=this.x(LAST_YEAR),y=this.baseY();if(x>4&&x<this.width-10){ctx.textAlign='right';ctx.textBaseline='top';ctx.font='600 10px system-ui';ctx.fillStyle=this.active?'#a1a1a1':'#333';ctx.fillText(this.lang==='zh'?'2026年1月1日':'01 JAN 2026',x-12,y+16)}}
}
