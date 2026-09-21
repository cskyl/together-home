import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {items,quote} from '../src/items.js';
import {legacyPrices} from '../src/prices.js';
import {freshState,purchase,balance,validate} from '../src/state.js';
import {ledgerEntries} from '../src/ledger.js';
import {createStore} from '../backend/store.mjs';

function historicalState(){return {...freshState(),events:[
  {id:'legacy-study',type:'study',person:0,minutes:480,note:'已有学习',at:'2026-09-19T12:00:00Z'},
  {id:'legacy-bed',type:'purchase',person:0,item:'furniture-bed',config:{},amount:1000,at:'2026-09-19T12:01:00Z'},
  {id:'legacy-tree',type:'purchase',person:1,item:'cat-tree',config:{},amount:650,at:'2026-09-19T12:02:00Z'},
  {id:'legacy-build',type:'build',plan:'riverside',amount:500,at:'2026-09-19T12:03:00Z'}
],placements:[{id:'legacy-bed',plan:'riverside',room:'study',slot:12,rotation:1}]};}

test('家具降价只用于新购买，全部69款历史基础价仍可逐笔验证',()=>{
  assert.equal(Object.keys(legacyPrices).length,69);
  for(const [id,price] of Object.entries(legacyPrices)){
    assert.equal(quote(id,{},1).amount,price);
    const item=items.find(i=>i.id===id);
    if(['furniture','cats','decor'].includes(item.category))assert.ok(item.price<price);
    else assert.equal(item.price,price);
  }
  assert.equal(quote('furniture-bed').amount,300);assert.equal(quote('cat-tree').amount,195);
  const old=historicalState(),copy=structuredClone(old);validate(old);assert.equal(balance(old),2650);
  const next=purchase(old,{item:'furniture-bed',person:1});validate(next);
  assert.equal(next.events.at(-1).priceVersion,2);assert.equal(next.events.at(-1).amount,300);assert.equal(balance(next),2350);
  assert.deepEqual(next.events.slice(0,-1),copy.events);assert.deepEqual(next.placements,copy.placements);assert.deepEqual(old,copy);
  assert.deepEqual(ledgerEntries(next).filter(e=>e.event.type==='purchase').map(e=>e.amount),[1000,650,300]);
});

test('历史购买不能被改成新价，新物品不能伪装为历史价，未知价格版本被拒绝',()=>{
  const old=historicalState();old.events[1].amount=300;assert.throws(()=>validate(old),/购买记录/);
  const current=purchase(historicalState(),{item:'furniture-bed'});
  for(const version of [null,0,3,'2']){const fake=structuredClone(current);fake.events.at(-1).priceVersion=version;assert.throws(()=>validate(fake),/价格版本/);}
  const changed=structuredClone(current);changed.events.at(-1).amount=1000;assert.throws(()=>validate(changed),/购买记录/);
  assert.throws(()=>quote('furniture-standingdesk',{},1),/价格版本/);
  const car=quote('car-coupe',{paint:'red',wheels:'bronze',cabin:'ivory',roof:'open',trim:'sport'},1);assert.equal(car.amount,3400);assert.equal(quote('car-coupe',car.config).amount,3400);
});

test('数据库更新保留旧成交价、摆放及余额，新购物由后端采用新价且重试不多扣',()=>{
  const dir=mkdtempSync(join(tmpdir(),'home-price-version-')),path=join(dir,'history.sqlite'),token=randomBytes(32).toString('hex');let store=createStore(path);
  try{
    const room=store.create(token,{name:'价格测试',invite:randomBytes(32).toString('hex')});const before=historicalState();
    store.db.prepare('UPDATE rooms SET state=? WHERE id=?').run(JSON.stringify(before),room.roomId);store.close();store=createStore(path);
    assert.deepEqual(store.snapshot(token).state,before);
    const requestId=randomUUID(),action={type:'purchase',item:'furniture-bed',amount:1,priceVersion:1,person:1};
    const result=store.action(token,{requestId,action}),event=result.state.events.at(-1);
    assert.equal(event.amount,300);assert.equal(event.priceVersion,2);assert.equal(event.person,0);assert.equal(balance(result.state),2350);
    assert.deepEqual(result.state.events.slice(0,-1),before.events);assert.deepEqual(result.state.placements,before.placements);
    assert.deepEqual(store.action(token,{requestId,action}),result);store.close();store=createStore(path);
    assert.deepEqual(store.snapshot(token).state,result.state);assert.deepEqual(store.action(token,{requestId,action}).state,result.state);
  }finally{store.close();rmSync(dir,{recursive:true});}
});
