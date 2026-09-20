import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {plans,getPlan} from '../src/plans.js';
import {constructionTotal,constructionPhases,constructionProgress,constructionVisualProgress,progressLabel} from '../src/construction.js';
import {freshState,study,build,balance,invested,validate,saveDesign} from '../src/state.js';
import {designTemplate,validateDesign,designToPlan} from '../src/designs.js';
import {createStore} from '../backend/store.mjs';

function funded(amount){let state=freshState();for(let remaining=amount;remaining>0;){const minutes=Math.min(480,Math.ceil(remaining/10));state=study(state,{person:0,minutes},{roll:()=>500});remaining-=minutes*10;}return state;}
const secret=()=>randomBytes(32).toString('hex');
const act=(store,token,action,requestId=randomUUID())=>store.action(token,{requestId,action});
function pair(store){const a=secret(),b=secret(),invite=secret();store.create(a,{name:'甲',invite});store.join(b,{name:'乙',invite});return {a,b};}

test('六套房的20步施工总额分别等于官方价格，零头预算也逐元对齐',()=>{
  const ids=constructionPhases(plans[0]).map(p=>p.id);
  for(const plan of [...plans,{budget:1003},{budget:1000},{budget:99999999},{budget:100000000}]){
    const total=constructionTotal(plan),phases=constructionPhases(plan);
    assert.equal(total,plan.price?.amount??plan.budget);assert.equal(phases.length,20);assert.equal(new Set(ids).size,20);assert.deepEqual(phases.map(p=>p.id),ids);
    assert.equal(phases.reduce((sum,p)=>sum+p.cost,0),total);assert.equal(phases[0].start,0);assert.equal(phases.at(-1).end,total);
    for(let i=0;i<phases.length;i++){assert.ok(Number.isInteger(phases[i].cost)&&phases[i].cost>0);if(i)assert.equal(phases[i].start,phases[i-1].end);}
  }
  assert.equal(constructionPhases(plans[0])[0].cost,9138);assert.equal(constructionPhases({budget:1003}).at(-1).cost,10);
  assert.equal(constructionTotal({}),450000);assert.equal(constructionTotal({price:{amount:456900},budget:1000}),456900);
});

test('每次只推进当前步骤，最终投入封顶到本户型总价并保留余款',()=>{
  for(const plan of plans){let state={...funded(constructionTotal(plan)+900),selected:plan.id};const initialFunds=balance(state),phases=constructionPhases(plan);
    for(const phase of phases){state=build(state,{person:1});const event=state.events.at(-1);assert.equal(event.stage,phase.id);assert.equal(event.amount,phase.cost);assert.equal(event.person,1);validate(state);}
    assert.equal(invested(state),constructionTotal(plan));assert.equal(balance(state),initialFunds-constructionTotal(plan));assert.equal(constructionProgress(invested(state),plan).filter(p=>p.ratio===1).length,20);assert.throws(()=>build(state),/全部建成/);
  }
  let state=build(funded(250),{person:0});assert.equal(state.events.at(-1).amount,250);assert.equal(state.events.at(-1).stage,constructionPhases(plans[0])[0].id);assert.equal(balance(state),0);assert.throws(()=>build(state),/先记录/);
});

test('旧500元施工记录不迁移，百分比按新总价显示，小额施工不会显示0或提前100%',()=>{
  const old={...freshState(),events:[{id:'old-study',type:'study',person:0,minutes:100,note:'原记录',at:'2026-09-01T12:00:00Z'},{id:'old-build',type:'build',plan:'riverside',amount:500,at:'2026-09-01T12:01:00Z'}]},copy=structuredClone(old);
  assert.deepEqual(validate(old),copy);assert.equal(balance(old),500);assert.equal(invested(old),500);assert.equal(progressLabel(500,456900),'0.1%');
  assert.equal(progressLabel(0,456900),'0%');assert.equal(progressLabel(1,456900),'<0.1%');assert.equal(progressLabel(456899,456900),'99.9%');assert.equal(progressLabel(456900,456900),'100%');
  assert.equal(constructionProgress(500,plans[0])[0].paid,500);assert.equal(constructionProgress(500,plans[0])[0].ratio,500/9138);assert.deepEqual(old,copy);
  for(const amount of [0,500,456899,456900]){const groups=constructionVisualProgress(amount,plans[0]);assert.equal(groups.length,5);assert.ok(groups.every(g=>g.ratio>=0&&g.ratio<=1));assert.equal(groups.reduce((n,g)=>n+g.paid,0),amount);}
});

test('导入按各自户型总价检查，拒绝超预算和伪造的施工成员或步骤',()=>{
  const plan=plans[0],funds=funded(constructionTotal(plan)+100),entry={id:randomUUID(),type:'build',plan:plan.id,amount:constructionTotal(plan),at:new Date().toISOString()};
  assert.doesNotThrow(()=>validate({...funds,events:[...funds.events,entry]}));
  for(const patch of [{amount:constructionTotal(plan)+1},{stage:'made-up'},{person:2},{person:'0'}])assert.throws(()=>validate({...funds,events:[...funds.events,{...entry,...patch}]}));
  const cheap=plans.find(p=>p.price.amount<plan.price.amount);assert.throws(()=>validate({...funds,events:[...funds.events,{...entry,plan:cheap.id}]}),/总价/);
  assert.throws(()=>build(funds,{person:2}),/成员/);
});

test('自定义预算默认45万，可调整但不能低于已投入金额，装修不改变原流水',()=>{
  const design=designTemplate('studio');assert.equal(constructionTotal(designToPlan(design)),450000);
  for(const budget of [999,100000001,1000.5,NaN,'25000'])assert.throws(()=>validateDesign({...design,budget}));
  for(const budget of [1000,100000000])assert.doesNotThrow(()=>validateDesign({...design,budget}));
  let state=saveDesign(funded(4800),{design:{...design,budget:100000},expectedVersion:0});state=build(state,{person:0});assert.equal(invested(state),2000);const before=structuredClone(state);
  assert.throws(()=>saveDesign(state,{design:{...state.customPlans[0],budget:1999},expectedVersion:1}),/不能低于/);
  const larger=saveDesign(state,{design:{...state.customPlans[0],budget:200000},expectedVersion:1});assert.equal(constructionTotal(getPlan(state.selected,larger)),200000);assert.deepEqual(larger.events,before.events);assert.equal(balance(larger),balance(before));assert.equal(invested(larger),2000);
  const equal=saveDesign(larger,{design:{...larger.customPlans[0],budget:2000},expectedVersion:2});assert.equal(progressLabel(invested(equal),2000),'100%');assert.throws(()=>build(equal),/全部建成/);assert.deepEqual(state,before);
});

test('后端确定施工成员和步骤，忽略伪造金额，重试和修改预算不重复扣款',()=>{
  const store=createStore(':memory:',{studyRoll:()=>500});try{const {a,b}=pair(store);for(let i=0;i<3;i++)act(store,a,{type:'study',minutes:480});
    const requestId=randomUUID(),action={type:'build',plan:'riverside',person:1,amount:1,stage:'inspection-clean'},first=act(store,a,action,requestId),event=first.state.events.at(-1);assert.equal(event.amount,9138);assert.equal(event.person,0);assert.equal(event.stage,'survey-permits');
    act(store,b,{type:'study',minutes:25});const retried=act(store,a,action,requestId);assert.equal(retried.state.events.filter(e=>e.id===requestId).length,1);assert.deepEqual(retried.state.events.find(e=>e.id===requestId),event);assert.equal(balance(retried.state),5512);
    const design={...designTemplate('studio'),budget:100000};act(store,b,{type:'design',design,expectedVersion:0});act(store,b,{type:'build',plan:design.id,person:0,stage:'inspection-clean',amount:999999});const before=store.snapshot(a);assert.equal(before.state.events.at(-1).person,1);assert.equal(before.state.events.at(-1).amount,2000);
    assert.throws(()=>act(store,a,{type:'design',design:{...before.state.customPlans[0],budget:1999},expectedVersion:1}),/不能低于/);assert.deepEqual(store.snapshot(a),before);
  }finally{store.close();}
});
