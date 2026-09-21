import { allPlans, getPlan } from './plans.js';
import { constructionTotal, constructionPhases, constructionProgress } from './construction.js';
import { getItem, quote, placementRooms, placementSlots } from './items.js';
import { validateDesign,normalizeDesign,MAX_DESIGNS } from './designs.js';
import { DEFAULT_FOCUS, makeReward, studyReward, validateStudyReward } from './rewards.js';
export const STORAGE_KEY = 'together-home-v1';
export const freshState = () => ({version:1,selected:'riverside',names:['我','你'],events:[]});
export const earned = s => s.events.filter(e=>e.type==='study').reduce((n,e)=>n+studyReward(e),0);
export const balance = s => earned(s)-s.events.filter(e=>e.type==='build'||e.type==='purchase').reduce((n,e)=>n+e.amount,0);
export const inventory = s => s.events.filter(e=>e.type==='purchase');
export const invested = (s,id=s.selected) => s.events.filter(e=>e.type==='build'&&e.plan===id).reduce((n,e)=>n+e.amount,0);
export function progress(amount,plan=getPlan('riverside')) { return constructionProgress(amount,plan); }
export function study(s,{person,minutes,note='',focus=DEFAULT_FOCUS},{id=crypto.randomUUID(),roll=randomChoice}={}) { if (![0,1].includes(person)||!Number.isInteger(minutes)||minutes<1||minutes>480||typeof note!=='string'||note.length>120) throw Error('请输入 1–480 分钟的学习时长，备注不超过 120 字。');const reward=makeReward(minutes,focus,roll);return {...s,events:[...s.events,{id,type:'study',person,minutes,note,...reward,at:new Date().toISOString()}]}; }
export function build(s,{person}={}) { if(person!==undefined&&![0,1].includes(person))throw Error('施工成员无效。');const plan=getPlan(s.selected,s),next=progress(invested(s),plan).find(p=>p.ratio<1); if (!next) throw Error('这栋家已全部建成。'); const amount=Math.min(balance(s),next.cost-next.paid);if(amount<=0)throw Error('先记录一次学习，就有资金可以投入啦。');return {...s,events:[...s.events,{id:crypto.randomUUID(),type:'build',plan:s.selected,stage:next.id,...(person===undefined?{}:{person}),amount,at:new Date().toISOString()}]}; }
export function undoStudy(s) { const event=s.events.findLast(e=>e.type==='study');if(!event)throw Error('还没有可以撤销的学习记录。');if(balance(s)<studyReward(event))throw Error('这次学习的资金已投入建设或购买物品，无法撤销。');const next={...s,events:s.events.filter(e=>e.id!==event.id)};validate(next);return next; }
export function randomChoice(count) {
  const limit=Math.floor(4294967296/count)*count,bytes=new Uint32Array(1);let value;
  do {crypto.getRandomValues(bytes);value=bytes[0];} while(value>=limit);
  return value%count;
}
export function purchase(s,{item,config={},person=0},{id=crypto.randomUUID(),roll=randomChoice}={}) {
  const priced=quote(item,config);
  if(priced.item.archived)throw Error('这款已从商店下架，已拥有的物品仍可摆放。');
  if(![0,1].includes(person))throw Error('购买成员无效。');
  if(inventory(s).length>=300)throw Error('仓库已有 300 件物品，暂时不能继续购买。');
  if(balance(s)<priced.amount)throw Error('游戏资金不足，先记一次学习再来。');
  const event={id,type:'purchase',person,item,config:priced.config,amount:priced.amount,priceVersion:priced.priceVersion,at:new Date().toISOString()};
  if(priced.item.variants)event.variant=priced.item.variants[roll(priced.item.variants.length)].id;
  return {...s,events:[...s.events,event]};
}
function validPlacement(s,p,available=allPlans(s)) {
  const owned=inventory(s).find(e=>e.id===p?.id),item=getItem(owned?.item),plan=available.find(v=>v.id===p?.plan);
  if(!owned||!plan||!placementRooms(plan,item).some(r=>r.id===p.room)||!Number.isInteger(p.rotation)||p.rotation<0||p.rotation>3)throw Error('物品摆放位置无效。');
  if(p.u!==undefined||p.v!==undefined){if(!plan.custom||!Number.isInteger(p.u)||!Number.isInteger(p.v)||p.u<10||p.u>90||p.v<10||p.v>90||p.slot!==undefined)throw Error('自由摆放位置无效。');}
  else if(!placementSlots(item).includes(p.slot))throw Error('物品摆放位置无效。');
}
const placementKey=p=>`${p.plan}:${p.room}:`+(p.u!==undefined?`free:${p.u}:${p.v}`:`slot:${p.slot}`);
export function placeItem(s,{id,position}) {
  if(!inventory(s).some(e=>e.id===id))throw Error('仓库里没有这件物品。');
  const placements=(s.placements||[]).filter(p=>p.id!==id);
  if(position!==null){
    const p={id,plan:position?.plan,room:position?.room,rotation:position?.rotation,...(position?.u!==undefined||position?.v!==undefined?{u:position.u,v:position.v}:{slot:position?.slot})};validPlacement(s,p);
    if(placements.some(v=>placementKey(v)===placementKey(p)))throw Error('这个位置已有物品，请换个位置。');
    placements.push(p);
  }
  return {...s,placements};
}
export function validate(s) {
  if(!s||s.version!==1||!Array.isArray(s.names)||s.names.length!==2||s.names.some(n=>typeof n!=='string'||!n.trim()||n.length>16)||!Array.isArray(s.events)||s.events.length>100000)throw Error('存档格式不正确。');
  if(s.customPlans!==undefined){if(!Array.isArray(s.customPlans)||s.customPlans.length>MAX_DESIGNS)throw Error('自定义户型数量无效。');const ids=new Set();for(const d of s.customPlans){validateDesign(d,{saved:true});if(ids.has(d.id))throw Error('自定义户型编号重复。');ids.add(d.id);}}
  const plans=allPlans(s);if(!plans.some(p=>p.id===s.selected))throw Error('存档户型无效。');
  let funds=0;const used={},ids=new Set();
  for(const e of s.events){
    if(!e||typeof e.id!=='string'||ids.has(e.id)||typeof e.at!=='string'||!Number.isFinite(Date.parse(e.at)))throw Error('记录无效。');ids.add(e.id);
    if(e.type==='study'){
      if(![0,1].includes(e.person)||!Number.isInteger(e.minutes)||e.minutes<1||e.minutes>480||typeof e.note!=='string'||e.note.length>120)throw Error('学习记录无效。');validateStudyReward(e);funds+=studyReward(e);
    }else if(e.type==='build'){
      const plan=plans.find(p=>p.id===e.plan);
      if(!plan||!Number.isSafeInteger(e.amount)||e.amount<=0||(e.person!==undefined&&![0,1].includes(e.person))||(e.stage!==undefined&&!constructionPhases(plan).some(p=>p.id===e.stage)))throw Error('建设记录无效。');funds-=e.amount;used[e.plan]=(used[e.plan]||0)+e.amount;if(used[e.plan]>constructionTotal(plan))throw Error('建设资金超出房子总价。');
    }else if(e.type==='purchase'){
      const priced=quote(e.item,e.config,e.priceVersion===undefined?1:e.priceVersion);
      if(![0,1].includes(e.person)||e.amount!==priced.amount||Object.keys(priced.config).some(k=>e.config?.[k]!==priced.config[k])||(priced.item.variants?!priced.item.variants.some(v=>v.id===e.variant):e.variant!==undefined))throw Error('购买记录无效。');
      funds-=e.amount;
    }else throw Error('未知记录。');
    if(funds<0)throw Error('存档资金不足。');
  }
  if(inventory(s).length>300)throw Error('物品数量超出上限。');
  if(s.placements!==undefined){
    if(!Array.isArray(s.placements)||s.placements.length>300)throw Error('物品摆放存档无效。');
    const owned=new Set(),positions=new Set();
    for(const p of s.placements){validPlacement(s,p,plans);const key=placementKey(p);if(owned.has(p.id)||positions.has(key))throw Error('物品摆放重复。');owned.add(p.id);positions.add(key);}
  }
  return s;
}
export function saveDesign(s,{design,expectedVersion}){
  const clean=normalizeDesign(design),old=(s.customPlans||[]).find(d=>d.id===clean.id);
  if(design.budget===undefined&&old?.budget!==undefined)clean.budget=old.budget;
  if(!Number.isSafeInteger(expectedVersion)||expectedVersion!==(old?.version||0))throw Error('对方刚更新了这个户型。你的草稿还在，可以另存一份，或载入最新版本。');
  if(!old&&(s.customPlans||[]).length>=MAX_DESIGNS)throw Error('最多保存 8 个自定义户型，可以继续编辑已有户型。');
  if(clean.budget<invested(s,clean.id))throw Error('房子总预算不能低于已经投入的施工资金。');
  const saved={...clean,version:(old?.version||0)+1},next={...s,selected:saved.id,customPlans:[...(s.customPlans||[]).filter(d=>d.id!==saved.id),saved]};
  if(s.placements){const plans=allPlans(next);next.placements=s.placements.filter(p=>{if(p.plan!==saved.id)return true;try{validPlacement(next,p,plans);return true;}catch{return false;}});}
  return next;
}
