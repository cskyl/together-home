import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {designTemplate,newRoom,designWalls,validateDesign,designToPlan,planSVG} from '../src/designs.js';
import {freshState,study as recordStudy,build,saveDesign,purchase,placeItem,inventory,balance,invested,validate} from '../src/state.js';
import {allPlans,getPlan} from '../src/plans.js';
import {createStore as openStore} from '../backend/store.mjs';
import {createApi} from '../backend/server.mjs';
const study=(state,entry)=>recordStudy(state,entry,{roll:()=>500});
const createStore=path=>openStore(path,{studyRoll:()=>500});
const token=()=>randomBytes(32).toString('hex');
const act=(s,t,action,requestId=randomUUID())=>s.action(t,{requestId,action});
const pair=s=>{const a=token(),b=token(),invite=token();s.create(a,{name:'甲',invite});s.join(b,{name:'乙',invite});return {a,b};};

test('起步模板可验证、生成米制模型和安全 SVG，相邻房间只生成一面共用墙',()=>{
  for(const kind of ['studio','cozy']){const d=designTemplate(kind);validateDesign(d);const p=designToPlan(d);assert.ok(p.custom);assert.equal(p.areaM2,d.rooms.reduce((n,r)=>n+r.w*r.d/4,0));assert.ok(p.wallSegments.some(s=>!s.exterior));assert.ok(p.openings.length>0);}
  const rooms=[newRoom('living',4,4,8,8),newRoom('bed',12,4,8,8)],walls=designWalls(rooms);assert.equal(walls.filter(w=>!w.exterior).length,1);assert.deepEqual(walls.find(w=>!w.exterior).a,[12,4]);assert.deepEqual(walls.find(w=>!w.exterior).b,[12,12]);
  const d=designTemplate('studio');d.rooms[0].name='<script>x</script>';const svg=planSVG(d);assert.ok(!svg.includes('<script>'));assert.ok(svg.includes('&lt;script&gt;'));
});
test('拒绝重叠房间、越界和非网格尺寸、未知装修、无效或重复门窗',()=>{
  const good=designTemplate('studio');
  for(const patch of [{x:-1},{w:2.5},{w:49},{paint:'url(evil)'},{floor:'fake'},{name:''},{furnished:'false'}]){const d=structuredClone(good);Object.assign(d.rooms[0],patch);assert.throws(()=>validateDesign(d));}
  const overlap=structuredClone(good);overlap.rooms[1].z=9;assert.throws(()=>validateDesign(overlap),/重叠/);
  const hole=structuredClone(good);hole.openings[0].x=42;assert.throws(()=>validateDesign(hole),/门窗/);
  const duplicate=structuredClone(good);duplicate.openings.push({...duplicate.openings[0],id:'o-'+randomUUID()});assert.throws(()=>validateDesign(duplicate),/重叠/);
  assert.throws(()=>validateDesign(designTemplate()),/1–20/);
});
test('自定义户型与官方户型独立建设，保存装修不会改变旧进度、学习记录或余额',()=>{
  let s=build(study(freshState(),{person:0,minutes:200}));const original=structuredClone(s),design=designTemplate('studio');
  s=saveDesign(s,{design,expectedVersion:0});validate(s);assert.equal(allPlans(s).length,7);assert.equal(getPlan(design.id,s).custom,true);assert.deepEqual(s.events,original.events);assert.equal(balance(s),1500);
  s=build(s);assert.equal(invested(s,design.id),500);assert.equal(invested(s,'riverside'),500);assert.equal(balance(s),1000);
  const edit=structuredClone(s.customPlans[0]);edit.rooms[0].paint='blue';edit.rooms[0].floor='walnut';edit.rooms[0].furnished=false;const after=saveDesign(s,{design:edit,expectedVersion:1});assert.equal(after.customPlans[0].version,2);assert.deepEqual(after.events,s.events);assert.equal(balance(after),1000);assert.equal(invested(after),500);assert.deepEqual(validate(JSON.parse(JSON.stringify(after))),after);
  assert.throws(()=>validate({...after,customPlans:[]}),/户型/);
});
test('自由摆放可以移动与旋转，删房间或将车库改为卧室时仅收回物品',()=>{
  const design=designTemplate('cozy');let s=saveDesign(study(freshState(),{person:0,minutes:480}),{design,expectedVersion:0});s=purchase(s,{item:'car-compact'});const car=inventory(s)[0],garage=design.rooms.find(r=>r.type==='garage');
  const position={plan:design.id,room:garage.id,u:35,v:70,rotation:1};s=placeItem(s,{id:car.id,position});validate(s);
  for(const patch of [{u:5},{v:91},{u:30.1},{rotation:4},{room:design.rooms[0].id},{plan:'riverside'}])assert.throws(()=>placeItem(s,{id:car.id,position:{...position,...patch}}));
  const edited=structuredClone(s.customPlans[0]);edited.rooms.find(r=>r.id===garage.id).type='bed';const after=saveDesign(s,{design:edited,expectedVersion:1});assert.deepEqual(after.events,s.events);assert.equal(after.placements.length,0);assert.equal(inventory(after).length,1);assert.equal(balance(after),3300);
  s=purchase(after,{item:'decor-plant'});const plant=inventory(s).at(-1);s=placeItem(s,{id:plant.id,position:{...position,room:design.rooms[0].id,u:60,v:60}});s=purchase(s,{item:'decor-plant'});assert.throws(()=>placeItem(s,{id:inventory(s).at(-1).id,position:{...position,room:design.rooms[0].id,u:60,v:60}}),/已有物品/);
  const remove=structuredClone(s.customPlans[0]);remove.rooms=remove.rooms.filter(r=>r.id!==design.rooms[0].id);remove.openings=[];const removed=saveDesign(s,{design:remove,expectedVersion:2});assert.equal(removed.placements.length,0);assert.equal(inventory(removed).length,3);validate(removed);
});
test('后端保存使用版本检查、房间隔离和请求去重，不能覆盖同时打卡的数据',()=>{
  const s=createStore();try{const {a,b}=pair(s),{a:other}=pair(s),design=designTemplate('studio'),id=randomUUID(),action={type:'design',design,expectedVersion:0};
    const first=act(s,a,action,id);act(s,b,{type:'study',minutes:50});const retry=act(s,a,action,id);assert.equal(retry.state.customPlans.length,1);assert.equal(retry.state.customPlans[0].version,1);assert.equal(balance(retry.state),500);assert.equal(retry.revision,first.revision+1);
    const edit={...structuredClone(design),name:'对方改过了'};act(s,b,{type:'design',design:edit,expectedVersion:1});assert.throws(()=>act(s,a,{type:'design',design:{...design,name:'过期草稿'},expectedVersion:1}),e=>e.status===409);assert.equal(s.snapshot(a).state.customPlans[0].name,'对方改过了');
    assert.throws(()=>act(s,other,{type:'select',plan:design.id}),/有效户型/);assert.throws(()=>act(s,other,{type:'design',design,expectedVersion:2}),/对方刚更新/);
    act(s,a,{type:'build',plan:design.id});assert.equal(invested(s.snapshot(b).state),500);assert.equal(balance(s.snapshot(b).state),0);
  }finally{s.close();}
});
test('HTTP 同时保存同一版本只有一次成功，同时学习保留在最新存档',async()=>{
  const s=createStore(),server=createApi(s,{rateLimit:false});await new Promise(r=>server.listen(0,'127.0.0.1',r));const {a,b}=pair(s),design=designTemplate('studio');act(s,a,{type:'design',design,expectedVersion:0});
  const post=async(t,action)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/v1/action`,{method:'POST',headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'},body:JSON.stringify({requestId:randomUUID(),action})});return {status:r.status,data:await r.json()};};
  try{const results=await Promise.all([post(a,{type:'design',design:{...design,name:'甲的修改'},expectedVersion:1}),post(b,{type:'design',design:{...design,name:'乙的修改'},expectedVersion:1}),post(b,{type:'study',minutes:25})]);assert.deepEqual(results.slice(0,2).map(r=>r.status).sort(),[200,409]);assert.equal(results[2].status,200);const state=s.snapshot(a).state;assert.equal(state.customPlans[0].version,2);assert.equal(balance(state),250);assert.equal(state.events.length,1);validate(state);}finally{await new Promise(r=>server.close(r));s.close();}
});
test('重启数据库仍保留户型、装修、物品位置和修改版本，旧学习存档无需迁移',()=>{
  const dir=mkdtempSync(join(tmpdir(),'home-design-')),path=join(dir,'test.sqlite');let s=createStore(path);
  try{const {a,b}=pair(s),design=designTemplate('studio');act(s,a,{type:'study',minutes:50});act(s,b,{type:'design',design,expectedVersion:0});act(s,a,{type:'purchase',item:'decor-plant'});const owned=inventory(s.snapshot(a).state)[0];act(s,b,{type:'place',id:owned.id,position:{plan:design.id,room:design.rooms[0].id,u:75,v:35,rotation:3}});const before=s.snapshot(a).state;s.close();s=createStore(path);assert.deepEqual(s.snapshot(b).state,before);validate(before);}finally{s.close();rmSync(dir,{recursive:true});}
});
