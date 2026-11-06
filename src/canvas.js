import {BASELINE,FIRST_YEAR,LAST_YEAR,displayYear,eventLabel} from './data.js';

const clamp=(n,lo,hi)=>Math.min(hi,Math.max(lo,n));
export class WorldCanvas{
 constructor(element,{onEvent=()=>{},onBranch=()=>{},onYear=()=>{}}={}){
  this.el=element;this.ctx=element.getContext('2d');this.onEvent=onEvent;this.onBranch=onBranch;this.onYear=onYear;
  this.year=1680;this.zoom=.36;this.vertical=0;this.drag=null;this.hit=[];this.branches=[];this.active=null;this.lang='en';this.pointers=new Map();this.pinching=null;this.hover=null;this.width=1;this.height=1;this.dpr=1;this._raf=0;
  this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(element);
  element.addEventListener('pointerdown',e=>this.pointerDown(e));element.addEventListener('pointermove',e=>this.pointerMove(e));element.addEventListener('pointerup',e=>this.pointerUp(e));element.addEventListener('pointercancel',e=>this.pointerUp(e));
  element.addEventListener('wheel',e=>this.wheel(e),{passive:false});element.addEventListener('dblclick',e=>{const item=this.nearest(e.offsetX,e.offsetY);if(item?.cluster)this.zoomCluster(item);else if(item?.event)this.focus(item.event.year,Math.max(.38,this.zoom));});
  this.resize();
 }
 dispose(){this.resizeObserver.disconnect();cancelAnimationFrame(this._raf)}
 setState(branches,active,lang){this.branches=branches||[];this.active=active;this.lang=lang;this.invalidate()}
 resize(){const r=this.el.getBoundingClientRect();if(!r.width||!r.height)return;this.width=r.width;this.height=r.height;this.dpr=Math.min(2.5,window.devicePixelRatio||1);this.el.width=Math.floor(r.width*this.dpr);this.el.height=Math.floor(r.height*this.dpr);this.ctx.setTransform(this.dpr,0,0,this.dpr,0,0);this.invalidate()}
 invalidate(){if(!this._raf)this._raf=requestAnimationFrame(()=>{this._raf=0;this.draw()})}
 x(y){return this.width*.54+(y-this.year)*this.zoom}
 at(x){return this.year+(x-this.width*.54)/this.zoom}
 baseY(){return this.height*.59+this.vertical}
 laneY(index){return this.baseY()-144-index*114}
 focus(year,zoom=this.zoom){if(Number.isFinite(year)){this.year=year;this.zoom=clamp(zoom,.025,12);this.vertical=0;this.invalidate();this.onYear(this.year)}}
 fit(){this.zoom=clamp((this.width-160)/(LAST_YEAR-FIRST_YEAR),.025,12);this.year=(FIRST_YEAR+LAST_YEAR)/2;this.vertical=0;this.invalidate();this.onYear(this.year)}
 zoomAt(factor,x=this.width/2){const before=this.at(x);this.zoom=clamp(this.zoom*factor,.025,12);this.year=before-(x-this.width*.54)/this.zoom;this.invalidate();this.onYear(this.year)}
 nearest(x,y){let closest=null,best=22;for(const h of this.hit){const d=Math.hypot(h.x-x,h.y-y);if(d<best){closest=h;best=d}}return closest}
 zoomCluster(item){const events=item?.cluster;if(!events?.length)return;const from=events[0].year,to=events.at(-1).year;if(this.zoom>=11.99){this.onEvent(events[0],item.branchId);return}this.focus(Math.round((from+to)/2),Math.max(this.zoom*2.8,Math.min(12,72/Math.max(to-from,1))))}
 pointerDown(e){if(e.button!==0&&e.pointerType==='mouse')return;this.el.setPointerCapture?.(e.pointerId);this.pointers.set(e.pointerId,{x:e.offsetX,y:e.offsetY});if(this.pointers.size===2){const p=[...this.pointers.values()];this.pinching={distance:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y),zoom:this.zoom};this.drag=null;return}this.drag={x:e.offsetX,y:e.offsetY,year:this.year,vertical:this.vertical,moved:false};this.el.style.cursor='grabbing'}
 pointerMove(e){if(this.pointers.has(e.pointerId))this.pointers.set(e.pointerId,{x:e.offsetX,y:e.offsetY});if(this.pointers.size>=2&&this.pinching){const p=[...this.pointers.values()],d=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);const mid=(p[0].x+p[1].x)/2;this.zoomAt((this.pinching.zoom*clamp(d/Math.max(this.pinching.distance,1),.25,4))/this.zoom,mid);return}
 if(this.drag){const dx=e.offsetX-this.drag.x,dy=e.offsetY-this.drag.y;if(Math.hypot(dx,dy)>5)this.drag.moved=true;this.year=this.drag.year-dx/this.zoom;this.vertical=clamp(this.drag.vertical+dy,-900,900);this.invalidate();this.onYear(this.year)}else{const item=this.nearest(e.offsetX,e.offsetY);this.hover=item;this.el.style.cursor=item?'pointer':'grab';this.invalidate();const tip=document.getElementById('canvas-tooltip');if(tip){if(item){tip.hidden=false;tip.textContent=item.cluster?(item.cluster.length+' '+(this.lang==='zh'?'个事件 · 点击放大':'events · click to zoom')):item.event?`${displayYear(item.event.year,this.lang)} · ${eventLabel(item.event,this.lang)}`:(this.lang==='zh'?'选择世界线':'Select worldline');tip.style.left=`${clamp(e.offsetX+18,8,this.width-230)}px`;tip.style.top=`${clamp(e.offsetY-20,8,this.height-54)}px`}else tip.hidden=true}}
 }
 pointerUp(e){this.pointers.delete(e.pointerId);const prior=this.drag;this.drag=null;if(this.pointers.size<2)this.pinching=null;this.el.style.cursor='grab';if(prior&&!prior.moved){const hit=this.nearest(e.offsetX,e.offsetY);if(hit?.cluster)this.zoomCluster(hit);else if(hit?.event)this.onEvent(hit.event,hit.branchId);else if(hit?.branchId)this.onBranch(hit.branchId)}else if(prior)this.onYear(this.year)}
 wheel(e){e.preventDefault();const factor=Math.exp(-e.deltaY*.0012);this.zoomAt(factor,e.offsetX)}
 draw(){const ctx=this.ctx,w=this.width,h=this.height;if(!w||!h)return;
  ctx.clearRect(0,0,w,h);ctx.fillStyle='#fafaf9';ctx.fillRect(0,0,w,h);
  this.grid();this.hit=[];const baselineY=this.baseY();this.worldline(FIRST_YEAR,LAST_YEAR,baselineY,!!this.active);
  const evts=BASELINE.filter(e=>e.year>=FIRST_YEAR&&e.year<=LAST_YEAR);this.nodes(evts,baselineY,null,!this.active);
  for(let i=0;i<this.branches.length;i++){const b=this.branches[i];this.branch(b,i)}
  this.endCaps();
 }
 grid(){const ctx=this.ctx,w=this.width,h=this.height;
  ctx.strokeStyle='#e8e8e5';ctx.lineWidth=1;ctx.setLineDash([1,7]);
  const rowBase=this.baseY();for(let y=((rowBase%114)+114)%114;y<h;y+=114){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}
  let interval=[1,2,5,10,20,50,100,200,500,1000,2000].find(v=>v*this.zoom>=96)||2000;
  const start=Math.floor(this.at(0)/interval)*interval;
  ctx.font='10px "Inter",system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='top';
  for(let year=start;year<=this.at(w)+interval;year+=interval){const x=this.x(year);if(x<0||x>w)continue;ctx.strokeStyle='#e9e9e6';ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();ctx.fillStyle='#ababaa';ctx.fillText(displayYear(year,this.lang),x,Math.max(12,Math.min(this.baseY()+43,h-36)))}
  ctx.setLineDash([]);
 }
 worldline(from,to,y,muted){const ctx=this.ctx,x1=this.x(from),x2=this.x(to);if(x2<0||x1>this.width)return;
 ctx.lineCap='round';ctx.strokeStyle=muted?'#c8c8c6':'#21211f';ctx.lineWidth=muted?1.5:2.3;ctx.beginPath();ctx.moveTo(x1,y);ctx.lineTo(x2,y);ctx.stroke();
 ctx.fillStyle=muted?'#b8b8b7':'#21211f';ctx.beginPath();ctx.arc(clamp(x1,-100,this.width+100),y,3,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(clamp(x2,-100,this.width+100),y,4,0,Math.PI*2);ctx.fill();
 if(x1<this.width-90&&x2>0){ctx.font='600 10px system-ui';ctx.letterSpacing='1px';ctx.textAlign='left';ctx.fillStyle=muted?'#aaa':'#414141';ctx.fillText(this.lang==='zh'?'现实世界线 / 001':'REALITY / 001',clamp(x1+22,16,this.width-150),y-23)}
 }

 nodes(events,y,branchId,unmuted){
  const ctx=this.ctx;
  const visible=events.filter(e=>this.x(e.year)>-25&&this.x(e.year)<this.width+25).sort((a,b)=>a.year-b.year);
  const clusters=[];
  // Coalesce nearby timestamps at this zoom. Click a group to inspect its period.
  for(const e of visible){
   const x=this.x(e.year),last=clusters.at(-1);
   if(last&&x-last.firstX<18&&this.zoom<11.99){last.events.push(e);last.xSum+=x}
   else clusters.push({events:[e],firstX:x,xSum:x});
  }
  const rows=[{dy:-53,right:-999},{dy:-103,right:-999},{dy:-153,right:-999}];
  for(const group of clusters){
   const x=group.xSum/group.events.length,e=group.events[0],grouped=group.events.length>1;
   const current=grouped?this.hover?.cluster===group.events:this.hover?.event?.id===e.id;
   const isActive=unmuted||branchId===this.active;
   const radius=grouped?5.6:current?6:4;
   ctx.fillStyle='#fafaf9';ctx.strokeStyle=isActive?'#151515':'#aaa';ctx.lineWidth=current?2.7:grouped?2.3:1.9;
   ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();ctx.stroke();
   if(!grouped){ctx.beginPath();ctx.arc(x,y,1.2,0,Math.PI*2);ctx.fillStyle=isActive?'#1d1d1d':'#bcbcbc';ctx.fill()}
   this.hit.push(grouped?{x,y,cluster:group.events,branchId}:{x,y,event:e,branchId});
   if(grouped){
    if(group.events.length>2){ctx.textAlign='center';ctx.textBaseline='bottom';ctx.font='600 9px system-ui';ctx.fillStyle=isActive?'#656563':'#b4b4b1';ctx.fillText(String(group.events.length),x,y-11)}
    continue;
   }
   if(this.zoom<.14||x<12||x>this.width-12)continue;
   const title=eventLabel(e,this.lang),maxLength=this.zoom<.45?19:26;
   const shortened=title.length>maxLength?title.slice(0,maxLength-1)+'…':title;
   ctx.font='500 10.5px system-ui';const width=Math.min(170,Math.max(66,ctx.measureText(shortened).width+5));
   const left=clamp(x+10,12,Math.max(12,this.width-width-12));
   const row=rows.find(track=>y+track.dy>150&&y+track.dy<this.height-130&&left>track.right+16);
   if(!row)continue;
   const top=y+row.dy;
   ctx.strokeStyle=isActive?'#c4c4c1':'#e0e0dd';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,y-8);ctx.lineTo(x,top+14);ctx.lineTo(left-2,top+14);ctx.stroke();
   ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillStyle=isActive?'#40403c':'#9a9a96';ctx.font=(current?'600':'500')+' 10.5px system-ui';ctx.fillText(shortened,left,top,width);
   ctx.font='9px system-ui';ctx.fillStyle=isActive?'#999994':'#c1c1bd';ctx.fillText(displayYear(e.year,this.lang),left,top+16,width);
   row.right=left+width;
  }
 }

 branch(branch,i){const ctx=this.ctx,ay=this.branches.findIndex(b=>b.id===branch.parentId),parentY=ay<0?this.baseY():this.laneY(ay),y=this.laneY(i),x=this.x(branch.anchorYear),end=this.x(LAST_YEAR),active=this.active===branch.id;
  if(end<0||x>this.width)return;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=active?'#171717':'#b4b4b2';ctx.lineWidth=active?2.4:1.5;
  const dx=clamp((end-x)*.2,42,125);ctx.beginPath();ctx.moveTo(x,parentY);ctx.bezierCurveTo(x+dx*.3,parentY,x+dx*.55,y,x+dx,y);ctx.lineTo(end,y);ctx.stroke();
  ctx.beginPath();ctx.arc(x,parentY,5,0,Math.PI*2);ctx.fillStyle=active?'#171717':'#b4b4b2';ctx.fill();
  if(x+dx+20<this.width&&x+dx+20>0){ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.font='600 10px system-ui';ctx.fillStyle=active?'#111':'#999';ctx.fillText(`${String(i+2).padStart(3,'0')} / ${(this.lang==='zh'?branch.titleZh:branch.titleEn)||branch.prompt}`.slice(0,60),clamp(x+dx+14,14,this.width-170),y-20,280)}
  if(end>-20&&end<this.width+20){ctx.beginPath();ctx.arc(end,y,4,0,Math.PI*2);ctx.fill()}
  this.hit.push({x:clamp(x+dx+40,0,this.width),y,branchId:branch.id});this.nodes(branch.events||[],y,branch.id,active);
 }
 endCaps(){const ctx=this.ctx,x=this.x(LAST_YEAR),y=this.baseY();if(x>4&&x<this.width-10){ctx.textAlign='right';ctx.textBaseline='top';ctx.font='600 10px system-ui';ctx.fillStyle=this.active?'#a1a1a1':'#333';ctx.fillText(this.lang==='zh'?'2026年1月1日':'01 JAN 2026',x-12,y+16)}}
}