import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {createStore} from '../backend/store.mjs';

const SESSION_KEY='together-home-session-v1';
const source=readFileSync(new URL('../src/cloud.js',import.meta.url),'utf8')
  .replace("from './state.js'",`from ${JSON.stringify(new URL('../src/state.js',import.meta.url).href)}`)
  .replaceAll('import.meta.env.BASE_URL',"'/'");
const {createCloud}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));

async function harness(run){
  const keys=['fetch','window','document','localStorage','setTimeout','clearTimeout'];
  const originals=keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]);
  const saved=new Map(),timers=new Map(),calls=[],snapshots=[],statuses=[];
  let timerId=0,rolls=0;
  const store=createStore(':memory:',{studyRoll:()=>{rolls++;return 500;}}),token=randomBytes(32).toString('hex');
  const initial=store.create(token,{name:'甲',invite:randomBytes(32).toString('hex')});
  globalThis.localStorage={getItem:key=>saved.get(key)??null,setItem:(key,value)=>saved.set(key,value),removeItem:key=>saved.delete(key)};
  localStorage.setItem(SESSION_KEY,JSON.stringify({token,roomId:initial.roomId,slot:0,memberCount:1,cached:initial.state}));
  globalThis.window={addEventListener(){}};
  globalThis.document={hidden:false,addEventListener(){}};
  globalThis.setTimeout=(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id;};
  globalThis.clearTimeout=id=>timers.delete(id);
  const h={api:'http://localhost:4180',configFetch:null,actionFetch:null,store,token,calls,snapshots,statuses,timers,saved,
    get rolls(){return rolls;},
    async tick(ms){const entry=[...timers].find(([,timer])=>timer.ms===ms);assert.ok(entry,`scheduled ${ms}ms timer`);timers.delete(entry[0]);await entry[1].fn();},
  };
  globalThis.fetch=async(url,options)=>{
    calls.push({url,body:options.body?JSON.parse(options.body):null});
    if(url.includes('cloud-config.json'))return h.configFetch?h.configFetch(url,options):{ok:true,json:async()=>({apiUrl:h.api})};
    if(url.endsWith('/snapshot'))return {ok:true,json:async()=>store.snapshot(token)};
    const body=JSON.parse(options.body);
    if(h.actionFetch)return h.actionFetch(url,body);
    return {ok:true,json:async()=>store.action(token,body)};
  };
  h.cloud=createCloud({onSnapshot:data=>snapshots.push(data),onStatus:status=>statuses.push(status)});
  try{await run(h);}finally{
    h.cloud.disconnect();store.close();
    for(const [key,descriptor]of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
  }
}

test('首次读取联机地址失败仍显示缓存，稍后自动重连且不改存档',()=>harness(async h=>{
  h.configFetch=async()=>{throw new TypeError('temporary offline');};
  await assert.rejects(h.cloud.start(),/联机地址/);
  assert.equal(h.snapshots.length,1);assert.equal(h.snapshots[0].cached,true);
  assert.deepEqual(h.snapshots[0].state,h.store.snapshot(h.token).state);
  assert.equal(h.statuses.at(-1),'offline');
  h.configFetch=null;h.api='http://localhost:4181';await h.tick(4000);
  assert.equal(h.statuses.at(-1),'connected');
  assert.equal(h.calls.at(-1).url,'http://localhost:4181/v1/snapshot');
  assert.equal(h.cloud.session.token,h.token);assert.equal(h.store.snapshot(h.token).state.events.length,0);
}));

test('读取联机地址超时有截止时间，之后仍能重试恢复',()=>harness(async h=>{
  h.configFetch=async(_url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true}));
  const started=h.cloud.start().then(()=>assert.fail('hung config should time out'),error=>error);
  await h.tick(12000);assert.match((await started).message,/联机地址/);
  assert.equal(h.snapshots[0].cached,true);h.configFetch=null;await h.tick(4000);
  assert.equal(h.statuses.at(-1),'connected');
}));

test('隧道换域名后手动重试刷新地址，并用同一编号重放已提交但响应丢失的操作',()=>harness(async h=>{
  await h.cloud.start();let committed;
  h.actionFetch=async(_url,body)=>{committed=h.store.action(h.token,body);throw new TypeError('response lost');};
  const action={type:'study',minutes:25,focus:73,note:'重启主机后重试'};
  await assert.rejects(h.cloud.action(action),/未确认/);
  const pending=structuredClone(h.cloud.session.pending);assert.equal(h.rolls,1);
  h.api='http://localhost:4199';h.actionFetch=null;h.calls.length=0;
  const result=await h.cloud.retry();
  assert.match(h.calls[0].url,/cloud-config\.json/);
  assert.equal(h.calls[1].url,'http://localhost:4199/v1/action');
  assert.deepEqual(h.calls[1].body,pending);assert.equal(result.requestId,pending.requestId);
  assert.deepEqual(result.state,committed.state);assert.equal(h.rolls,1);
  assert.equal(h.cloud.session.pending,null);assert.equal(h.store.snapshot(h.token).state.events.length,1);
}));

test('服务端暂时错误保留未确认编号，明确拒绝才清除',()=>harness(async h=>{
  await h.cloud.start();
  for(const status of [500,502,503,408,429]){
    h.actionFetch=async(_url,body)=>{h.store.action(h.token,body);return {ok:false,status,json:async()=>({error:'temporary failure'})};};
    await assert.rejects(h.cloud.action({type:'study',minutes:10,note:`status ${status}`}));
    const pending=structuredClone(h.cloud.session.pending);assert.ok(pending);
    assert.deepEqual(JSON.parse(h.saved.get(SESSION_KEY)).pending,pending);
    h.actionFetch=null;await h.cloud.retry();assert.equal(h.cloud.session.pending,null);
  }
  assert.equal(h.rolls,5);assert.equal(h.store.snapshot(h.token).state.events.length,5);
  h.actionFetch=async()=>({ok:false,status:400,json:async()=>({error:'invalid input'})});
  await assert.rejects(h.cloud.action({type:'study',minutes:999}),/invalid input/);
  assert.equal(h.cloud.session.pending,null);assert.equal(h.store.snapshot(h.token).state.events.length,5);
}));

test('刷新地址期间原操作已确认时，不为这笔旧操作创建新的请求编号',()=>harness(async h=>{
  await h.cloud.start();let deliver;
  h.actionFetch=async(_url,body)=>{const committed=h.store.action(h.token,body);return new Promise(resolve=>{deliver=()=>resolve({ok:true,json:async()=>committed});});};
  const first=h.cloud.action({type:'study',minutes:20,note:'已确认的原操作'});
  let finishConfig;h.configFetch=async()=>new Promise(resolve=>{finishConfig=()=>resolve({ok:true,json:async()=>({apiUrl:h.api})});});
  const retry=h.cloud.retry();deliver();await first;
  const next=h.cloud.action({type:'study',minutes:30,note:'下一笔'}),nextId=h.cloud.session.pending.requestId;
  finishConfig();await retry;
  assert.equal(h.cloud.session.pending.requestId,nextId);assert.equal(h.rolls,2);
  assert.equal(h.calls.filter(call=>call.url.endsWith('/action')).length,2);
  deliver();await next;assert.equal(h.store.snapshot(h.token).state.events.length,2);
}));
