import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createStore } from '../backend/store.mjs';
import { balance } from '../src/state.js';

test('较晚返回的同一笔重试不能清除下一笔请求，下一笔丢失响应后仍按原编号重试',async()=>{
  const globals=['fetch','window','document','localStorage'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]);
  const saved=new Map(),waiting=[];
  let rolls=0,cloud;
  const store=createStore(':memory:',{studyRoll:()=>{rolls++;return 1000;}}),token=randomBytes(32).toString('hex');
  const initial=store.create(token,{name:'甲',invite:randomBytes(32).toString('hex')});
  globalThis.localStorage={getItem:key=>saved.get(key)??null,setItem:(key,value)=>saved.set(key,value),removeItem:key=>saved.delete(key)};
  globalThis.window={addEventListener(){}};
  globalThis.document={hidden:false,addEventListener(){}};
  localStorage.setItem('together-home-session-v1',JSON.stringify({token,roomId:initial.roomId,slot:0,memberCount:1,cached:initial.state}));
  globalThis.fetch=async(url,options)=>{
    if(url.includes('cloud-config.json'))return {ok:true,json:async()=>({apiUrl:'http://localhost:4180'})};
    if(url.endsWith('/snapshot'))return {ok:true,json:async()=>store.snapshot(token)};
    assert.ok(url.endsWith('/action'));
    const body=JSON.parse(options.body),committed=store.action(token,body);
    return new Promise((resolve,reject)=>waiting.push({body,committed,resolve:()=>resolve({ok:true,json:async()=>committed}),reject}));
  };
  try{
    // Vite injects BASE_URL in the browser; use an equivalent value in this Node harness.
    const source=readFileSync(new URL('../src/cloud.js',import.meta.url),'utf8')
      .replace("from './state.js'",`from ${JSON.stringify(new URL('../src/state.js',import.meta.url).href)}`)
      .replaceAll('import.meta.env.BASE_URL',"'/'");
    const {createCloud}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
    cloud=createCloud({onSnapshot(){},onStatus(){}});await cloud.start();
    const a={type:'study',minutes:25,focus:50,note:'第一笔'},b={type:'study',minutes:30,focus:60,note:'下一笔'};
    const first=cloud.action(a),lateRetry=cloud.retry();
    await new Promise(resolve=>setImmediate(resolve)); // Retry refreshes the host address before replaying the saved request.
    assert.equal(waiting.length,2);assert.equal(waiting[0].body.requestId,waiting[1].body.requestId);
    waiting[0].resolve();await first;
    const second=cloud.action(b).then(()=>assert.fail('模拟丢失的响应应失败'),error=>error);
    const secondId=waiting[2].body.requestId;
    assert.equal(cloud.session.pending.requestId,secondId);
    waiting[1].resolve();await lateRetry;
    assert.equal(cloud.session.pending?.requestId,secondId,'旧响应不能清除下一笔待确认请求');
    assert.equal(JSON.parse(saved.get('together-home-session-v1')).pending?.requestId,secondId);
    waiting[2].reject(new TypeError('模拟下一笔响应丢失'));assert.match((await second).message,/未确认/);
    const secondRetry=cloud.action(b);
    assert.equal(waiting[3].body.requestId,secondId,'丢失响应后必须复用下一笔请求原编号');
    waiting[3].resolve();await secondRetry;
    assert.equal(cloud.session.pending,null);assert.equal(JSON.parse(saved.get('together-home-session-v1')).pending,null);
    assert.equal(rolls,2,'两次学习各抽取一次奖励，重试不能重新抽取');
    const final=store.snapshot(token).state;
    assert.equal(final.events.length,2);assert.equal(balance(final),waiting[2].committed.state.events.reduce((sum,event)=>sum+event.reward,0));
  }finally{
    cloud?.disconnect();
    for(const request of waiting)request.resolve();
    store.close();
    for(const [key,descriptor] of globals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
  }
});
