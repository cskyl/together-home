import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {ledgerEntries} from '../src/ledger.js';
import {freshState,study,purchase,build,balance,undoStudy,validate} from '../src/state.js';

test('账本按保存顺序汇总全部收入和支出，每笔余额保留上下文而不是筛选后重算',()=>{
  let state={...freshState(),events:[{id:'legacy-study',type:'study',person:0,minutes:100,note:'old',at:'2026-09-02T12:00:00Z'},{id:'legacy-build',type:'build',plan:'riverside',amount:500,at:'2026-09-02T12:00:00Z'}]};
  state=study(state,{person:1,minutes:25,focus:0},{id:randomUUID(),roll:()=>0});state.events.at(-1).at='2026-09-01T12:00:00Z';state=purchase(state,{item:'decor-plant',person:1});state=build(state,{person:0});validate(state);
  const before=structuredClone(state),entries=ledgerEntries(state);assert.deepEqual(entries.map(e=>e.event.id),state.events.map(e=>e.id));assert.deepEqual(entries.map(e=>e.amount),[1000,500,200,30,670]);assert.deepEqual(entries.map(e=>e.running),[1000,500,700,670,0]);assert.deepEqual(entries.map(e=>e.incoming),[true,false,true,false,false]);assert.equal(entries.at(-1).running,balance(state));
  const purchases=entries.filter(e=>e.event.type==='purchase');assert.equal(purchases[0].running,670);assert.deepEqual(state,before);assert.equal(ledgerEntries(freshState()).length,0);
});

test('账本保留超过最近20笔的流水，撤销学习后余额和收入与存档一致',()=>{
  let state=freshState();for(let i=0;i<40;i++)state=study(state,{person:i%2,minutes:1,focus:50},{roll:()=>500});
  let entries=ledgerEntries(state);assert.equal(entries.length,40);assert.equal(entries.at(-1).running,400);state=undoStudy(state);entries=ledgerEntries(state);assert.equal(entries.length,39);assert.equal(entries.at(-1).running,390);assert.equal(entries.reduce((sum,e)=>sum+(e.incoming?e.amount:-e.amount),0),balance(state));
});
