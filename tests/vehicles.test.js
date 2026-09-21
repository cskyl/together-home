import test from 'node:test';
import assert from 'node:assert/strict';
import {items,quote,optionGroups} from '../src/items.js';
import {createItemModel,disposeModel} from '../src/item-mesh.js';
import * as THREE from 'three';
const vehicles=items.filter(i=>i.category==='cars'&&!i.archived);
function defaults(item,trim){return Object.fromEntries(Object.entries(optionGroups(item)).map(([key,group])=>[key,key==='trim'?trim:group.values.find(v=>!v.trims||v.trims.includes(trim)).id]));}

test('八款实际车型按美元 MSRP 计价，丰田车型官网基础价保持正确',()=>{
  assert.equal(vehicles.length,8);
  for(const brand of ['Tesla','Porsche','Toyota','Honda'])assert.equal(vehicles.filter(i=>i.reference.brand===brand).length,2);
  assert.equal(vehicles.find(i=>i.reference.brand==='Toyota'&&/Camry/.test(i.name)).price,29600);
  assert.equal(vehicles.find(i=>i.reference.brand==='Toyota'&&/RAV4/.test(i.name)).price,31900);
  for(const item of vehicles){assert.ok(item.price>=20000);assert.equal(item.reference.retailPrice.amount,item.price);assert.equal(quote(item.id).priceVersion,3);for(const version of [1,2])assert.throws(()=>quote(item.id,{},version),/价格版本/);}
});

test('每个原厂版本可报价和渲染；选配按适用版本计价，不允许跨版本套用',()=>{
  let restricted=0,paid=0;
  for(const item of vehicles){const groups=optionGroups(item);
    for(const trim of groups.trim.values){const config=defaults(item,trim.id),base=quote(item.id,config);assert.equal(base.amount,trim.totalPrice);
      const model=createItemModel({item:item.id,config}),box=new THREE.Box3().setFromObject(model);assert.ok(!box.isEmpty());for(const v of [...box.min.toArray(),...box.max.toArray()])assert.ok(Number.isFinite(v));disposeModel(model);
      for(const [key,group]of Object.entries(groups)){if(key==='trim')continue;for(const option of group.values){const selected={...config,[key]:option.id};if(option.trims&&!option.trims.includes(trim.id)){restricted++;assert.throws(()=>quote(item.id,selected),/选配/);}else{assert.equal(quote(item.id,selected).amount,trim.totalPrice+option.price);if(option.price>0)paid++;}}}
    }
    assert.throws(()=>quote(item.id,{unknownFactoryOption:'yes'}),/选配/);
  }
  assert.ok(restricted>0,'Factory trim restrictions are covered');assert.ok(paid>=20,'Verified paid options are available across models');
});
