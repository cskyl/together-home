import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomBytes,randomUUID} from 'node:crypto';
import * as T from 'three';
import {items,getItem,quote,placementRooms,placementSlots} from '../src/items.js';
import {bagItems} from '../src/bag-catalog.js';
import {furniture2026Items} from '../src/furniture-2026.js';
import {createItemModel,disposeModel} from '../src/item-mesh.js';
import {createStore} from '../backend/store.mjs';
import {balance,inventory,invested,validate} from '../src/state.js';
import {getPlan} from '../src/plans.js';

test('十月商品扩展保留已发布123款的价格，新家具折后价与官方原价分开',()=>{
  const before=JSON.parse(readFileSync(new URL('./fixtures/prices-before-october.json',import.meta.url),'utf8'));
  assert.equal(Object.keys(before).length,123);
  for(const [id,price]of Object.entries(before))assert.equal(quote(id).amount,price,id+' keeps its published price');
  assert.equal(new Set(items.map(item=>item.id)).size,items.length);
  assert.ok(furniture2026Items.length>=16);
  for(const item of furniture2026Items){
    assert.equal(quote(item.id).amount,item.price);assert.ok(Number.isSafeInteger(item.price)&&item.price>0);
    assert.ok(item.price<item.reference.retailPrice.amount,item.id+' has a reduced game price');
    assert.equal(item.reference.retailPrice.currency,'USD');assert.equal(item.reference.checkedAt,'2026-10-04');
  }
});

test('Dior、Chanel和LV包包采用逐款核实的美元标价和官方商品图',()=>{
  assert.ok(bagItems.length>=9);
  const brands=new Set(bagItems.map(item=>item.reference.brand.toLowerCase()));
  for(const brand of ['dior','chanel','louis vuitton'])assert.ok(brands.has(brand),brand+' is represented');
  for(const item of bagItems){
    assert.equal(item.category,'bags');assert.equal(item.price,item.reference.retailPrice.amount);
    assert.equal(quote(item.id).amount,item.reference.retailPrice.amount);assert.equal(item.reference.retailPrice.currency,'USD');
    assert.ok(Number.isSafeInteger(item.price)&&item.price>0);assert.equal(item.reference.checkedAt,'2026-10-04');
    assert.match(new URL(item.reference.url).hostname,/(^|\.)(dior\.com|chanel\.com|louisvuitton\.com|gucci\.com|prada\.com)$/);
    assert.deepEqual(quote(item.id).config,{});assert.equal(placementSlots(item).length,12);
    assert.throws(()=>quote(item.id,{},1),/价格版本/);assert.throws(()=>quote(item.id,{},2),/价格版本/);
  }
});

test('新增家具和包包都有有效3D模型，包包可在房间展示位摆放',()=>{
  for(const item of [...furniture2026Items,...bagItems]){
    const model=createItemModel({item:item.id,config:{}}),bounds=new T.Box3().setFromObject(model),size=bounds.getSize(new T.Vector3());
    assert.ok(!bounds.isEmpty(),item.id);for(const number of [size.x,size.y,size.z])assert.ok(Number.isFinite(number)&&number>.01&&number<6,item.id);
    assert.ok(bounds.min.y>=-.025,item.id+' does not sit below the floor');
    assert.ok(placementRooms(getPlan('riverside'),item).length>0);disposeModel(model);
    if(item.category==='bags'){const stand=createItemModel({item:item.id,config:{}},{displayStand:true});assert.ok(new T.Box3().setFromObject(stand).max.y>.9);disposeModel(stand);}
  }
});

test('包包购买以服务端真实价扣款、双人共享，重试只记一笔且不改施工',()=>{
  const store=createStore(':memory:',{studyRoll:()=>500}),owner=randomBytes(32).toString('hex'),partner=randomBytes(32).toString('hex'),invite=randomBytes(32).toString('hex');
  try{
    store.create(owner,{name:'甲',invite});store.join(partner,{name:'乙',invite});
    const item=bagItems[0];while(balance(store.snapshot(owner).state)<item.price+1000)store.action(owner,{requestId:randomUUID(),action:{type:'study',minutes:480}});
    const before=store.snapshot(owner).state,id=randomUUID(),body={requestId:id,action:{type:'purchase',item:item.id,amount:1,priceVersion:1,person:0}};
    const bought=store.action(partner,body);store.action(partner,body);const state=store.snapshot(owner).state;validate(state);
    assert.equal(inventory(state).length,1);assert.equal(inventory(state)[0].amount,item.price);assert.equal(inventory(state)[0].person,1);
    assert.equal(balance(state),balance(before)-item.price);assert.equal(invested(state),invested(before));assert.deepEqual(state.events,bought.state.events);
    store.action(owner,{requestId:randomUUID(),action:{type:'place',id,position:{plan:'riverside',room:'living',slot:0,rotation:1}}});
    assert.equal(store.snapshot(partner).state.placements[0].id,id);
  }finally{store.close();}
});
