import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import * as THREE from 'three';
import {items,furnitureGroups} from '../src/items.js';
import {furnitureAdditions} from '../src/furniture-catalog.js';
import {createItemModel,disposeModel} from '../src/item-mesh.js';

test('64件家具、猫用品、装饰和汽车都有官方图片与实物规格，实价不参与游戏计价',()=>{
  const furniture=items.filter(i=>i.category==='furniture'),cars=items.filter(i=>i.category==='cars'),referenced=items.filter(i=>['furniture','cars','cats','decor'].includes(i.category));
  assert.equal(furniture.length,38);assert.equal(cars.length,6);assert.equal(items.length,95);
  assert.equal(referenced.length,64);
  for(const item of referenced){
    const r=item.reference;assert.ok(r,item.id+' has a real reference');assert.ok(r.brand&&r.name);assert.equal(new URL(r.url).protocol,'https:');assert.equal(new URL(r.imageSource).protocol,'https:');assert.match(r.checkedAt,/^\d{4}-\d{2}-\d{2}$/);
    assert.ok(r.specs.length>=2,item.id+' has usable specifications');for(const [label,value]of r.specs){assert.ok(typeof label==='string'&&label.trim());assert.ok(typeof value==='string'&&value.trim());}
    assert.ok(r.image.startsWith('items/'));assert.ok(!r.image.includes('..'));const image=readFileSync(resolve('public',r.image));assert.ok(image.length>1000,item.id+' image is not empty');
    assert.ok(image[0]===0xff&&image[1]===0xd8||image.subarray(1,4).toString()==='PNG'||image.subarray(8,12).toString()==='WEBP',item.id+' uses a real bitmap image');
    if(r.retailPrice){assert.ok(Number.isFinite(r.retailPrice.amount)&&r.retailPrice.amount>0);assert.equal(r.retailPrice.currency,'USD');assert.ok(Number.isSafeInteger(item.price)&&item.price>0);}
  }
  for(const [group]of furnitureGroups.filter(([id])=>id!=='all'))assert.ok(furniture.some(i=>i.roomGroup===group),group+' furniture exists');
});

test('26件新增家具都能独立创建可摆放的立体模型，所有部件位于地板以上',()=>{
  assert.equal(furnitureAdditions.length,26);
  for(const item of furnitureAdditions){
    const model=createItemModel({item:item.id,config:{}}),bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());
    assert.ok(!bounds.isEmpty(),item.id);assert.ok(Math.abs(bounds.min.y)<.002,item.id+' rests on the floor');
    for(const v of [size.x,size.y,size.z])assert.ok(Number.isFinite(v)&&v>.05&&v<6,item.id+' has reasonable room dimensions');
    let meshes=0;model.traverse(n=>{if(n.isMesh)meshes++;});assert.ok(meshes>=3,item.id+' has more than an empty box');disposeModel(model);
  }
});
