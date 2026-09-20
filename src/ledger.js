import { studyReward,focusLabel } from './rewards.js';
import { getPlan } from './plans.js';
import { itemName,configName } from './items.js';
import { constructionPhases } from './construction.js';

const money=value=>'$'+value.toLocaleString('en-US');
const esc=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const typeNames={study:'学习入账',build:'施工出账',purchase:'购物出账'};
const PAGE_SIZE=25;

// Running balances always follow the saved transaction order, even when the
// visible list is filtered or timestamps happen to be identical.
export function ledgerEntries(state){
  let running=0;
  return state.events.map(event=>{
    const incoming=event.type==='study',amount=incoming?studyReward(event):event.amount;
    running+=incoming?amount:-amount;
    return {event,incoming,amount,running};
  });
}

export function createLedger({getState}){
  document.body.insertAdjacentHTML('beforeend',`<dialog id="ledger-dialog" aria-labelledby="ledger-title"><div class="dialog-heading"><div><span class="eyebrow">TRANSACTIONS</span><h2 id="ledger-title">收支账本</h2></div><button class="icon-button" id="ledger-close" aria-label="关闭收支账本">×</button></div><p class="ledger-intro">学习入账、施工和购物出账，都在这儿。可查看每笔金额和逐笔累计的余额。</p><div class="ledger-totals"><div><span>累计入账</span><strong id="ledger-income">$0</strong></div><div><span>累计出账</span><strong id="ledger-expense">$0</strong></div><div><span>当前余额</span><strong id="ledger-balance">$0</strong></div></div><div class="ledger-filters"><label for="ledger-type">记录类型<select id="ledger-type"><option value="all">全部收支</option><option value="study">学习入账</option><option value="build">施工出账</option><option value="purchase">购物出账</option></select></label><label for="ledger-person">记账人<select id="ledger-person"><option value="all">全部成员</option><option value="0">我</option><option value="1">你</option><option value="shared">共同 / 早期记录</option></select></label><label for="ledger-from">开始日期<input id="ledger-from" type="date"></label><label for="ledger-to">结束日期<input id="ledger-to" type="date"></label></div><div class="ledger-filter-summary"><p id="ledger-filter-summary" role="status" aria-live="polite"></p><button id="ledger-reset" class="text-button">清除筛选</button></div><p class="ledger-error" id="ledger-error" role="alert"></p><div id="ledger-items"></div><div class="ledger-pagination"><button id="ledger-prev">上一页</button><span id="ledger-page"></span><button id="ledger-next">下一页</button></div><p class="ledger-footnote">施工按户型预算记账；商店里的收藏、车辆和额外摆件单独算。撤销的学习不会计入收支。</p></dialog>`);
  const dialog=document.querySelector('#ledger-dialog'),$=selector=>dialog.querySelector(selector);
  let page=0;
  function render(){
    if(!dialog.open)return;
    const state=getState(),entries=ledgerEntries(state);
    $('#ledger-person').options[1].textContent=state.names[0];$('#ledger-person').options[2].textContent=state.names[1];
    const incoming=entries.reduce((sum,e)=>sum+(e.incoming?e.amount:0),0),outgoing=entries.reduce((sum,e)=>sum+(e.incoming?0:e.amount),0);
    $('#ledger-income').textContent=money(incoming);$('#ledger-expense').textContent=money(outgoing);$('#ledger-balance').textContent=money(incoming-outgoing);
    const type=$('#ledger-type').value,person=$('#ledger-person').value,from=$('#ledger-from').value,to=$('#ledger-to').value;
    const invalidDate=from&&to&&from>to;
    $('#ledger-error').textContent=invalidDate?'结束日期要在开始日期之后。':'';
    const filtered=invalidDate?[]:entries.filter(({event})=>{
      const date=new Date(event.at),day=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
      return (type==='all'||type===event.type)&&(person==='all'||person==='shared'&&event.person===undefined||String(event.person)===person)&&(!from||day>=from)&&(!to||day<=to);
    }).reverse();
    const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));page=Math.min(page,pages-1);
    const shownIncome=filtered.reduce((sum,e)=>sum+(e.incoming?e.amount:0),0),shownExpense=filtered.reduce((sum,e)=>sum+(e.incoming?0:e.amount),0);
    $('#ledger-filter-summary').textContent=`${filtered.length} 笔记录 · 入账 ${money(shownIncome)} · 出账 ${money(shownExpense)}`;
    $('#ledger-items').innerHTML=filtered.length?filtered.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE).map(({event,incoming,amount,running})=>{
      const person=event.person===undefined?'共同':state.names[event.person],plan=event.plan?getPlan(event.plan,state):null;
      const stage=event.stage?constructionPhases(plan).find(stage=>stage.id===event.stage):null;
      const heading=event.type==='study'?`${event.minutes} 分钟学习`:event.type==='build'?`${plan?.name||'户型'} · ${stage?.name||'早期施工'}`:itemName(event);
      const detail=event.type==='study'?[event.note,event.rewardVersion===1?`${focusLabel(event.focus)} · 投入 ${event.focus}/100 · 效率 ${(event.efficiency/100).toFixed(1)}%`:''].filter(Boolean).join(' · '):event.type==='purchase'?configName(event):stage?.detail||'已计入这个户型的施工投入';
      return `<article class="ledger-entry" data-event-id="${esc(event.id)}" data-kind="${event.type}"><div class="ledger-entry-content"><div class="ledger-entry-meta"><span class="ledger-kind ${incoming?'income':'expense'}">${typeNames[event.type]}</span><span>${esc(person)}</span><time datetime="${esc(event.at)}">${new Date(event.at).toLocaleString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})}</time></div><h3>${esc(heading)}</h3>${detail?`<p>${esc(detail)}</p>`:''}</div><div class="ledger-entry-money"><strong class="ledger-amount ${incoming?'income':'expense'}">${incoming?'+':'−'} ${money(amount)}</strong><span class="ledger-running">累计余额 ${money(running)}</span></div></article>`;
    }).join(''):'<p class="ledger-empty">这个范围里还没有收支记录。</p>';
    $('#ledger-page').textContent=`第 ${page+1} / ${pages} 页`;
    $('#ledger-prev').disabled=page===0;$('#ledger-next').disabled=page>=pages-1;
  }
  function open(){page=0;dialog.showModal();render();}
  $('#ledger-close').onclick=()=>dialog.close();
  dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}});
  for(const filter of dialog.querySelectorAll('.ledger-filters select,.ledger-filters input'))filter.onchange=()=>{page=0;render();};
  $('#ledger-reset').onclick=()=>{$('#ledger-type').value='all';$('#ledger-person').value='all';$('#ledger-from').value='';$('#ledger-to').value='';page=0;render();};
  $('#ledger-prev').onclick=()=>{page--;render();$('#ledger-items').scrollIntoView({block:'start'});};
  $('#ledger-next').onclick=()=>{page++;render();$('#ledger-items').scrollIntoView({block:'start'});};
  return {open,render};
}
