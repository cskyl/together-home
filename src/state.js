import { plans, phases, totalCost } from './plans.js';
import { getItem, quote, placementRooms, placementSlots } from './items.js';
export const STORAGE_KEY = 'together-home-v1';
export const freshState = () => ({version:1,selected:'riverside',names:['我','你'],events:[]});
export const earned = s => s.events.filter(e=>e.type==='study').reduce((n,e)=>n+e.minutes*10,0);
export const balance = s => earned(s)-s.events.filter(e=>e.type==='build'||e.type==='purchase').reduce((n,e)=>n+e.amount,0);
export const inventory = s => s.events.filter(e=>e.type==='purchase');
export const invested = (s,id=s.selected) => s.events.filter(e=>e.type==='build'&&e.plan===id).reduce((n,e)=>n+e.amount,0);
export function progress(amount) { let remainder=amount; return phases.map(p=>{ const paid=Math.max(0,Math.min(p.cost,remainder)); remainder-=p.cost; return {...p,paid,ratio:paid/p.cost}; }); }
export function study(s,{person,minutes,note=''}) { if (![0,1].includes(person)||!Number.isInteger(minutes)||minutes<1||minutes>480||typeof note!=='string'||note.length>120) throw Error('请输入 1–480 分钟的学习时长，备注不超过 120 字。');return {...s,events:[...s.events,{id:crypto.randomUUID(),type:'study',person,minutes,note,at:new Date().toISOString()}]}; }
export function build(s) { const next=progress(invested(s)).find(p=>p.ratio<1); if (!next) throw Error('这栋家已全部建成。'); const amount=Math.min(balance(s),next.cost-next.paid);if(amount<=0)throw Error('先记录一次学习，就有资金可以投入啦。');return {...s,events:[...s.events,{id:crypto.randomUUID(),type:'build',plan:s.selected,amount,at:new Date().toISOString()}]}; }
export function undoStudy(s) { const event=s.events.findLast(e=>e.type==='study');if(!event)throw Error('还没有可以撤销的学习记录。');if(balance(s)<event.minutes*10)throw Error('这次学习的资金已投入建设或购买物品，无法撤销。');const next={...s,events:s.events.filter(e=>e.id!==event.id)};validate(next);return next; }
export function randomChoice(count) {
  const limit=Math.floor(4294967296/count)*count,bytes=new Uint32Array(1);let value;
  do {crypto.getRandomValues(bytes);value=bytes[0];} while(value>=limit);
  return value%count;
}
export function purchase(s,{item,config={},person=0},{id=crypto.randomUUID(),roll=randomChoice}={}) {
  const priced=quote(item,config);
  if(![0,1].includes(person))throw Error('购买成员无效。');
  if(inventory(s).length>=300)throw Error('仓库已有 300 件物品，暂时不能继续购买。');
  if(balance(s)<priced.amount)throw Error('游戏资金不足，先记一次学习再来。');
  const event={id,type:'purchase',person,item,config:priced.config,amount:priced.amount,at:new Date().toISOString()};
  if(priced.item.variants)event.variant=priced.item.variants[roll(priced.item.variants.length)].id;
  return {...s,events:[...s.events,event]};
}
function validPlacement(s,p) {
  const owned=inventory(s).find(e=>e.id===p?.id),item=getItem(owned?.item),plan=plans.find(v=>v.id===p?.plan);
  if(!owned||!plan||!placementRooms(plan,item).some(r=>r.id===p.room)||!placementSlots(item).includes(p.slot)||!Number.isInteger(p.rotation)||p.rotation<0||p.rotation>3)throw Error('物品摆放位置无效。');
}
export function placeItem(s,{id,position}) {
  if(!inventory(s).some(e=>e.id===id))throw Error('仓库里没有这件物品。');
  const placements=(s.placements||[]).filter(p=>p.id!==id);
  if(position!==null){
    const p={id,plan:position?.plan,room:position?.room,slot:position?.slot,rotation:position?.rotation};validPlacement(s,p);
    if(placements.some(v=>v.plan===p.plan&&v.room===p.room&&v.slot===p.slot))throw Error('这个位置已有物品，请换个位置。');
    placements.push(p);
  }
  return {...s,placements};
}
export function validate(s) {
  if(!s||s.version!==1||!plans.some(p=>p.id===s.selected)||!Array.isArray(s.names)||s.names.length!==2||s.names.some(n=>typeof n!=='string'||!n.trim()||n.length>16)||!Array.isArray(s.events)||s.events.length>100000)throw Error('存档格式不正确。');
  let funds=0;const used={},ids=new Set();
  for(const e of s.events){
    if(!e||typeof e.id!=='string'||ids.has(e.id)||typeof e.at!=='string'||!Number.isFinite(Date.parse(e.at)))throw Error('记录无效。');ids.add(e.id);
    if(e.type==='study'){
      if(![0,1].includes(e.person)||!Number.isInteger(e.minutes)||e.minutes<1||e.minutes>480||typeof e.note!=='string'||e.note.length>120)throw Error('学习记录无效。');funds+=e.minutes*10;
    }else if(e.type==='build'){
      if(!plans.some(p=>p.id===e.plan)||!Number.isInteger(e.amount)||e.amount<=0)throw Error('建设记录无效。');funds-=e.amount;used[e.plan]=(used[e.plan]||0)+e.amount;if(used[e.plan]>totalCost)throw Error('建设资金超出上限。');
    }else if(e.type==='purchase'){
      const priced=quote(e.item,e.config);
      if(![0,1].includes(e.person)||e.amount!==priced.amount||Object.keys(priced.config).some(k=>e.config?.[k]!==priced.config[k])||(priced.item.variants?!priced.item.variants.some(v=>v.id===e.variant):e.variant!==undefined))throw Error('购买记录无效。');
      funds-=e.amount;
    }else throw Error('未知记录。');
    if(funds<0)throw Error('存档资金不足。');
  }
  if(inventory(s).length>300)throw Error('物品数量超出上限。');
  if(s.placements!==undefined){
    if(!Array.isArray(s.placements)||s.placements.length>300)throw Error('物品摆放存档无效。');
    const owned=new Set(),positions=new Set();
    for(const p of s.placements){validPlacement(s,p);const key=`${p.plan}:${p.room}:${p.slot}`;if(owned.has(p.id)||positions.has(key))throw Error('物品摆放重复。');owned.add(p.id);positions.add(key);}
  }
  return s;
}
