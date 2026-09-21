import './designer.css';
import { GRID,MAX_ROOMS,roomTypes,floors,paints,newRoom,newDesignId,designTemplate,roomError,designWalls,validOpenings,validateDesign,designToPlan,planSVG } from './designs.js';
import { saveDesign,inventory,invested } from './state.js';
import { DEFAULT_CUSTOM_BUDGET,constructionTotal } from './construction.js';
import { createScene } from './scene.js';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone=x=>structuredClone(x),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export function createDesigner({getState,mutate,getError,getScope,onSaved,onDecorate}){
  const $=s=>document.querySelector(s);
  let draft,baseVersion=0,dirty=false,selected=null,selectedOpening=null,mode='select',view='2d',zoom=1,undo=[],redo=[],gesture=null,candidate=null,preview=null,busy=false,scope='',message='';
  document.body.insertAdjacentHTML('beforeend',`<dialog id="designer-dialog" class="designer-dialog" aria-labelledby="designer-title"><div class="designer-header"><div><span class="eyebrow">DRAW YOUR OWN PLACE</span><h2 id="designer-title">自己设计一套</h2></div><div class="designer-header-actions"><button id="design-export">导出平面图</button><button id="design-close" class="icon-button" aria-label="关闭设计器">×</button></div></div><div class="design-name-row"><label>户型名<input id="design-name" maxlength="30" aria-label="户型名称" placeholder="给这个户型起个名字"></label><span id="design-summary"></span><span id="design-status" role="status"></span></div><div class="design-budget-row"><label for="design-budget">房子总预算 · 游戏资金<input id="design-budget" type="number" min="1000" max="100000000" step="1" required aria-describedby="design-budget-help"></label><p id="design-budget-help">所有施工步骤合计等于这个金额。修改预算会重算完成比例，已经投入的钱保留。</p></div><div class="designer-toolbar"><div class="segmented"><button data-design-view="2d" class="active">画平面图</button><button data-design-view="3d">3D 预览</button></div><div class="design-tools" role="group" aria-label="绘图工具">${[['select','选择 / 移动'],['draw','画房间'],['door','门'],['window','窗'],['opening','开放通道'],['pan','移动画布']].map(([id,name])=>`<button data-design-tool="${id}" aria-pressed="${id===mode}">${name}</button>`).join('')}</div><div class="design-history"><button id="design-undo" aria-label="撤销设计修改">↶ 撤销</button><button id="design-redo" aria-label="重做设计修改">↷ 重做</button></div></div><div class="designer-workspace"><div class="design-stage"><div class="design-canvas-tools"><span id="design-hint">拖动房间移动，拖右下角改大小；也可以在右侧输入尺寸。</span><div><button id="design-zoom-out" aria-label="缩小画布">−</button><button id="design-zoom-reset">100%</button><button id="design-zoom-in" aria-label="放大画布">＋</button></div></div><div id="design-board-wrap"><svg id="design-board" viewBox="-1.5 -1.5 51 51" role="img" aria-label="自定义户型平面设计画布，每格半米"><defs><pattern id="design-grid" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M1 0H0V1" fill="none" stroke="#dfe5d6" stroke-width=".055"/></pattern><pattern id="design-grid-large" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill="url(#design-grid)"/><path d="M4 0H0V4" fill="none" stroke="#c8d3bf" stroke-width=".09"/></pattern></defs><rect width="48" height="48" fill="url(#design-grid-large)" stroke="#abbda0" stroke-width=".1"/><g id="design-shapes"></g></svg></div><div id="design-preview" hidden></div><div class="design-stage-foot"><span>每格 0.5 m · 单层 · 24 × 24 m 画布</span><button id="design-preview-home" hidden>重置视角</button><label id="design-roof-control" hidden><input id="design-roof" type="checkbox">看屋顶</label></div></div><aside class="design-inspector"><div class="design-add"><span class="eyebrow">ADD A ROOM</span><h3>先加一个房间</h3><div><select id="design-room-type" aria-label="新增房间类型">${roomTypes.map(([id,name])=>`<option value="${id}">${name}</option>`).join('')}</select><button id="design-add-room">＋ 添加</button></div><p>可以点添加，也可以选「画房间」后拖出大小。</p></div><div id="design-room-inspector"></div><div id="design-opening-inspector"></div><div class="design-template-box"><h3>从模板开始</h3><button data-design-template="studio">小公寓 · 4 个房间</button><button data-design-template="cozy">单层小屋 · 9 个房间</button><button data-design-template="cat-home">带猫房小屋 · 5 个房间</button><p>套用模板会替换当前草稿，可用撤销恢复。</p></div><div class="design-room-list"><h3>房间列表</h3><div id="design-room-list"></div></div></aside></div><div class="design-footer"><div><p id="design-message" role="status"></p><p class="design-save-note">关闭后草稿留在本机。保存后同步给对方，已投入的施工资金保留；删掉房间时，里面的物品收回仓库。</p></div><div class="design-save-actions"><button id="design-reload" hidden>载入最新版本</button><button id="design-save-copy" hidden>另存一份</button><button id="design-save" class="primary">保存户型</button></div></div></dialog>`);
  const dialog=$('#designer-dialog'),board=$('#design-board');
  const key=()=>`together-home-design-draft:${scope}:${draft.id}`;
  function persist(){if(!draft||!dirty)return;try{localStorage.setItem(key(),JSON.stringify({draft,baseVersion}));localStorage.setItem(`together-home-design-last:${scope}`,draft.id);}catch{message='本机空间不足，草稿暂时无法自动保存。请先保存户型。';}}
  function setMessage(text){message=text;$('#design-message').textContent=text;}
  function checkpoint(){undo.push(clone(draft));if(undo.length>40)undo.shift();redo=[];}
  function changed(text=''){dirty=true;message=text;persist();render();}
  function open(id){
    scope=getScope();const saved=getState().customPlans?.find(d=>d.id===id);draft=saved?clone(saved):designTemplate();baseVersion=saved?.version||0;dirty=false;
    try{const restoreId=id||localStorage.getItem(`together-home-design-last:${scope}`),raw=restoreId&&localStorage.getItem(`together-home-design-draft:${scope}:${restoreId}`);if(raw){const stash=JSON.parse(raw);validateDesign(stash.draft,{empty:true});draft=stash.draft;baseVersion=stash.baseVersion;dirty=true;}}catch{}
    selected=draft.rooms[0]?.id||null;selectedOpening=null;mode='select';view='2d';zoom=1;undo=[];redo=[];message=dirty?'上次没保存的草稿还在，可以接着改。':'';candidate=null;gesture=null;
    if(!dialog.open)dialog.showModal();render();sync();
  }
  function close(){if(busy)return;persist();dialog.close();}
  $('#design-close').onclick=close;
  dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();else persist();});
  dialog.addEventListener('close',()=>{persist();preview?.dispose();preview=null;});
  $('#design-name').onchange=e=>{const name=e.target.value.trim();if(!name){e.target.value=draft.name;setMessage('先给户型起个名字。');return;}checkpoint();draft.name=name;changed();};
  function readBudget(){const input=$('#design-budget'),budget=Number(input.value),paid=invested(getState(),draft.id),error=!Number.isSafeInteger(budget)||budget<1000||budget>100000000?'总预算请输入 1,000–100,000,000 之间的整数。':budget<paid?'总预算不能低于已投入的施工资金。':'';input.setCustomValidity(error);if(error){setMessage(error);return null;}return budget;}
  $('#design-budget').oninput=e=>e.target.setCustomValidity('');
  $('#design-budget').onchange=()=>{const budget=readBudget();if(budget===null)return;checkpoint();draft.budget=budget;changed('总预算已更新，保存后同步。');};
  function addRoom(){
    if(draft.rooms.length>=MAX_ROOMS){setMessage('一套户型最多 20 个房间。');return;}
    const room=newRoom($('#design-room-type').value);
    for(let z=4;z<=GRID-room.d;z+=2)for(let x=4;x<=GRID-room.w;x+=2){room.x=x;room.z=z;if(!roomError(room,draft.rooms)){checkpoint();draft.rooms.push(room);selected=room.id;selectedOpening=null;changed('房间加好了，拖一下试试。');return;}}
    setMessage('画布里没有这么大的空位，可以用「画房间」画一个小一些的。');
  }
  $('#design-add-room').onclick=addRoom;
  function applyRoom(next){const error=roomError(next,draft.rooms);if(error){setMessage(error);renderInspector();return false;}try{validateDesign({...draft,rooms:draft.rooms.map(r=>r.id===next.id?next:r),openings:[]},{empty:true});}catch(e){setMessage(e.message);renderInspector();return false;}
    checkpoint();draft.rooms=draft.rooms.map(r=>r.id===next.id?next:r);const count=draft.openings.length;draft.openings=validOpenings(draft.rooms,draft.openings);changed(count!==draft.openings.length?'位置变了，离开墙体的门窗已移除；可以撤销。':'');return true;
  }
  function renderInspector(){
    const r=draft.rooms.find(r=>r.id===selected),o=draft.openings.find(o=>o.id===selectedOpening);
    $('#design-room-inspector').innerHTML=r?`<div class="design-inspector-heading"><span class="eyebrow">ROOM DETAILS</span><h3>改改这个房间</h3></div><label>名字<input id="design-room-name" maxlength="24" value="${esc(r.name)}"></label><label>用途<select id="design-edit-type">${roomTypes.map(([id,name])=>`<option value="${id}" ${r.type===id?'selected':''}>${name}</option>`).join('')}</select></label><div class="room-dimensions">${[['x','左边距'],['z','上边距'],['w','宽'],['d','深']].map(([key,name])=>`<label>${name} · m<input id="room-${key}" type="number" min="${['w','d'].includes(key)?1:0}" max="24" step=".5" value="${r[key]/2}"></label>`).join('')}</div><label>地板<select id="design-floor">${floors.map(([id,name])=>`<option value="${id}" ${r.floor===id?'selected':''}>${name}</option>`).join('')}</select></label><label>墙面<select id="design-paint">${paints.map(([id,name])=>`<option value="${id}" ${r.paint===id?'selected':''}>${name}</option>`).join('')}</select></label><label class="design-furnished"><input id="design-furnished" type="checkbox" ${r.furnished?'checked':''}>显示默认家具</label><p class="inspector-help">关掉默认家具，就可以自己布置。猫房可以去商店的「猫猫家具」挑猫爬架、猫窝和喂食用品。</p><button id="design-remove-room" class="design-remove">移除这个房间</button>`:`<p class="design-nothing">点一个房间，就能改尺寸、墙色和地板。</p>`;
    if(r){
      $('#design-room-name').onchange=e=>applyRoom({...r,name:e.target.value.trim()});$('#design-edit-type').onchange=e=>applyRoom({...r,type:e.target.value});
      for(const k of ['x','z','w','d'])$(`#room-${k}`).onchange=e=>applyRoom({...r,[k]:Number(e.target.value)*2});
      $('#design-floor').onchange=e=>applyRoom({...r,floor:e.target.value});$('#design-paint').onchange=e=>applyRoom({...r,paint:e.target.value});$('#design-furnished').onchange=e=>applyRoom({...r,furnished:e.target.checked});
      $('#design-remove-room').onclick=()=>{checkpoint();draft.rooms=draft.rooms.filter(v=>v.id!==r.id);draft.openings=validOpenings(draft.rooms,draft.openings);selected=null;changed('房间从草稿里移除了。里面的物品会在保存后收回仓库。');};
    }
    $('#design-opening-inspector').innerHTML=o?`<h3>调整门窗</h3><label>类型<select id="design-opening-kind">${[['door','门'],['window','窗'],['opening','开放通道']].map(([id,name])=>`<option value="${id}" ${o.kind===id?'selected':''}>${name}</option>`).join('')}</select></label><label>宽度 · m<input id="design-opening-width" type="number" min=".5" max="4" step=".5" value="${o.width/2}"></label><button id="design-remove-opening" class="design-remove">移除这处门窗</button>`:'';
    if(o){const edit=patch=>{const next={...o,...patch};try{validateDesign({...draft,openings:draft.openings.map(v=>v.id===o.id?next:v)});checkpoint();draft.openings=draft.openings.map(v=>v.id===o.id?next:v);changed();}catch(e){setMessage(e.message);renderInspector();}};$('#design-opening-kind').onchange=e=>edit({kind:e.target.value});$('#design-opening-width').onchange=e=>edit({width:Number(e.target.value)*2});$('#design-remove-opening').onclick=()=>{checkpoint();draft.openings=draft.openings.filter(v=>v.id!==o.id);selectedOpening=null;changed();};}
  }
  function renderBoard(){
    const current=draft.rooms.map(r=>candidate?.id===r.id?candidate:r),walls=designWalls(current),drawn=candidate&&!current.some(r=>r.id===candidate.id)?[...current,candidate]:current;
    const invalid=candidate?!!roomError(candidate,draft.rooms):false;
    $('#design-shapes').innerHTML=`${Array.from({length:7},(_,i)=>`<text x="${i*8}" y="-.6" font-size=".6" fill="#8d9c83" text-anchor="middle">${i*4}m</text><text x="-.5" y="${i*8+.2}" font-size=".6" fill="#8d9c83" text-anchor="end">${i*4}</text>`).join('')}${drawn.map(r=>`<g data-design-room="${r.id}" class="design-room-shape ${r.id===selected?'selected':''}"><rect x="${r.x}" y="${r.z}" width="${r.w}" height="${r.d}" fill="${invalid&&r.id===candidate?.id?'#d5a59b':floors.find(f=>f[0]===r.floor)[2]}" fill-opacity=".7" stroke="${r.id===selected?'#527647':'#839574'}" stroke-width="${r.id===selected ? .23 : .12}"/><text x="${r.x+r.w/2}" y="${r.z+r.d/2-.3}" font-size="${Math.min(.85,r.w/Math.max(3,r.name.length)*.8)}" text-anchor="middle" fill="#465b40">${esc(r.name)}</text><text x="${r.x+r.w/2}" y="${r.z+r.d/2+.65}" font-size=".6" text-anchor="middle" fill="#657956">${r.w/2} × ${r.d/2} m</text>${r.id===selected?`<circle data-design-resize="${r.id}" cx="${r.x+r.w}" cy="${r.z+r.d}" r=".5" fill="#668452" stroke="#f8f7e9" stroke-width=".16"/>`:''}</g>`).join('')}${walls.map(w=>`<path d="M${w.a.join(' ')}L${w.b.join(' ')}" stroke="#6c7c61" stroke-width=".16" pointer-events="none"/>`).join('')}${draft.openings.map(o=>{const x=o.x-(o.axis==='x'?o.width/2:0),z=o.z-(o.axis==='z'?o.width/2:0);return `<g data-design-opening="${o.id}"><path d="M${x} ${z}l${o.axis==='x'?o.width:0} ${o.axis==='z'?o.width:0}" stroke="${o.id===selectedOpening?'#be9861':o.kind==='window'?'#84b5bf':'#faf8e9'}" stroke-width=".48"/><path d="M${x} ${z}l${o.axis==='x'?o.width:0} ${o.axis==='z'?o.width:0}" stroke="transparent" stroke-width="1.1"/>${o.kind==='door'?`<circle cx="${x}" cy="${z}" r=".2" fill="#a48e69" pointer-events="none"/>`:''}</g>`;}).join('')}`;
  }
  function renderPreview(){
    if(view!=='3d')return;if(!draft.rooms.length){preview?.dispose();preview=null;$('#design-preview').textContent='先加一个房间，再来看看 3D。';return;}
    if(!preview){$('#design-preview').replaceChildren();preview=createScene($('#design-preview'),id=>{selected=id;selectedOpening=null;preview?.select(id);renderInspector();renderList();});}
    preview.update(designToPlan(draft),{preview:true,interior:!$('#design-roof').checked,labels:true,amount:constructionTotal(designToPlan(draft)),inventory:inventory(getState()),placements:getState().placements||[]});preview.select(selected);
  }
  function renderList(){$('#design-room-list').innerHTML=draft.rooms.length?draft.rooms.map(r=>`<button data-design-pick="${r.id}" class="${r.id===selected?'active':''}"><span>${esc(r.name)}</span><small>${r.w*r.d/4} m²</small></button>`).join(''):'<p>还没画房间。</p>';$('#design-room-list').querySelectorAll('button').forEach(b=>b.onclick=()=>{selected=b.dataset.designPick;selectedOpening=null;renderInspector();renderBoard();renderList();preview?.select(selected);});}
  function render(){
    $('#design-name').value=draft.name;$('#design-budget').value=draft.budget??DEFAULT_CUSTOM_BUDGET;$('#design-budget').setCustomValidity('');$('#design-summary').textContent=`${draft.rooms.length} / 20 个房间 · ${draft.rooms.reduce((n,r)=>n+r.w*r.d/4,0)} m²`;
    $('#design-message').textContent=message;$('#design-status').textContent=dirty?'草稿已留在本机':baseVersion?'已保存 · 版本 '+baseVersion:'还没保存';
    $('#design-undo').disabled=!undo.length;$('#design-redo').disabled=!redo.length;$('#design-save').disabled=!draft.rooms.length||busy;$('#design-add-room').disabled=draft.rooms.length>=MAX_ROOMS;
    document.querySelectorAll('[data-design-tool]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.designTool===mode));document.querySelectorAll('[data-design-view]').forEach(b=>b.classList.toggle('active',b.dataset.designView===view));
    $('#design-board-wrap').hidden=view!=='2d';$('#design-preview').hidden=view!=='3d';$('#design-preview-home').hidden=view!=='3d';$('#design-roof-control').hidden=view!=='3d';$('.design-canvas-tools').hidden=view!=='2d';
    board.style.width=`${zoom*100}%`;board.style.touchAction='none';board.style.cursor=mode==='draw'?'crosshair':mode==='pan'?'grab':'default';$('#design-zoom-reset').textContent=`${Math.round(zoom*100)}%`;
    $('#design-hint').textContent=mode==='draw'?'按住空白位置，拖出一个房间。':mode==='select'?'拖动房间移动，拖右下角改大小；也可以在右侧输入尺寸。':mode==='pan'?'滑动或滚动画布；点「选择 / 移动」继续修改。':'点一下墙壁，放上'+({door:'门',window:'窗',opening:'开放通道'}[mode])+'。';
    renderBoard();renderInspector();renderList();renderPreview();sync();
  }
  document.querySelectorAll('[data-design-tool]').forEach(b=>b.onclick=()=>{mode=b.dataset.designTool;view='2d';render();});
  document.querySelectorAll('[data-design-view]').forEach(b=>b.onclick=()=>{view=b.dataset.designView;render();if(view==='3d')preview?.home();});
  $('#design-preview-home').onclick=()=>preview?.home();$('#design-roof').onchange=renderPreview;
  $('#design-zoom-in').onclick=()=>{zoom=Math.min(3,zoom+.5);render();};$('#design-zoom-out').onclick=()=>{zoom=Math.max(1,zoom-.5);render();};$('#design-zoom-reset').onclick=()=>{zoom=1;render();$('#design-board-wrap').scrollTo(0,0);};
  $('#design-undo').onclick=()=>{if(!undo.length)return;redo.push(clone(draft));draft=undo.pop();selected=null;selectedOpening=null;changed('已撤销。');};
  $('#design-redo').onclick=()=>{if(!redo.length)return;undo.push(clone(draft));draft=redo.pop();selected=null;selectedOpening=null;changed('已重做。');};
  document.querySelectorAll('[data-design-template]').forEach(b=>b.onclick=()=>{checkpoint();const next=designTemplate(b.dataset.designTemplate);draft={...next,id:draft.id,name:baseVersion?draft.name:next.name,budget:draft.budget??DEFAULT_CUSTOM_BUDGET};selected=draft.rooms.find(r=>r.type==='cat')?.id||draft.rooms[0]?.id;selectedOpening=null;changed('模板已套用。房间、门窗、颜色都可以接着改。');});
  const point=e=>{const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(board.getScreenCTM().inverse());return {x:clamp(Math.round(p.x),0,GRID),z:clamp(Math.round(p.y),0,GRID)};};
  function addOpening(p){
    const wall=designWalls(draft.rooms).map(w=>({...w,distance:Math.hypot((w.axis==='x'?p.z:p.x)-w.fixed,(w.axis==='x'?p.x:p.z)-clamp(w.axis==='x'?p.x:p.z,w.start,w.end))})).sort((a,b)=>a.distance-b.distance)[0];
    if(!wall||wall.distance>1.2){setMessage('点在墙边就可以放门窗。');return;}
    const width=mode==='window'?3:mode==='opening'?4:2,min=wall.start+width/2+.5,max=wall.end-width/2-.5;
    if(min>max){setMessage('这段墙比较短，先放一扇门，再在右侧调整宽度。');return;}
    const t=clamp(wall.axis==='x'?p.x:p.z,min,max),o={id:'o-'+crypto.randomUUID(),kind:mode,axis:wall.axis,x:wall.axis==='x'?t:wall.fixed,z:wall.axis==='x'?wall.fixed:t,width};
    try{validateDesign({...draft,openings:[...draft.openings,o]});checkpoint();draft.openings.push(o);selectedOpening=o.id;selected=null;changed('放好了。点「选择 / 移动」再点它，可以改宽度或移除。');}catch(e){setMessage(e.message);}
  }
  board.addEventListener('pointerdown',e=>{
    if(busy||e.button!==0)return;if(mode==='pan'){const wrap=$('#design-board-wrap');gesture={kind:'pan',client:[e.clientX,e.clientY],scroll:[wrap.scrollLeft,wrap.scrollTop]};board.setPointerCapture(e.pointerId);e.preventDefault();return;}const p=point(e);
    if(['door','window','opening'].includes(mode)){addOpening(p);return;}
    const roomId=e.target.closest('[data-design-room]')?.dataset.designRoom,resize=e.target.dataset.designResize,opening=e.target.closest('[data-design-opening]')?.dataset.designOpening;
    if(mode==='draw'){if(draft.rooms.length>=MAX_ROOMS){setMessage('最多 20 个房间。');return;}gesture={kind:'draw',start:p,id:'r-'+crypto.randomUUID()};}
    else if(opening){selectedOpening=opening;selected=null;render();return;}
    else if(roomId){selected=roomId;selectedOpening=null;gesture={kind:resize?'resize':'move',start:p,room:clone(draft.rooms.find(r=>r.id===roomId))};renderInspector();renderList();renderBoard();}
    else{selected=null;selectedOpening=null;render();return;}
    board.setPointerCapture(e.pointerId);e.preventDefault();
  });
  board.addEventListener('pointermove',e=>{
    if(!gesture)return;if(gesture.kind==='pan'){const wrap=$('#design-board-wrap');wrap.scrollLeft=gesture.scroll[0]-(e.clientX-gesture.client[0]);wrap.scrollTop=gesture.scroll[1]-(e.clientY-gesture.client[1]);return;}const p=point(e),dx=p.x-gesture.start.x,dz=p.z-gesture.start.z;
    if(gesture.kind==='draw'){candidate={...newRoom($('#design-room-type').value,Math.min(p.x,gesture.start.x),Math.min(p.z,gesture.start.z),Math.abs(dx),Math.abs(dz)),id:gesture.id};}
    else if(gesture.kind==='move')candidate={...gesture.room,x:clamp(gesture.room.x+dx,0,GRID-gesture.room.w),z:clamp(gesture.room.z+dz,0,GRID-gesture.room.d)};
    else candidate={...gesture.room,w:clamp(gesture.room.w+dx,2,GRID-gesture.room.x),d:clamp(gesture.room.d+dz,2,GRID-gesture.room.z)};
    renderBoard();
  });
  function endGesture(e){if(!gesture)return;const g=gesture,next=candidate;gesture=null;candidate=null;if(board.hasPointerCapture(e.pointerId))board.releasePointerCapture(e.pointerId);if(!next){renderBoard();return;}const error=roomError(next,draft.rooms);if(error){setMessage(error);renderBoard();return;}if(g.kind==='draw'){checkpoint();draft.rooms.push(next);selected=next.id;selectedOpening=null;changed('房间画好了。');}else applyRoom(next);}
  board.addEventListener('pointerup',endGesture);board.addEventListener('pointercancel',()=>{gesture=null;candidate=null;renderBoard();});
  async function save(){
    if(busy)return;const budget=readBudget();if(budget===null){$('#design-budget').reportValidity();return;}draft.budget=budget;try{validateDesign(draft);}catch(e){setMessage(e.message);return;}
    busy=true;const action={type:'design',design:clone(draft),expectedVersion:baseVersion};const controls=[...dialog.querySelectorAll('input,select,button')];controls.forEach(b=>b.disabled=true);$('#design-save').textContent='正在保存…';
    try{const result=await mutate(s=>saveDesign(s,action),action);if(result){const oldKey=key();draft=clone(getState().customPlans.find(d=>d.id===draft.id));baseVersion=draft.version;dirty=false;localStorage.removeItem(oldKey);localStorage.removeItem(`together-home-design-last:${scope}`);dialog.close();onSaved(draft.id);}else{persist();setMessage(getError());sync();}}
    finally{busy=false;controls.forEach(b=>b.disabled=false);$('#design-save').textContent='保存户型';if(dialog.open){$('#design-undo').disabled=!undo.length;$('#design-redo').disabled=!redo.length;}}
  }
  $('#design-save').onclick=save;
  $('#design-save-copy').onclick=async()=>{const originalKey=key();draft={...draft,id:newDesignId(),name:(draft.name+' 副本').slice(0,30)};baseVersion=0;dirty=true;persist();await save();if(!dirty)localStorage.removeItem(originalKey);};
  $('#design-reload').onclick=()=>{const saved=getState().customPlans?.find(d=>d.id===draft.id);if(!saved)return;checkpoint();draft=clone(saved);baseVersion=saved.version;dirty=false;localStorage.removeItem(key());selected=null;selectedOpening=null;message='已载入最新版本。刚才的草稿还可以通过撤销找回。';render();};
  $('#design-export').onclick=()=>{if(!draft.rooms.length){setMessage('先加一个房间，再导出平面图。');return;}const url=URL.createObjectURL(new Blob([planSVG(draft)],{type:'image/svg+xml'})),a=document.createElement('a');a.href=url;a.download='my-floorplan.svg';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  function sync(){if(!dialog.open||!draft)return;const live=getState().customPlans?.find(d=>d.id===draft.id),conflict=!!live&&live.version!==baseVersion;$('#design-reload').hidden=!conflict;$('#design-save-copy').hidden=!conflict;if(conflict&&!busy)$('#design-status').textContent='对方有新版本 · 本机草稿保留中';}
  return {open,sync};
}
