import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {plans,basePlans,allPlans,getPlan,roomOverride} from '../src/plans.js';
import {freshState,study,build,purchase,placeItem,inventory,balance,invested,saveDesign,setRoomUse,validate} from '../src/state.js';
import {constructionTotal} from '../src/construction.js';
import {designTemplate} from '../src/designs.js';
import {getItem,placementRooms} from '../src/items.js';
import {ledgerEntries} from '../src/ledger.js';
import {createStore} from '../backend/store.mjs';
import {createApi} from '../backend/server.mjs';

const token=()=>randomBytes(32).toString('hex');
const pair=store=>{const a=token(),b=token(),invite=token();store.create(a,{name:'甲',invite});store.join(b,{name:'乙',invite});return {a,b};};
const act=(store,who,action,requestId=randomUUID())=>store.action(who,{action,requestId});
const use=(state,plan,room)=>({plan,room,expectedVersion:roomOverride(plan,state)?.version||0,expectedPlanVersion:getPlan(plan,state).version||0});
const funded=()=>study(freshState(),{person:0,minutes:480},{roll:()=>500});

test('旧存档无须迁移；六套内置户型的任意非车库房间都可转换并精确恢复',()=>{
  const legacy=funded(),catalog=structuredClone(plans);
  assert.deepEqual(validate(JSON.parse(JSON.stringify(legacy))),legacy);
  assert.equal(legacy.roomOverrides,undefined);
  for(const plan of plans){
    const original=build({...legacy,selected:plan.id},{person:0});
    for(const room of plan.rooms.filter(r=>r.type!=='garage')){
      const changed=setRoomUse(original,use(original,plan.id,room.id));validate(changed);
      const effective=getPlan(plan.id,changed),cat=effective.rooms.find(r=>r.id===room.id);
      assert.equal(effective.id,plan.id);assert.equal(cat.name,'猫房');assert.equal(cat.type,'cat');assert.equal(cat.furnished,false);assert.equal(cat.originalName,room.name);
      assert.equal(constructionTotal(effective),constructionTotal(plan));assert.deepEqual(changed.events,original.events);assert.equal(balance(changed),balance(original));assert.equal(invested(changed),invested(original));
      assert.equal(allPlans(changed).find(p=>p.id===plan.id).rooms.find(r=>r.id===room.id).type,'cat');
      const restored=setRoomUse(changed,use(changed,plan.id,null));validate(restored);
      assert.deepEqual(getPlan(plan.id,restored).rooms,plan.rooms);assert.deepEqual(restored.events,original.events);assert.equal(roomOverride(plan.id,restored).version,2);
    }
  }
  assert.deepEqual(plans,catalog);
});

test('厨房转猫房、购买摆放、恢复厨房保留位置、购买和账目；各套猫房独立且每套只转换一间',()=>{
  let state=purchase(funded(),{item:'cat-tree',person:1});state=build(state);
  const item=inventory(state)[0];state=setRoomUse(state,use(state,'riverside','kitchen'));
  state=placeItem(state,{id:item.id,position:{plan:'riverside',room:'kitchen',slot:12,rotation:2}});
  const before=structuredClone(state),ledger=ledgerEntries(state);
  state=setRoomUse(state,use(state,'riverside',null));validate(state);
  assert.equal(getPlan('riverside',state).rooms.find(r=>r.id==='kitchen').type,'kitchen');
  assert.ok(placementRooms(getPlan('riverside',state),getItem('cat-tree')).some(r=>r.id==='kitchen'));
  assert.deepEqual(state.placements,before.placements);assert.deepEqual(state.events,before.events);assert.deepEqual(ledgerEntries(state),ledger);assert.equal(balance(state),balance(before));
  state=setRoomUse(state,use(state,'riverside','suite'));state=setRoomUse(state,use(state,'fremont','bed2'));state=setRoomUse(state,use(state,'riverside','study'));
  assert.deepEqual(getPlan('riverside',state).rooms.filter(r=>r.catRoomOverride).map(r=>r.id),['study']);
  assert.equal(getPlan('riverside',state).rooms.find(r=>r.id==='suite').type,'bed');assert.equal(getPlan('fremont',state).rooms.find(r=>r.id==='bed2').type,'cat');
  assert.equal(invested({...state,selected:'fremont'}),0);assert.equal(invested(state,'riverside'),invested(before));assert.deepEqual(state.placements,before.placements);
});

test('自定义户型保留原布局、装修和摆放，另存独立；编辑删除猫房或改车库会清除无效覆盖',()=>{
  const design=designTemplate('cozy');let state=saveDesign(funded(),{design,expectedVersion:0});
  const bedroom=state.customPlans[0].rooms.find(r=>r.type==='bed');state=purchase(state,{item:'decor-plant'});state=placeItem(state,{id:inventory(state)[0].id,position:{plan:design.id,room:bedroom.id,u:30,v:70,rotation:3}});
  const original=structuredClone(state.customPlans[0]);state=setRoomUse(state,use(state,design.id,bedroom.id));
  assert.deepEqual(state.customPlans[0],original);assert.equal(getPlan(design.id,state).rooms.find(r=>r.id===bedroom.id).furnished,false);
  const edited=structuredClone(original);edited.rooms.find(r=>r.id===bedroom.id).paint='blue';edited.rooms.find(r=>r.id===bedroom.id).name='靠窗卧室';
  const stale=use(state,design.id,null);state=saveDesign(state,{design:edited,expectedVersion:1});validate(state);
  assert.equal(getPlan(design.id,state).rooms.find(r=>r.id===bedroom.id).type,'cat');assert.equal(getPlan(design.id,state).rooms.find(r=>r.id===bedroom.id).originalName,'靠窗卧室');assert.equal(state.placements.length,1);
  assert.throws(()=>setRoomUse(state,stale),e=>e.code==='ROOM_USE_CONFLICT');
  const restored=setRoomUse(state,use(state,design.id,null));assert.deepEqual(getPlan(design.id,restored).rooms,edited.rooms);
  const copy={...structuredClone(edited),id:'custom-'+randomUUID()};const copied=saveDesign(state,{design:copy,expectedVersion:0});assert.ok(!getPlan(copy.id,copied).rooms.some(r=>r.catRoomOverride));
  for(const mode of ['remove','garage','cat']){
    const changed=structuredClone(state.customPlans[0]);if(mode==='remove'){changed.rooms=changed.rooms.filter(r=>r.id!==bedroom.id);changed.openings=[];}else changed.rooms.find(r=>r.id===bedroom.id).type=mode;
    const result=saveDesign(state,{design:changed,expectedVersion:2});validate(result);assert.deepEqual(roomOverride(design.id,result),{plan:design.id,room:null,version:2});assert.deepEqual(result.events,state.events);assert.equal(inventory(result).length,1);
  }
});

test('拒绝伪造房间、车库、原生猫房、跨户型和无效覆盖；恢复后的旧请求不能覆盖新设置',()=>{
  const state=funded(),valid=use(state,'riverside','suite');
  for(const patch of [{plan:'unknown'},{room:'garage'},{room:'no-room'},{room:null},{room:42},{expectedVersion:-1},{expectedPlanVersion:undefined}])assert.throws(()=>setRoomUse(state,{...valid,...patch}));
  const changed=setRoomUse(state,valid),restored=setRoomUse(changed,use(changed,'riverside',null));
  assert.throws(()=>setRoomUse(restored,valid),e=>e.code==='ROOM_USE_CONFLICT');
  for(const roomOverrides of [null,{},[{plan:'riverside',room:'garage',version:1}],[{plan:'none',room:'suite',version:1}],[{plan:'riverside',room:'suite',version:0}],[{plan:'riverside',room:'suite',version:1.5}],[{plan:'riverside',room:'suite',version:1},{plan:'riverside',room:'study',version:1}],[{plan:'riverside',version:1}]])assert.throws(()=>validate({...state,roomOverrides}));
  const custom=saveDesign(state,{design:designTemplate('cat-home'),expectedVersion:0}),plan=basePlans(custom).find(p=>p.custom),native=plan.rooms.find(r=>r.type==='cat');
  assert.throws(()=>setRoomUse(custom,use(custom,plan.id,native.id)),/本来就是/);assert.throws(()=>setRoomUse(custom,use(custom,'riverside',native.id)),/车库以外/);
});

test('双人修改由服务器合并最新存档并按请求去重；SQLite 重启保留所有进度和用途版本',()=>{
  const dir=mkdtempSync(join(tmpdir(),'together-room-use-')),path=join(dir,'isolated.sqlite');let store=createStore(path,{studyRoll:()=>500});
  try{
    const {a,b}=pair(store),{a:other}=pair(store);act(store,a,{type:'study',minutes:100});act(store,b,{type:'build',plan:'riverside'});act(store,b,{type:'study',minutes:50});act(store,a,{type:'purchase',item:'cat-bed'});
    const firstState=store.snapshot(a).state,owned=inventory(firstState)[0];act(store,b,{type:'place',id:owned.id,position:{plan:'riverside',room:'suite',slot:12,rotation:1}});
    const before=store.snapshot(a).state,action={type:'room-use',...use(before,'riverside','suite')},requestId=randomUUID();
    const first=act(store,a,action,requestId);assert.deepEqual(first.state.events,before.events);assert.deepEqual(first.state.placements,before.placements);assert.equal(first.state.customPlans,undefined);
    act(store,b,{type:'study',minutes:25});const retry=act(store,a,action,requestId);assert.equal(retry.state.roomOverrides[0].version,1);assert.equal(retry.revision,first.revision+1);assert.equal(retry.state.events.length,before.events.length+1);
    assert.throws(()=>act(store,b,action,requestId),e=>e.status===409);assert.throws(()=>act(store,b,action),e=>e.status===409);assert.equal(store.snapshot(other).state.roomOverrides,undefined);
    const snapshot=store.snapshot(a);store.close();store=createStore(path,{studyRoll:()=>500});assert.deepEqual(store.snapshot(b).state,snapshot.state);assert.equal(act(store,a,action,requestId).revision,snapshot.revision);
    act(store,b,{type:'room-use',...use(snapshot.state,'riverside',null)});const result=store.snapshot(a).state;assert.deepEqual(result.events,snapshot.state.events);assert.deepEqual(result.placements,snapshot.state.placements);validate(result);
  }finally{store.close();rmSync(dir,{recursive:true});}
});

test('HTTP 同时改房间只有一方同版本成功，并发学习和其他户型修改正常保留',async()=>{
  const store=createStore(undefined,{studyRoll:()=>500}),server=createApi(store,{rateLimit:false});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const {a,b}=pair(store),post=async(who,action)=>{const response=await fetch(`http://127.0.0.1:${server.address().port}/v1/action`,{method:'POST',headers:{Authorization:'Bearer '+who,'Content-Type':'application/json'},body:JSON.stringify({requestId:randomUUID(),action})});return {status:response.status,data:await response.json()};};
  try{
    const original=store.snapshot(a).state,results=await Promise.all([post(a,{type:'room-use',...use(original,'riverside','suite')}),post(b,{type:'room-use',...use(original,'riverside','study')}),post(b,{type:'study',minutes:25}),post(a,{type:'room-use',...use(original,'fremont','bed2')})]);
    assert.deepEqual(results.slice(0,2).map(r=>r.status).sort(),[200,409]);assert.equal(results[2].status,200);assert.equal(results[3].status,200);const state=store.snapshot(a).state;assert.equal(balance(state),250);assert.equal(state.events.length,1);assert.equal(state.roomOverrides.length,2);validate(state);
  }finally{await new Promise(resolve=>server.close(resolve));store.close();}
});
