import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import * as THREE from 'three';
import {items,getItem,quote,optionGroups,placementRooms,placementSlots} from '../src/items.js';
import {createItemModel,disposeModel} from '../src/item-mesh.js';
import {createFurnitureModel} from '../src/furniture-mesh.js';
import {designTemplate,validateDesign,designToPlan,newRoom,roomTypes,planSVG} from '../src/designs.js';
import {freshState,study,saveDesign,purchase,placeItem,inventory,balance,validate} from '../src/state.js';
import {ledgerEntries} from '../src/ledger.js';
import {createStore} from '../backend/store.mjs';

const furnitureShapes=['sofa','armchair','bed','wardrobe','dresser','nightstand','desk','officechair','diningtable','diningchair','tvstand','bookcase','sectional','ottoman','coffeetable','sidetable','chaise','daybed','bunkbed','vanity','standingdesk','filingcabinet','bookshelfwide','stool','barstool','sideboard','kitchenisland','kitchencart','wallcabinet','bathvanity','bathshelf','mirror','laundrybasket','shoecabinet','coatstand','entrybench','outdoorchair','outdoortable','recliner','tv','consolecabinet','singlebed','clothesrack','makeupstool','arclamp','plantstand','displaycase','pantry','fridge','microwave','oven','dishwasher','washingmachine','dryer','toilet','shower','patiochaise','patiosofa'];
const catShapes=['tree','condo','bed','litter','feeder','fountain','scratcher','tunnel','perch','toys'];
const newIds=[...furnitureShapes.map(shape=>'furniture-'+shape),...catShapes.map(shape=>'cat-'+shape)];
const oldCatalog=JSON.parse(readFileSync(new URL('./fixtures/catalog-before-furniture.json',import.meta.url),'utf8'));
const funded=()=>study(freshState(),{person:0,minutes:480},{roll:()=>500});
const secret=()=>randomBytes(32).toString('hex');
const act=(store,token,action,requestId=randomUUID())=>store.action(token,{requestId,action});

test('58件家具和10件猫用品可购买，旧47件历史价格及选配保持兼容',()=>{
  assert.equal(items.length,123);assert.equal(new Set(items.map(item=>item.id)).size,123);assert.deepEqual(items.filter(i=>i.category==='furniture').map(i=>i.id).sort(),furnitureShapes.map(s=>'furniture-'+s).sort());assert.deepEqual(items.filter(i=>i.category==='cats').map(i=>i.id).sort(),catShapes.map(s=>'cat-'+s).sort());
  for(const old of oldCatalog.items){const item=getItem(old.id);assert.equal(quote(old.id,{},1).amount,old.price);assert.deepEqual(quote(old.id).config,old.defaultConfig);assert.deepEqual(optionGroups(item),oldCatalog.options[item.category]||{});}
  for(const id of newIds){const item=getItem(id),priced=quote(id);assert.ok(Number.isSafeInteger(item.price)&&item.price>0);assert.equal(priced.amount,item.price);assert.deepEqual(priced.config,{});assert.deepEqual(placementSlots(item),[12,13,14,15]);assert.throws(()=>quote(id,{free:true}),/选配/);}
});

test('猫房模板含5间有效房间，猫房默认留空，SVG和模型保留猫房类型',()=>{
  assert.ok(roomTypes.some(([type])=>type==='cat'));assert.equal(newRoom('cat').furnished,false);const design=designTemplate('cat-home'),original=structuredClone(design);validateDesign(design);assert.equal(design.rooms.length,5);const cat=design.rooms.find(room=>room.type==='cat');assert.ok(cat);assert.equal(cat.furnished,false);assert.ok(design.rooms.some(room=>room.type==='living'));assert.ok(design.rooms.some(room=>room.type==='bed'));assert.ok(design.openings.length>0);
  const plan=designToPlan(design);assert.ok(plan.custom);assert.ok(plan.rooms.some(room=>room.id===cat.id&&room.type==='cat'));assert.ok(planSVG(design).includes('猫'));assert.deepEqual(design,original);
  const saved=saveDesign(funded(),{design,expectedVersion:0});assert.equal(inventory(saved).length,0);assert.equal(saved.events.length,1);assert.equal(balance(saved),4800);validate(saved);
});

test('68件家具和猫用品使用各自的有效立体结构，模型落地且能独立创建和释放',()=>{
  const shapes=new Set();
  for(const id of newIds){const item=getItem(id),model=createFurnitureModel(item),meshes=[];model.traverse(node=>{if(node.isMesh){meshes.push(node);assert.ok(node.geometry.attributes.position.count>0);assert.ok(node.material?.color?.isColor);assert.ok(Number.isFinite(node.material.opacity));}});assert.ok(meshes.length>=3,id+' must have a detailed model');
    const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());for(const value of [size.x,size.y,size.z])assert.ok(Number.isFinite(value)&&value>0&&value<10,id+' bounds');assert.ok(Math.abs(bounds.min.y)<.002,id+' rests on floor');
    const signature=createHash('sha256').update(JSON.stringify(meshes.map(mesh=>({geometry:mesh.geometry.type,parameters:mesh.geometry.parameters,position:mesh.position.toArray(),rotation:mesh.rotation.toArray(),scale:mesh.scale.toArray()})))).digest('hex');assert.ok(!shapes.has(signature),id+' has its own geometry');shapes.add(signature);
    const owned=createItemModel({item:id,config:{}}),other=createItemModel({item:id,config:{}});assert.ok(!new THREE.Box3().setFromObject(owned).isEmpty());assert.notEqual(owned,other);owned.position.x=5;assert.equal(other.position.x,0);disposeModel(model);disposeModel(owned);disposeModel(other);
  }
  assert.equal(shapes.size,68);
});

test('新家具和猫用品实际扣款后才能摆放，猫房支持位置旋转及收回仓库',()=>{
  const design=designTemplate('cat-home'),room=design.rooms.find(r=>r.type==='cat'),plan=designToPlan(design);
  for(const id of newIds){let state=saveDesign(funded(),{design,expectedVersion:0});const before=structuredClone(state);state=purchase(state,{item:id,person:1});const owned=inventory(state)[0];assert.equal(owned.amount,getItem(id).price);assert.equal(owned.person,1);assert.equal(balance(state),4800-owned.amount);assert.deepEqual(state.events.slice(0,1),before.events);assert.ok(placementRooms(plan,getItem(id)).some(r=>r.id===room.id));
    const position={plan:design.id,room:room.id,u:23,v:67,rotation:2};state=placeItem(state,{id:owned.id,position});assert.deepEqual(state.placements[0],{id:owned.id,...position});validate(state);assert.equal(ledgerEntries(state).at(-1).amount,owned.amount);assert.equal(ledgerEntries(state).at(-1).incoming,false);assert.equal(ledgerEntries(state).at(-1).running,balance(state));
    const removed=placeItem(state,{id:owned.id,position:null});assert.equal(removed.placements.length,0);assert.equal(inventory(removed).length,1);assert.equal(balance(removed),balance(state));assert.throws(()=>placeItem(before,{id:owned.id,position}),/没有这件/);
  }
});

test('双人购买猫用品由后端计价并去重，重启后保留猫房、购买和共同摆放',()=>{
  const dir=mkdtempSync(join(tmpdir(),'together-cats-')),path=join(dir,'pets.sqlite');let store=createStore(path,{studyRoll:()=>500});
  try{const a=secret(),b=secret(),invite=secret();store.create(a,{name:'甲',invite});store.join(b,{name:'乙',invite});act(store,a,{type:'study',minutes:480});const design=designTemplate('cat-home');act(store,a,{type:'design',design,expectedVersion:0});const cat=design.rooms.find(room=>room.type==='cat'),requestId=randomUUID(),action={type:'purchase',item:'cat-tree',person:1,amount:0,config:{}};
    const first=act(store,a,action,requestId),owned=first.state.events.at(-1);assert.equal(owned.person,0);assert.equal(owned.amount,getItem('cat-tree').price);assert.equal(owned.priceVersion,3);act(store,a,action,requestId);assert.equal(inventory(store.snapshot(b).state).length,1);assert.throws(()=>act(store,b,action,requestId),/编号已被使用/);
    act(store,b,{type:'place',id:owned.id,position:{plan:design.id,room:cat.id,u:22,v:76,rotation:3}});act(store,b,{type:'purchase',item:'cat-fountain'});const before=store.snapshot(a);assert.equal(balance(before.state),4800-getItem('cat-tree').price-getItem('cat-fountain').price);assert.equal(ledgerEntries(before.state).filter(entry=>!entry.incoming).length,2);store.close();store=createStore(path,{studyRoll:()=>500});assert.deepEqual(store.snapshot(b).state,before.state);assert.equal(act(store,a,action,requestId).revision,before.revision);validate(store.snapshot(a).state);
  }finally{store.close();rmSync(dir,{recursive:true});}
});
