import test from 'node:test';
import assert from 'node:assert/strict';
import { freshState,study as recordStudy,build,balance,invested,progress,undoStudy,validate } from '../src/state.js';
import { constructionTotal,constructionPhases } from '../src/construction.js';
import { plans } from '../src/plans.js';
// Keep unrelated ledger fixtures deterministic; rewards.test.js covers all reward outcomes.
const study=(state,entry)=>recordStudy(state,entry,{roll:()=>500});

test('旧版存档接入新增户型后仍保留原余额、学习记录和施工进度',()=>{
  const legacy={version:1,selected:'riverside',names:['甲','乙'],events:[
    {id:'legacy-study',type:'study',person:0,minutes:100,note:'保留这条备注',at:'2026-09-19T10:00:00.000Z'},
    {id:'legacy-build',type:'build',plan:'riverside',amount:500,at:'2026-09-19T10:01:00.000Z'},
  ]};
  assert.deepEqual(validate(structuredClone(legacy)),legacy);
  for(const plan of plans){
    const next=validate({...structuredClone(legacy),selected:plan.id});
    assert.equal(balance(next),500);assert.equal(invested(next,'riverside'),500);
    assert.deepEqual(next.events,legacy.events);assert.deepEqual(next.names,legacy.names);
    if(['ashland','grandview','anthem'].includes(plan.id)){
      const built=build(next);assert.equal(invested(built,plan.id),500);
      assert.equal(invested(built,'riverside'),500);assert.equal(balance(built),0);
      assert.deepEqual(built.events.slice(0,2),legacy.events);
    }
  }
});
test('两个人的学习合并为共同资金，资金不能重复花费',()=>{let s=freshState();s=study(s,{person:0,minutes:25});s=study(s,{person:1,minutes:50});assert.equal(balance(s),750);s=build(s);assert.equal(invested(s),750);assert.equal(balance(s),0);assert.equal(progress(invested(s))[0].ratio,750/constructionPhases(plans[0])[0].cost);assert.throws(()=>build(s),/先记录/);validate(s);});
test('更换户型保留独立施工记录和同一个钱包',()=>{let s=study(freshState(),{person:0,minutes:100});s=build(s);s=study({...s,selected:'fremont'},{person:1,minutes:50});s=build(s);assert.equal(balance(s),0);assert.equal(invested(s,'fremont'),500);assert.equal(invested(s,'riverside'),1000);validate(s);});
test('所有建设按阶段推进，完工时仍保留多余资金',()=>{let s=freshState();const total=constructionTotal(plans[0]);for(let remaining=total+4100;remaining>0;){const amount=Math.min(4800,remaining);s=study(s,{person:0,minutes:amount/10});remaining-=amount;}for(let i=0;i<20;i++)s=build(s);assert.equal(invested(s),total);assert.equal(balance(s),4100);assert.ok(progress(invested(s)).every(p=>p.ratio===1));assert.throws(()=>build(s),/全部建成/);});
test('未花掉的学习可撤销，已花掉的记录不可制造负余额',()=>{let s=study(freshState(),{person:0,minutes:25});assert.equal(balance(undoStudy(s)),0);s=build(s);assert.throws(()=>undoStudy(s),/已投入/);s=study(s,{person:1,minutes:30});const undone=undoStudy(s);assert.equal(balance(undone),0);assert.equal(invested(undone),250);validate(undone);});
test('存档导入拒绝透支、重复 ID、无效分钟和伪造建设金额',()=>{const base=study(freshState(),{person:0,minutes:25});assert.deepEqual(validate(JSON.parse(JSON.stringify(base))),base);const bad=structuredClone(base);bad.events.push({...bad.events[0]});assert.throws(()=>validate(bad),/记录无效/);for(const minutes of [-1,0,481,2.5,NaN])assert.throws(()=>study(freshState(),{person:0,minutes}));const overspend={...base,events:[...base.events,{id:'bad',type:'build',plan:'riverside',amount:1000,at:new Date().toISOString()}]};assert.throws(()=>validate(overspend),/资金不足/);assert.throws(()=>validate({...base,selected:'nonexistent'}));assert.throws(()=>validate({...base,names:['','你']}));});
