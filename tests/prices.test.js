import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {items,quote} from '../src/items.js';
import {GAME_PRICE_VERSION,legacyPrices} from '../src/prices.js';
import {pricesV2} from '../src/prices-v2.js';
import {freshState,purchase,placeItem,balance,validate} from '../src/state.js';
import {ledgerEntries} from '../src/ledger.js';
import {createStore} from '../backend/store.mjs';

function historicalState(){return {...freshState(),events:[
  {id:'legacy-study',type:'study',person:0,minutes:480,note:'已有学习',at:'2026-09-19T12:00:00Z'},
  {id:'legacy-bed',type:'purchase',person:0,item:'furniture-bed',config:{},amount:1000,at:'2026-09-19T12:01:00Z'},
  {id:'legacy-tree',type:'purchase',person:1,item:'cat-tree',config:{},amount:650,priceVersion:1,at:'2026-09-19T12:02:00Z'},
  {id:'legacy-build',type:'build',plan:'riverside',amount:500,at:'2026-09-19T12:03:00Z'},
  {id:'v2-bed',type:'purchase',person:1,item:'furniture-bed',config:{},amount:300,priceVersion:2,at:'2026-09-20T10:00:00Z'},
  {id:'v2-sectional',type:'purchase',person:0,item:'furniture-sectional',config:{},amount:220,priceVersion:2,at:'2026-09-20T10:01:00Z'}
],placements:[{id:'legacy-bed',plan:'riverside',room:'study',slot:12,rotation:1},{id:'v2-bed',plan:'riverside',room:'bed2',slot:13,rotation:2}]};}

test('第三版降价不改第一版69款与第二版95款已成交价格',()=>{
  assert.equal(GAME_PRICE_VERSION,3);
  assert.equal(Object.keys(legacyPrices).length,69);assert.equal(Object.keys(pricesV2).length,95);
  for(const [id,price]of Object.entries(legacyPrices))assert.equal(quote(id,{},1).amount,price,id+' v1');
  for(const [id,price]of Object.entries(pricesV2)){
    assert.equal(quote(id,{},2).amount,price,id+' v2');
    const item=items.find(item=>item.id===id);
    if(['furniture','cats','decor'].includes(item.category))assert.ok(item.price<price,id+' should be cheaper');
    else assert.equal(item.price,price,id+' unchanged');
  }
  assert.equal(quote('furniture-bed',{},1).amount,1000);assert.equal(quote('furniture-bed',{},2).amount,300);assert.equal(quote('furniture-bed').amount,120);
  assert.equal(quote('cat-tree',{},2).amount,195);assert.equal(quote('cat-tree').amount,80);
  assert.equal(quote('furniture-standingdesk',{},2).amount,150);assert.equal(quote('furniture-standingdesk').amount,60);
});

test('三代成交记录共存，余额、旧物品和流水金额保持原值',()=>{
  const old=historicalState(),copy=structuredClone(old);validate(old);assert.equal(balance(old),2130);
  const next=purchase(old,{item:'furniture-bed',person:1});validate(next);
  assert.equal(next.events.at(-1).priceVersion,3);assert.equal(next.events.at(-1).amount,120);assert.equal(balance(next),2010);
  assert.deepEqual(next.events.slice(0,-1),copy.events);assert.deepEqual(next.placements,copy.placements);assert.deepEqual(old,copy);
  assert.deepEqual(ledgerEntries(next).filter(entry=>entry.event.type==='purchase').map(entry=>entry.amount),[1000,650,300,220,120]);
  assert.deepEqual(validate(JSON.parse(JSON.stringify(next))),next);
});

test('不同价格版本不可互相冒充，新商品不能使用不存在的旧版价格',()=>{
  const current=purchase(historicalState(),{item:'furniture-bed'});
  for(const version of [null,0,4,'3']){const fake=structuredClone(current);fake.events.at(-1).priceVersion=version;assert.throws(()=>validate(fake),/价格版本/);}
  for(const index of [1,2,4,5]){const old=historicalState();old.events[index].amount=quote(old.events[index].item).amount;assert.throws(()=>validate(old),/购买记录/);}
  for(const version of [1,2]){const fake=structuredClone(current);fake.events.at(-1).priceVersion=version;assert.throws(()=>validate(fake),/购买记录/);}
  const changed=structuredClone(current);changed.events.at(-1).amount=300;assert.throws(()=>validate(changed),/购买记录/);
  assert.throws(()=>quote('furniture-standingdesk',{},1),/价格版本/);
  assert.throws(()=>quote('furniture-recliner',{},1),/价格版本/);assert.throws(()=>quote('furniture-recliner',{},2),/价格版本/);
  assert.equal(quote('furniture-recliner',{},3).priceVersion,3);
});

test('下架旧游戏车不能新买，历史选配、成交和停车位置仍可保留',()=>{
  const config={paint:'red',wheels:'bronze',cabin:'ivory',roof:'open',trim:'sport'};
  const cars=items.filter(item=>item.category==='cars'&&item.archived);assert.equal(cars.length,6);
  const funded={...freshState(),events:[{id:'car-funds',type:'study',person:0,minutes:480,note:'旧车资金',at:'2026-09-19T12:00:00Z'}]};
  for(const item of cars)assert.throws(()=>purchase(funded,{item:item.id}),/下架/);
  for(const priceVersion of [1,2]){
    const priced=quote('car-coupe',config,priceVersion);assert.equal(priced.amount,3400);
    const state={...funded,events:[...funded.events,{id:'old-car',type:'purchase',person:1,item:'car-coupe',config,amount:3400,priceVersion,at:'2026-09-19T12:01:00Z'}]};
    const parked=placeItem(state,{id:'old-car',position:{plan:'riverside',room:'garage',slot:0,rotation:1}});validate(parked);
    assert.equal(balance(parked),1400);assert.deepEqual(parked.events,state.events);assert.equal(parked.placements[0].room,'garage');
  }
});

test('后端重启保留两代旧价，采用第三版新价，去重和下架拦截都不改旧账',()=>{
  const dir=mkdtempSync(join(tmpdir(),'home-price-version-')),path=join(dir,'history.sqlite'),token=randomBytes(32).toString('hex');let store=createStore(path);
  try{
    const room=store.create(token,{name:'价格测试',invite:randomBytes(32).toString('hex')}),before=historicalState();
    store.db.prepare('UPDATE rooms SET state=? WHERE id=?').run(JSON.stringify(before),room.roomId);store.close();store=createStore(path);
    assert.deepEqual(store.snapshot(token).state,before);
    const requestId=randomUUID(),action={type:'purchase',item:'furniture-bed',amount:1,priceVersion:2,person:1};
    const result=store.action(token,{requestId,action}),event=result.state.events.at(-1);
    assert.equal(event.amount,120);assert.equal(event.priceVersion,3);assert.equal(event.person,0);assert.equal(balance(result.state),2010);
    assert.deepEqual(result.state.events.slice(0,-1),before.events);assert.deepEqual(result.state.placements,before.placements);
    assert.deepEqual(store.action(token,{requestId,action}),result);store.close();store=createStore(path);
    assert.deepEqual(store.snapshot(token).state,result.state);assert.deepEqual(store.action(token,{requestId,action}).state,result.state);
    assert.throws(()=>store.action(token,{requestId:randomUUID(),action:{type:'purchase',item:'car-coupe',priceVersion:1}}),/下架/);
    assert.deepEqual(store.snapshot(token).state,result.state);
  }finally{store.close();rmSync(dir,{recursive:true});}
});
