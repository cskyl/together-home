import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_FOCUS,focusLabel,rewardRange,makeReward,studyReward,validateStudyReward } from '../src/rewards.js';
import { freshState,study,build,balance,earned,undoStudy,validate } from '../src/state.js';
import { createStore } from '../backend/store.mjs';
import { createApi } from '../backend/server.mjs';

const token=()=>randomBytes(32).toString('hex');
const pair=store=>{const a=token(),b=token(),invite=token();store.create(a,{name:'甲',invite});store.join(b,{name:'乙',invite});return {a,b};};
const act=(store,member,action,requestId=randomUUID())=>store.action(member,{requestId,action});
const legacyStudy=(minutes=25)=>({id:randomUUID(),type:'study',person:0,minutes,note:'旧记录',at:'2026-09-19T10:00:00.000Z'});

test('投入状态平滑影响预计范围，极端随机结果不会超出小幅浮动范围',()=>{
  assert.equal(DEFAULT_FOCUS,50);
  assert.deepEqual(rewardRange(25,0),{min:200,max:225,average:213});
  assert.deepEqual(rewardRange(25,50),{min:238,max:263,average:250});
  assert.deepEqual(rewardRange(25,100),{min:275,max:300,average:288});
  assert.deepEqual(rewardRange(25),rewardRange(25,DEFAULT_FOCUS));
  for(const minutes of [1,25,50,90,480]){
    let previous={min:0,max:0,average:0};
    for(let focus=0;focus<=100;focus++){
      const range=rewardRange(minutes,focus);
      assert.ok(range.min>=previous.min&&range.max>=previous.max&&range.average>=previous.average);
      assert.ok(range.min<=range.average&&range.average<=range.max);
      for(const [roll,expected] of [[0,range.min],[500,range.average],[1000,range.max]]){
        const reward=makeReward(minutes,focus,count=>{assert.equal(count,1001);return roll;});
        assert.equal(reward.rewardVersion,1);assert.equal(reward.focus,focus);
        assert.equal(reward.reward,expected);assert.ok(Number.isInteger(reward.reward));
        assert.equal(reward.efficiency,8000+30*focus+roll);
        assert.doesNotThrow(()=>validateStudyReward({...legacyStudy(minutes),...reward}));
      }
      previous=range;
    }
  }
  assert.ok(new Set([0,25,50,75,100].map(focusLabel)).size>=3);
  const outcomes=new Set(Array.from({length:1001},(_,roll)=>makeReward(25,50,()=>roll).reward));
  assert.ok(outcomes.size>10,'同样的时长和投入状态仍应有多种可能金额');
});

test('新打卡默认中间投入状态，并在保存时只计算一次随机金额',()=>{
  let calls=0;
  const id=randomUUID(),state=study(freshState(),{person:1,minutes:25,note:'练习'},{id,roll:count=>{assert.equal(count,1001);calls++;return 1000;}});
  const event=state.events[0];
  assert.equal(event.id,id);assert.equal(event.focus,50);assert.equal(event.efficiency,10500);assert.equal(event.reward,263);
  assert.equal(studyReward(event),263);assert.equal(balance(state),263);assert.equal(earned(state),263);
  for(let i=0;i<4;i++){assert.deepEqual(validate(JSON.parse(JSON.stringify(state))),state);assert.equal(balance(state),263);}
  assert.equal(calls,1);
});

test('投入状态与时长必须为允许范围内的整数，错误输入不抽取奖励',()=>{
  for(const focus of [-1,101,0.5,NaN,Infinity,'50',null]){
    let calls=0;
    assert.throws(()=>rewardRange(25,focus));
    assert.throws(()=>study(freshState(),{person:0,minutes:25,focus},{roll:()=>{calls++;return 0;}}));
    assert.equal(calls,0,'非法投入状态不应抽奖');
  }
  for(const minutes of [-1,0,481,0.5,NaN,Infinity,'25',null]){
    let calls=0;
    assert.throws(()=>rewardRange(minutes,50));
    assert.throws(()=>study(freshState(),{person:0,minutes,focus:50},{roll:()=>{calls++;return 0;}}));
    assert.equal(calls,0,'非法时长不应抽奖');
  }
});

test('历史固定金额不被重算，旧记录可和随机奖励及建设混合保存',()=>{
  const legacy={...freshState(),events:[legacyStudy(100)]};
  const original=structuredClone(legacy);
  assert.equal(studyReward(legacy.events[0]),1000);
  assert.deepEqual(validate(legacy),original);
  const mixed=study(build(legacy),{person:1,minutes:25,focus:0},{roll:()=>0});
  assert.equal(earned(mixed),1200);assert.equal(balance(mixed),200);
  assert.deepEqual(mixed.events[0],original.events[0]);
  assert.deepEqual(validate(JSON.parse(JSON.stringify(mixed))),mixed);
  assert.deepEqual(legacy,original);
});

test('导入拒绝不完整、超界或金额对不上的奖励元数据',()=>{
  const valid=study(freshState(),{person:0,minutes:25,focus:75},{roll:()=>500});
  const event=valid.events[0];
  for(const key of ['rewardVersion','focus','efficiency','reward']){
    const partial=structuredClone(event);delete partial[key];
    assert.throws(()=>validate({...valid,events:[partial]}));
    const legacy={...legacyStudy(),[key]:event[key]};
    assert.throws(()=>validate({...freshState(),events:[legacy]}));
    assert.throws(()=>validate({...freshState(),events:[{...legacyStudy(),[key]:undefined}]}));
  }
  for(const patch of [{rewardVersion:2},{rewardVersion:'1'},{focus:-1},{focus:101},{focus:75.5},{efficiency:10249},{efficiency:11251},{efficiency:10750.1},{reward:event.reward+1},{reward:0},{reward:'269'},{reward:NaN}]){
    assert.throws(()=>validate({...valid,events:[{...event,...patch}]}));
  }
  const spent=build(valid),forged=structuredClone(spent);forged.events[0].reward=100000;
  assert.throws(()=>validate(forged));
});

test('撤销按实际到账金额判断，低于基础金额也能撤销，已消费金额不能撤销',()=>{
  const lower=study(freshState(),{person:0,minutes:25,focus:0},{roll:()=>0});
  assert.equal(balance(lower),200);assert.equal(balance(undoStudy(lower)),0);
  assert.throws(()=>undoStudy(build(lower)),/已投入/);
  const higher=study(freshState(),{person:0,minutes:25,focus:100},{roll:()=>1000});
  assert.equal(balance(higher),300);assert.equal(balance(undoStudy(higher)),0);
  const partiallySpent={...higher,events:[...higher.events,{id:randomUUID(),type:'build',plan:'riverside',amount:50,at:new Date().toISOString()}]};
  validate(partiallySpent);assert.equal(balance(partiallySpent),250);assert.throws(()=>undoStudy(partiallySpent),/已投入/);
});

test('联机由后端确定身份和奖励，客户端只能提交投入状态与时长',()=>{
  let calls=0;const store=createStore(':memory:',{studyRoll:count=>{assert.equal(count,1001);calls++;return 0;}});
  try{
    const {a,b}=pair(store),id=randomUUID();
    const action={type:'study',minutes:25,focus:75,note:'专注学习',person:1,rewardVersion:99,efficiency:99999,reward:999999,amount:999999};
    const first=act(store,a,action,id),event=first.state.events[0];
    assert.equal(event.person,0);assert.equal(event.id,id);assert.equal(event.focus,75);assert.equal(event.efficiency,10250);assert.equal(event.reward,256);assert.equal(event.rewardVersion,1);assert.equal(event.amount,undefined);
    for(let retry=0;retry<4;retry++){assert.deepEqual(act(store,a,action,id),first);assert.equal(calls,1);}
    assert.throws(()=>act(store,a,{...action,focus:100},id),/编号已被使用/);
    assert.throws(()=>act(store,b,action,id),/编号已被使用/);assert.equal(calls,1);
    assert.equal(balance(store.snapshot(b).state),256);
    act(store,a,{type:'undo'});assert.equal(balance(store.snapshot(b).state),0);
    assert.throws(()=>act(store,b,{type:'study',minutes:25,focus:101}));assert.equal(calls,1);
    const defaultFocus=act(store,b,{type:'study',minutes:25}).state.events[0];
    assert.equal(defaultFocus.focus,50);assert.equal(defaultFocus.reward,238);assert.equal(calls,2);
    act(store,b,{type:'undo'});assert.equal(balance(store.snapshot(a).state),0);
  }finally{store.close();}
});

test('SQLite 重启后仍保留实际奖励，响应丢失后的重试不会重新抽取或重复加钱',()=>{
  const dir=mkdtempSync(join(tmpdir(),'together-rewards-')),path=join(dir,'test.sqlite');
  let calls=0,store=createStore(path,{studyRoll:()=>{calls++;return 1000;}});
  try{
    const {a,b}=pair(store),id=randomUUID(),action={type:'study',minutes:50,focus:100};
    const saved=act(store,a,action,id);assert.equal(balance(saved.state),600);assert.equal(calls,1);
    store.close();store=createStore(path,{studyRoll:()=>assert.fail('已保存的请求不可重新抽奖')});
    assert.deepEqual(store.snapshot(a),saved);
    for(let i=0;i<3;i++)assert.deepEqual(act(store,a,action,id),saved);
    assert.equal(store.snapshot(b).state.events.length,1);assert.equal(balance(store.snapshot(b).state),600);assert.equal(calls,1);
  }finally{store.close();rmSync(dir,{recursive:true});}
});

test('HTTP 同时学习分别结算并累加实际奖励，事务建设不能透支',async()=>{
  let calls=0;const store=createStore(':memory:',{studyRoll:()=>[0,1000][calls++]}),server=createApi(store,{rateLimit:false});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const {a,b}=pair(store),url=`http://127.0.0.1:${server.address().port}/v1/action`;
  const post=async(member,action)=>{const response=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+member,'Content-Type':'application/json'},body:JSON.stringify({requestId:randomUUID(),action})});return {status:response.status,data:await response.json()};};
  try{
    const results=await Promise.all([post(a,{type:'study',minutes:25,focus:50}),post(b,{type:'study',minutes:25,focus:50})]);
    assert.deepEqual(results.map(result=>result.status),[200,200]);
    const before=store.snapshot(a).state;assert.equal(calls,2);assert.equal(balance(before),501);
    assert.deepEqual(before.events.map(event=>event.reward).sort((a,b)=>a-b),[238,263]);
    assert.deepEqual(before.events.map(event=>event.person).sort(),[0,1]);
    const builds=await Promise.all([post(a,{type:'build',plan:'riverside'}),post(b,{type:'build',plan:'riverside'})]);
    assert.deepEqual(builds.map(result=>result.status).sort(),[200,400]);
    const after=store.snapshot(b).state;assert.equal(balance(after),0);
    assert.equal(after.events.filter(event=>event.type==='build').reduce((sum,event)=>sum+event.amount,0),501);validate(after);
    assert.equal((await post(a,{type:'build',plan:'riverside'})).status,400);
  }finally{await new Promise(resolve=>server.close(resolve));store.close();}
});
