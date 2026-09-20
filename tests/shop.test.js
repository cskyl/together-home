import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore as openStore } from '../backend/store.mjs';
import { createApi } from '../backend/server.mjs';
import { items,quote } from '../src/items.js';
import { freshState,study as recordStudy,build,purchase,placeItem,validate,balance,invested,inventory,undoStudy } from '../src/state.js';
const study=(state,entry)=>recordStudy(state,entry,{roll:()=>500});
const createStore=path=>openStore(path,{studyRoll:()=>500});
const secret=()=>randomBytes(32).toString('hex');
const act=(s,token,action,id=randomUUID())=>s.action(token,{requestId:id,action});
const pair=s=>{const a=secret(),b=secret(),invite=secret();s.create(a,{name:'甲',invite});s.join(b,{name:'乙',invite});return {a,b};};

test('旧存档购买后保留学习和建设；余额统一结算，已消费学习不能撤销',()=>{
  const old={...freshState(),events:[{id:randomUUID(),type:'study',person:0,minutes:100,note:'旧版资金',at:'2026-09-01T12:00:00.000Z'},{id:randomUUID(),type:'build',plan:'riverside',amount:500,at:'2026-09-01T12:01:00.000Z'}]},snapshot=structuredClone(old);
  assert.deepEqual(validate(old),snapshot);
  const s=purchase(old,{item:'lego-10182',person:1});
  assert.equal(balance(s),100);assert.equal(invested(s),500);assert.deepEqual(s.events.slice(0,2),snapshot.events);assert.deepEqual(old,snapshot);
  assert.equal(inventory(s).length,1);assert.throws(()=>undoStudy(s),/购买物品/);assert.throws(()=>purchase(s,{item:'plush-bear'}),/资金不足/);
  assert.deepEqual(validate(JSON.parse(JSON.stringify(s))),s);
});
test('车辆选配逐项计价，全部街景可购买，盲盒六款都能保存',()=>{
  const cfg={paint:'red',wheels:'bronze',cabin:'ivory',roof:'open',trim:'sport'};
  assert.equal(quote('car-coupe',cfg).amount,3400);
  assert.throws(()=>quote('car-coupe',{paint:'free'}),/选配/);assert.throws(()=>quote('car-coupe',{amount:1}),/选配/);
  assert.equal(items.filter(i=>i.category==='lego').length,21);
  for(const item of items){const s=purchase(study(freshState(),{person:0,minutes:480}),{item:item.id});validate(s);assert.equal(inventory(s)[0].amount,item.price);}
  for(const item of items.filter(i=>i.variants))for(let roll=0;roll<6;roll++){
    const s=purchase(study(freshState(),{person:1,minutes:100}),{item:item.id,person:1},{roll:()=>roll});assert.equal(inventory(s)[0].variant,String(roll));validate(s);
  }
});
test('导入不能伪造购买价格、选配、盲盒结果、仓库归属或重复位置',()=>{
  const s=purchase(study(freshState(),{person:0,minutes:100}),{item:'box-cats'});
  for(const patch of [{amount:0},{variant:'6'},{config:{free:true}},{person:2}]){const bad=structuredClone(s);Object.assign(bad.events.at(-1),patch);assert.throws(()=>validate(bad));}
  const id=inventory(s)[0].id,position={plan:'riverside',room:'study',slot:0,rotation:1};
  const placed=placeItem(s,{id,position});validate(placed);assert.deepEqual(validate(JSON.parse(JSON.stringify(placed))),placed);
  for(const patch of [{room:'garage'},{slot:15},{rotation:4},{plan:'fake'}])assert.throws(()=>placeItem(s,{id,position:{...position,...patch}}),/位置无效/);
  assert.throws(()=>placeItem(s,{id:randomUUID(),position}),/没有这件/);
  const duplicate={...placed,placements:[...placed.placements,...placed.placements]};assert.throws(()=>validate(duplicate),/重复/);
  assert.equal(placeItem(placed,{id,position:null}).placements.length,0);
});
test('后端决定购买价格和身份，盲盒响应丢失重试不会多扣款或重新抽取',()=>{
  const s=createStore();try{
    const {a,b}=pair(s);act(s,a,{type:'study',minutes:480});
    const id=randomUUID(),action={type:'purchase',item:'box-forest',config:{},amount:0,person:1,variant:'chosen-by-client'};
    const first=act(s,a,action,id),owned=inventory(first.state)[0];assert.equal(owned.person,0);assert.equal(owned.amount,120);assert.match(owned.variant,/^[0-5]$/);
    for(let i=0;i<4;i++){const retry=act(s,a,action,id);assert.equal(retry.revision,first.revision);assert.deepEqual(inventory(retry.state),[owned]);}
    assert.equal(balance(s.snapshot(b).state),4680);assert.throws(()=>act(s,b,action,id),/编号已被使用/);
    const config={paint:'red',wheels:'bronze',cabin:'ivory',roof:'open',trim:'sport'};act(s,b,{type:'purchase',item:'car-coupe',config,amount:1});
    const car=inventory(s.snapshot(a).state).at(-1);assert.equal(car.amount,3400);assert.equal(car.person,1);assert.deepEqual(car.config,config);
    act(s,b,{type:'place',id:car.id,position:{plan:'riverside',room:'garage',slot:0,rotation:1}});
    assert.equal(s.snapshot(a).state.placements.length,1);
    assert.throws(()=>act(s,a,{type:'place',id:car.id,position:{plan:'riverside',room:'study',slot:0,rotation:0}}),/位置无效/);
  }finally{s.close();}
});
test('双人可搬动共同物品，不能使用其他房间物品或占同一个展示位',()=>{
  const s=createStore();try{
    const {a,b}=pair(s),{a:outsider}=pair(s);act(s,a,{type:'study',minutes:100});
    const first=act(s,a,{type:'purchase',item:'lego-10190'}).state.events.at(-1),second=act(s,b,{type:'purchase',item:'box-cats'}).state.events.at(-1);
    const position={plan:'riverside',room:'study',slot:2,rotation:0};act(s,b,{type:'place',id:first.id,position});
    assert.throws(()=>act(s,a,{type:'place',id:second.id,position}),/已有物品/);
    assert.throws(()=>act(s,outsider,{type:'place',id:first.id,position}),/没有这件/);
    act(s,a,{type:'place',id:first.id,position:{...position,plan:'anthem',slot:3,rotation:2}});
    const after=s.snapshot(b).state;assert.equal(after.placements.length,1);assert.equal(after.placements[0].plan,'anthem');assert.equal(balance(after),580);
    act(s,b,{type:'place',id:first.id,position:null});assert.equal(s.snapshot(a).state.placements.length,0);assert.equal(inventory(s.snapshot(a).state).length,2);
  }finally{s.close();}
});
test('HTTP 两人同时买最后一件可负担物品，只成功一笔；购买和建造共用事务余额',async()=>{
  const s=createStore(),server=createApi(s,{rateLimit:false});await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/v1/action`,{a,b}=pair(s);
  const post=async(token,action)=>{const r=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({requestId:randomUUID(),action})});return {status:r.status,data:await r.json()};};
  try{
    act(s,a,{type:'study',minutes:12});const results=await Promise.all([post(a,{type:'purchase',item:'box-cats'}),post(b,{type:'purchase',item:'box-cats'})]);assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);assert.equal(inventory(s.snapshot(a).state).length,1);assert.equal(balance(s.snapshot(a).state),0);
    act(s,b,{type:'study',minutes:40});await Promise.all([post(a,{type:'purchase',item:'lego-10182'}),post(b,{type:'build',plan:'riverside'})]);
    const state=s.snapshot(a).state;assert.equal(balance(state),0);validate(state);assert.equal(state.events.filter(e=>['build','purchase'].includes(e.type)).reduce((n,e)=>n+e.amount,0),520);
  }finally{await new Promise(r=>server.close(r));s.close();}
});
test('数据库重启后保留选配、开盒结果和摆放位置，以及请求去重记录',()=>{
  const dir=mkdtempSync(join(tmpdir(),'together-shop-')),path=join(dir,'test.sqlite');let s=createStore(path);
  try{const {a,b}=pair(s);act(s,a,{type:'study',minutes:100});const id=randomUUID(),action={type:'purchase',item:'box-space'};act(s,a,action,id);act(s,b,{type:'place',id,position:{plan:'riverside',room:'study',slot:0,rotation:3}});const before=s.snapshot(a);s.close();s=createStore(path);assert.deepEqual(s.snapshot(b).state,before.state);assert.equal(act(s,a,action,id).revision,before.revision);assert.deepEqual(s.snapshot(a).state,before.state);}finally{s.close();rmSync(dir,{recursive:true});}
});
