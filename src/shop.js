import './shop.css';
import { furnitureThumbnail } from './furniture-thumbnails.js';
import { items,categories,getItem,quote,optionGroups,itemName,configName,placementRooms,placementSlots } from './items.js';
import { allPlans,getPlan as resolvePlan } from './plans.js';
import { inventory,balance,purchase,placeItem } from './state.js';
import { createItemPreview } from './item-mesh.js';

const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>'$'+n.toLocaleString('en-US');
function thumbnail(item,owned){
  if(item.category==='furniture'||item.category==='cats')return furnitureThumbnail(item);
  if(item.image)return `<img src="${import.meta.env.BASE_URL}${item.image}" loading="lazy" alt="LEGO ${item.set} ${esc(item.name)} 官方参考图">`;
  const variant=item.variants?.find(v=>v.id===owned?.variant),c=variant?.color||item.color;
  let drawing='';
  if(item.category==='cars')drawing=`<path d="M35 91h10l19-31h66l28 29 20 7v28H35Z" fill="${c}"/><path d="m73 64-14 25h87l-23-25Z" fill="#a1b8b8"/><path d="M102 64v25" stroke="#e5e7db" stroke-width="4"/><rect x="40" y="99" width="22" height="7" rx="3" fill="#eee6c9"/><circle cx="65" cy="123" r="19" fill="#47534e"/><circle cx="149" cy="123" r="19" fill="#47534e"/><circle cx="65" cy="123" r="10" fill="#bcc2b7"/><circle cx="149" cy="123" r="10" fill="#bcc2b7"/>`;
  else if(item.category==='blind'&&!variant)drawing=`<path d="m66 46 48-14 47 20-48 17Z" fill="#e4dcca"/><path d="m66 46 47 23v83l-47-22Z" fill="${c}"/><path d="m113 69 48-17v82l-48 18Z" fill="${c}" opacity=".78"/><path d="m92 56 48-16" stroke="#f2ebdc" stroke-width="5"/><text x="87" y="111" fill="#f9f3e8" font-size="38" font-family="Georgia">?</text>`;
  else if(item.category==='plush'||variant)drawing=`<ellipse cx="111" cy="116" rx="37" ry="35" fill="${c}"/><ellipse cx="85" cy="52" rx="14" ry="${(variant?.shape||item.shape).includes('rabbit')?30:17}" fill="${c}"/><ellipse cx="137" cy="52" rx="14" ry="${(variant?.shape||item.shape).includes('rabbit')?30:17}" fill="${c}"/><ellipse cx="111" cy="81" rx="40" ry="35" fill="${c}"/><ellipse cx="98" cy="80" rx="3" ry="5" fill="#43514a"/><ellipse cx="124" cy="80" rx="3" ry="5" fill="#43514a"/><ellipse cx="111" cy="94" rx="5" ry="3" fill="#86695b"/><ellipse cx="78" cy="115" rx="13" ry="18" fill="${c}"/><ellipse cx="144" cy="115" rx="13" ry="18" fill="${c}"/><ellipse cx="88" cy="146" rx="18" ry="10" fill="${c}"/><ellipse cx="134" cy="146" rx="18" ry="10" fill="${c}"/>`;
  else if(item.shape==='plant'||item.shape==='flowers')drawing=`<path d="m91 109 7 41h31l7-41Z" fill="#b8a082"/><path d="M113 111V52m0 37L87 72m26 8 27-22" stroke="#71876c" stroke-width="4"/><ellipse cx="99" cy="68" rx="22" ry="10" transform="rotate(38 99 68)" fill="${c}"/><ellipse cx="128" cy="54" rx="24" ry="11" transform="rotate(-42 128 54)" fill="${c}"/><ellipse cx="131" cy="93" rx="22" ry="10" transform="rotate(-30 131 93)" fill="${c}"/>`;
  else if(item.shape==='lamp')drawing=`<ellipse cx="111" cy="147" rx="28" ry="7" fill="#95977e"/><path d="M111 75v70" stroke="#8e8f79" stroke-width="6"/><path d="M67 79a44 42 0 0 1 88 0Z" fill="${c}"/>`;
  else if(item.shape==='rug'||item.shape==='table')drawing=`<ellipse cx="111" cy="106" rx="67" ry="35" fill="${c}"/><ellipse cx="111" cy="106" rx="52" ry="25" fill="none" stroke="#ddd5ba" stroke-width="3"/>${item.shape==='table'?'<path d="m79 123-4 28m67-28 4 28" stroke="#8d7656" stroke-width="7"/>':''}`;
  else if(item.shape==='chair')drawing=`<rect x="69" y="47" width="83" height="73" rx="18" fill="${c}"/><rect x="63" y="103" width="95" height="27" rx="10" fill="${c}"/><path d="M69 119V85m83 34V85" stroke="#879b89" stroke-width="13" stroke-linecap="round"/><path d="m78 130-4 22m70-22 4 22" stroke="#9a8364" stroke-width="7"/>`;
  else drawing=`<rect x="62" y="44" width="99" height="105" rx="3" fill="${c}"/><path d="M69 75h85M69 107h85M69 138h85" stroke="#e1c9a2" stroke-width="5"/><path d="M79 72V53m12 19V52m12 20V57m18 47V83m11 21V79m12 25V84" stroke="#6f867c" stroke-width="8"/>`;
  return `<svg viewBox="0 0 220 180" role="img" aria-label="${esc(variant?.name||item.name)} 示意"><ellipse cx="112" cy="156" rx="69" ry="9" fill="#788a6a" opacity=".1"/>${drawing}</svg>`;
}

export function createShop({getState,mutate,getPerson,getError,showInRoom,toast}){
  const $=s=>document.querySelector(s);
  const getPlan=id=>resolvePlan(id,getState());
  let category='lego',ownedView=false,expanded=false,search='',lastKey='',preview=null,active=null,config={},purchaseBusy=false,position=null;
  $('#journal').insertAdjacentHTML('beforebegin',`<section class="shop" id="shop" aria-labelledby="shop-title"><div class="shop-heading"><div><span class="eyebrow">A FEW NICE THINGS</span><h2 id="shop-title">给房间添点东西</h2><p>挑家具，布置个猫房，也可以逛街景、配车或拆盲盒。买完就在 3D 房间里摆一下。</p></div><div class="shop-wallet"><span>共同游戏资金</span><strong id="shop-balance"></strong></div></div><div class="shop-bar"><div class="segmented shop-view"><button id="shop-catalog" class="active">逛商店</button><button id="shop-inventory">我的物品 <span id="owned-count">0</span></button></div><label class="shop-search"><span>搜索</span><input id="item-search" type="search" placeholder="名称 / LEGO 编号" aria-label="搜索物品"></label></div><div class="shop-categories" role="group" aria-label="商品分类">${categories.map(([id,name])=>`<button data-category="${id}" aria-pressed="${id===category}">${name}<small>${items.filter(i=>i.category===id).length}</small></button>`).join('')}</div><div class="collection-line"><span id="collection-progress"></span><span id="shop-context"></span></div><div class="shop-grid" id="shop-grid"></div><button id="shop-more" class="shop-more" hidden></button><p class="shop-footnote">全部使用学习获得的游戏资金，不会产生真实订单。乐高按主街景系列收录 21 套（含 Market Street，截至 2026 年）；3D 是简化模型。家具、猫猫家具、车型、盲盒和娃娃为原创游戏设计。家具不包含在施工预算里，购买会单独记入收支账本。</p></section>
  <dialog id="item-dialog" class="item-dialog" aria-labelledby="item-title"><div class="dialog-heading"><div><span class="eyebrow" id="item-eyebrow">SHOP</span><h2 id="item-title"></h2></div><button type="button" id="item-close" class="icon-button" aria-label="关闭物品详情">×</button></div><div class="item-dialog-grid"><div><div class="item-preview" id="item-preview"></div><p class="preview-hint">拖动旋转 · 滚轮 / 双指缩放</p><div id="item-reference"></div></div><div class="item-detail"><p id="item-description"></p><div id="item-options"></div><div id="item-variants"></div><div id="item-placement"></div><div class="item-checkout" id="item-checkout"></div><p class="form-error" id="item-error" role="alert"></p></div></div></dialog>`);
  const dialog=$('#item-dialog');
  function dispose(){preview?.dispose();preview=null;active=null;}
  dialog.addEventListener('close',dispose);$('#item-close').onclick=()=>dialog.close();
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
  $('#shop-catalog').onclick=()=>{ownedView=false;expanded=false;render(true);};
  $('#shop-inventory').onclick=()=>{ownedView=true;expanded=false;render(true);};
  $('#item-search').oninput=e=>{search=e.target.value.toLocaleLowerCase().trim();expanded=true;render(true);};
  $('#shop-more').onclick=()=>{expanded=!expanded;render(true);};
  document.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>{category=b.dataset.category;expanded=false;render(true);});
  function locationText(owned){const p=(getState().placements||[]).find(p=>p.id===owned.id);return p?`${getPlan(p.plan).name} · ${getPlan(p.plan).rooms.find(r=>r.id===p.room).name}`:'仓库 · 还没摆放';}
  function render(force=false){
    const state=getState(),all=inventory(state),key=JSON.stringify([state.selected,balance(state),all,state.placements,state.customPlans,ownedView,category,expanded,search]);
    $('#shop-balance').textContent=money(balance(state));$('#owned-count').textContent=all.length;
    if(!force&&key===lastKey)return;lastKey=key;
    $('#shop-catalog').classList.toggle('active',!ownedView);$('#shop-inventory').classList.toggle('active',ownedView);
    document.querySelectorAll('[data-category]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.category===category));
    const catalog=items.filter(i=>i.category===category),collected=new Set(all.filter(e=>getItem(e.item).category===category).map(e=>e.item));
    $('#collection-progress').textContent=`${categories.find(c=>c[0]===category)[1]} · 已收集 ${collected.size} / ${catalog.length} ${category==='blind'?'个系列':'款'}`;
    $('#shop-context').textContent=ownedView?'双方共用仓库，物品可以换房间摆放':category==='cars'?'5 类选配 · 3D 实时预览':category==='blind'?'每盒 6 款 · 每款 1/6 · 会有重复款':category==='cats'?'猫房、客厅都能摆 · 位置和朝向可调整':category==='furniture'?'沙发、床、桌椅和收纳 · 按件购买':'金额均为游戏资金';
    const list=(ownedView?all.filter(e=>getItem(e.item).category===category):catalog).filter(v=>{const i=ownedView?getItem(v.item):v;return `${i.name} ${i.english||''} ${i.set||''} ${ownedView?itemName(v):''}`.toLocaleLowerCase().includes(search);});
    const visible=expanded?list:list.slice(0,8);
    $('#shop-grid').innerHTML=visible.length?visible.map(v=>{const item=ownedView?getItem(v.item):v,count=all.filter(e=>e.item===item.id).length;return `<article class="shop-card"><button class="item-card-button" ${ownedView?`data-owned="${v.id}"`:`data-item="${item.id}"`}><div class="item-art ${item.category}">${thumbnail(item,ownedView?v:null)}<span class="item-badge">${ownedView?'已拥有':item.category==='lego'?item.year:item.category==='cars'?'可选配':item.category==='blind'?'6 款随机':item.category==='furniture'?'家具':item.category==='cats'?'猫猫家具':'3D 摆件'}</span>${!ownedView&&count?`<span class="item-owned-badge">已有 ${count}</span>`:''}</div><div class="item-card-info"><small>${item.category==='lego'?`LEGO ${item.set}`:categories.find(c=>c[0]===item.category)[1]}</small><h3>${esc(ownedView?itemName(v):item.name)}</h3><p>${ownedView?esc(locationText(v)):item.english||esc(item.description.split('。')[0])}</p><div class="item-card-bottom"><strong>${ownedView?'查看 / 摆放':money(item.price)+(Object.keys(optionGroups(item)).length?' 起':'')}</strong><span>↗</span></div></div></button></article>`;}).join(''):`<div class="shop-empty"><b>${search?'没有找到匹配的物品':ownedView?'这个分类还空着':'暂时没有物品'}</b><p>${ownedView?'买到的物品会出现在这里，两个人都可以摆放。':'换个关键词试试。'}</p></div>`;
    $('#shop-grid').querySelectorAll('[data-item]').forEach(b=>b.onclick=()=>openProduct(b.dataset.item));
    $('#shop-grid').querySelectorAll('[data-owned]').forEach(b=>b.onclick=()=>openOwned(b.dataset.owned));
    $('#shop-more').hidden=list.length<=8;$('#shop-more').textContent=expanded?'收起一些':`再看看剩下 ${list.length-8} 件 ↓`;
    if(active?.mode==='buy')refreshCheckout();
    if(active?.mode==='owned')refreshSlots();
  }
  function setupDialog(item,owned=null){
    dispose();$('#item-error').textContent='';$('#item-title').textContent=owned?itemName(owned):item.name;
    $('#item-description').textContent=item.description;$('#item-options').innerHTML='';$('#item-variants').innerHTML='';$('#item-placement').innerHTML='';$('#item-checkout').innerHTML='';$('#item-reference').innerHTML=item.image?`<details class="reference-details"><summary>查看官方商品图 · LEGO ${item.set}</summary>${thumbnail(item)}<a href="${item.source}" target="_blank" rel="noopener noreferrer">LEGO 官方来源 ↗</a></details>`:'';
    if(!dialog.open)dialog.showModal();preview=createItemPreview($('#item-preview'),owned||{item:item.id,config});
  }
  function openProduct(id){
    const item=getItem(id);config=quote(id).config;setupDialog(item);active={mode:'buy',item};$('#item-eyebrow').textContent=item.category==='blind'?'PICK A BOX':'MAKE IT YOURS';
    const groups=optionGroups(item);
    $('#item-options').innerHTML=Object.entries(groups).map(([key,group])=>`<label class="item-option">${group.name}<select data-option="${key}" aria-label="${group.name}">${group.values.map(v=>`<option value="${v.id}">${v.name}${v.price?' +'+money(v.price):' · 标配'}</option>`).join('')}</select></label>`).join('');
    $('#item-options').querySelectorAll('select').forEach(input=>input.onchange=()=>{config={...config,[input.dataset.option]:input.value};preview.update({item:id,config});refreshCheckout();});
    if(item.variants){const collection=new Set(inventory(getState()).filter(e=>e.item===id).map(e=>e.variant));$('#item-variants').innerHTML=`<div class="variant-heading"><b>系列图鉴 ${collection.size} / 6</b><span>每款 1/6（约 16.67%）</span></div><div class="variant-grid">${item.variants.map(v=>`<div class="variant ${collection.has(v.id)?'collected':''}" style="--variant:${v.color}"><i></i><span>${v.name}</span><small>${collection.has(v.id)?'已收集':'未收集'}</small></div>`).join('')}</div><p class="odds-note">本游戏等概率抽取，没有隐藏款。可能重复，重复款会各自保留。开盒后直接进仓库。</p>`;}
    refreshCheckout();
  }
  function refreshCheckout(){
    if(!active||active.mode!=='buy')return;
    const {item}=active,priced=quote(item.id,config),funds=balance(getState());
    $('#item-checkout').innerHTML=`<div class="checkout-total"><span>本次花费 <small>游戏资金</small></span><strong>${money(priced.amount)}</strong></div><p class="checkout-balance">共同余额 ${money(funds)}${funds>=priced.amount?' · 购买后剩 '+money(funds-priced.amount):' · 还差 '+money(priced.amount-funds)}</p><button class="primary" id="buy-item" ${funds<priced.amount||purchaseBusy?'disabled':''}>${purchaseBusy?'正在保存…':item.variants?'买一盒并打开':'买下这件'}</button><p class="checkout-note">从双方共同余额扣除，买到的物品双方都能使用。</p>`;
    $('#buy-item').onclick=async()=>{
      if(purchaseBusy)return;purchaseBusy=true;$('#item-error').textContent='';const chosen={...config};refreshCheckout();
      try{
        const result=await mutate(s=>purchase(s,{item:item.id,config:chosen,person:getPerson()}),{type:'purchase',item:item.id,config:chosen});
        if(result){const owned=inventory(getState()).find(e=>e.id===result.requestId);if(owned){openOwned(owned.id,!!item.variants);toast(item.variants?`开到了 ${itemName(owned)}。`:'买好了，可以摆进房间了。');}else{dialog.close();toast('购买已保存，在「我的物品」里查看。');}}
        else $('#item-error').textContent=getError();
      }finally{purchaseBusy=false;if(active?.mode==='buy')refreshCheckout();}
    };
  }
  function openOwned(id,revealed=false){
    const owned=inventory(getState()).find(e=>e.id===id);if(!owned)return;
    const item=getItem(owned.item);config=owned.config;setupDialog(item,owned);active={mode:'owned',item,owned};$('#item-eyebrow').textContent=revealed?'开到了 · 已放入仓库':'YOUR COLLECTION';
    $('#item-description').textContent=`${revealed?'这款已经保存，重复打开页面不会重新抽取。 ':''}${configName(owned)||item.description}`;
    const saved=(getState().placements||[]).find(p=>p.id===id),plans=allPlans(getState()).filter(p=>placementRooms(p,item).length),plan=plans.find(p=>p.id===getState().selected)||plans[0],rooms=placementRooms(plan,item);
    position=saved?.plan===plan.id?{...saved}:{plan:plan.id,room:rooms[0].id,slot:placementSlots(item)[0],rotation:0};
    $('#item-placement').innerHTML=`<h3>摆进哪个房间？</h3><p class="placement-location">现在：${esc(locationText(owned))}</p><label class="item-option">房子<select id="placement-plan" aria-label="摆放的房子">${plans.map(p=>`<option value="${p.id}" ${p.id===plan.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label><label class="item-option">房间<select id="placement-room" aria-label="摆放的房间"></select></label><div class="slot-heading"><span id="placement-mode-label">${item.category==='cars'?'停车位':placementSlots(item)[0]<12?'展示位 · 上排靠后墙，下排靠前墙':'地面位置 · 选一个空位'}</span><button type="button" id="rotate-item">旋转 90° ↻</button></div><div class="placement-slots ${item.category==='cars'?'parking':placementSlots(item)[0]<12?'display-slots':'floor-slots'}" id="placement-slots" role="group" aria-label="摆放位置"></div><div id="free-placement-wrap" hidden><svg id="free-placement" class="free-placement" viewBox="0 0 100 100" role="img" aria-label="自由摆放位置，点按或拖动设置"></svg><div class="free-position-controls"><label>左右 <input id="free-position-u" type="range" min="10" max="90" step="1" aria-label="物品左右位置"></label><label>前后 <input id="free-position-v" type="range" min="10" max="90" step="1" aria-label="物品前后位置"></label></div><p class="free-position-help">点按、拖动或用滑块选位置。这里是房间俯视图，绿色是当前物品，灰色是已摆放物品；靠墙时模型会适当缩小。</p></div><p class="placement-note" id="placement-note"></p>`;
    function roomsChanged(){const p=getPlan(position.plan),rs=placementRooms(p,item);if(!rs.some(r=>r.id===position.room))position.room=rs[0].id;$('#placement-room').innerHTML=rs.map(r=>`<option value="${r.id}" ${r.id===position.room?'selected':''}>${esc(r.name)}</option>`).join('');chooseFree();refreshSlots();}
    $('#placement-plan').onchange=e=>{position.plan=e.target.value;roomsChanged();};
    $('#placement-room').onchange=e=>{position.room=e.target.value;chooseFree();refreshSlots();};
    $('#rotate-item').onclick=()=>{position.rotation=(position.rotation+1)%4;refreshSlots();};
    roomsChanged();
    $('#item-checkout').innerHTML=`<button class="primary" id="place-item">保存摆放位置</button><div class="owned-actions"><button type="button" id="store-item">收回仓库</button><button type="button" id="see-item">在房间里看</button></div><p class="checkout-note">摆放免费，不改变施工进度。预览模式下可以随时布置。</p>`;
    $('#place-item').onclick=async()=>{
      const button=$('#place-item');button.disabled=true;$('#item-error').textContent='';
      const target={plan:position.plan,room:position.room,rotation:position.rotation,...(getPlan(position.plan).custom?{u:position.u,v:position.v}:{slot:position.slot})};
      const result=await mutate(s=>placeItem(s,{id,position:target}),{type:'place',id,position:target});
      if(result){dialog.close();toast('位置已保存。');await showInRoom(id,target.plan);}else{$('#item-error').textContent=getError();button.disabled=false;}
    };
    $('#store-item').onclick=async()=>{const b=$('#store-item');b.disabled=true;if(await mutate(s=>placeItem(s,{id,position:null}),{type:'place',id,position:null})){dialog.close();toast('已收回仓库，之后可以再摆。');}else{$('#item-error').textContent=getError();b.disabled=false;}};
    $('#see-item').onclick=async()=>{const p=(getState().placements||[]).find(p=>p.id===id);if(!p){$('#item-error').textContent='这件还在仓库，先选一个位置保存。';return;}dialog.close();await showInRoom(id,p.plan);};
    refreshSlots();
  }
  const occupied=slot=>(getState().placements||[]).some(p=>p.id!==active.owned.id&&p.plan===position.plan&&p.room===position.room&&(getPlan(position.plan).custom?p.u===position.u&&p.v===position.v:p.slot===slot));
  function chooseFree(){if(getPlan(position.plan).custom){position.u??=50;position.v??=50;delete position.slot;for(const u of [50,30,70,20,80]){if(!occupied())break;position.u=u;}return;}delete position.u;delete position.v;const slots=placementSlots(active.item);if(!slots.includes(position.slot)||occupied(position.slot))position.slot=slots.find(s=>!occupied(s))??slots[0];}
  function refreshSlots(){
    if(!active||active.mode!=='owned'||!$('#placement-slots'))return;
    const free=!!getPlan(position.plan).custom;$('#free-placement-wrap').hidden=!free;$('#placement-slots').hidden=free;
    if(free){
      $('#placement-mode-label').textContent='自由摆放 · 房间俯视图';
      const others=(getState().placements||[]).filter(p=>p.id!==active.owned.id&&p.plan===position.plan&&p.room===position.room&&p.u!==undefined);
      const svg=$('#free-placement');svg.innerHTML=`<rect x="4" y="4" width="92" height="92" rx="2" fill="#e1e7d6" stroke="#a9b99b" stroke-width="1.2"/><path d="M4 50h92M50 4v92" stroke="#c9d5bd" stroke-dasharray="2 2" stroke-width=".5"/>${others.map(p=>`<circle cx="${p.u}" cy="${p.v}" r="4" fill="#a8b39f"/>`).join('')}<g transform="translate(${position.u} ${position.v}) rotate(${position.rotation*90})"><rect x="-5" y="-5" width="10" height="10" rx="2" fill="${occupied()?'#b38e77':'#698958'}"/><path d="M0 3V-3m-2 2 2-2 2 2" fill="none" stroke="#fffde9" stroke-width="1"/></g>`;
      for(const axis of ['u','v']){const input=$('#free-position-'+axis);input.value=position[axis];input.oninput=()=>{position[axis]=Number(input.value);refreshSlots();};}
      const move=e=>{const point=new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM().inverse());position.u=Math.max(10,Math.min(90,Math.round(point.x)));position.v=Math.max(10,Math.min(90,Math.round(point.y)));refreshSlots();};
      svg.onpointerdown=e=>{svg.setPointerCapture(e.pointerId);move(e);};svg.onpointermove=e=>{if(svg.hasPointerCapture(e.pointerId))move(e);};svg.onpointerup=e=>{if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);};
      $('#placement-note').textContent=`朝向 ${position.rotation*90}° · ${occupied()?'这个点已经有物品了，挪开一点即可。':'位置和朝向保存后会同步。'}`;
      if($('#place-item'))$('#place-item').disabled=occupied();$('.placement-location').textContent='现在：'+locationText(active.owned);return;
    }
    const slots=placementSlots(active.item);
    $('#placement-slots').innerHTML=slots.map((slot,i)=>`<button type="button" data-slot="${slot}" ${occupied(slot)?'disabled':''} aria-pressed="${position.slot===slot}" aria-label="位置 ${i+1}${occupied(slot)?' 已占用':''}"><span>${occupied(slot)?'已占':String(i+1).padStart(2,'0')}</span>${position.slot===slot?`<i style="transform:rotate(${position.rotation*90}deg)">↑</i>`:''}</button>`).join('');
    $('#placement-slots').querySelectorAll('button').forEach(b=>b.onclick=()=>{position.slot=Number(b.dataset.slot);refreshSlots();});
    $('#placement-note').textContent=`朝向 ${position.rotation*90}° · ${occupied(position.slot)?'所选位置已被占用，换一个空位即可。':'灰色位置已有物品。乐高和盲盒自带小展示台。'}`;
    if($('#place-item'))$('#place-item').disabled=occupied(position.slot);
    $('.placement-location').textContent='现在：'+locationText(active.owned);
  }
  function open(){ $('#shop').scrollIntoView({behavior:'smooth',block:'start'}); }
  render();return {render,open,openOwned};
}
