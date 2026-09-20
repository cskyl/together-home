import { validate } from './state.js';
export const SESSION_KEY='together-home-session-v1';
const secret=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
export function createCloud({onSnapshot,onStatus}) {
  let api='',session=null,timer,inflight=false,stopped=false,revision=-1,lastConfig=0;
  try{session=JSON.parse(localStorage.getItem(SESSION_KEY)||'null');if(session&&!/^[a-f0-9]{64}$/.test(session.token))session=null;}catch{session=null;}
  async function config(){const r=await fetch(`${import.meta.env.BASE_URL}cloud-config.json?t=${Math.floor(Date.now()/60000)}`,{cache:'no-store'});if(!r.ok)throw Error('无法读取联机配置。');const c=await r.json();if(c.apiUrl){const url=new URL(c.apiUrl);if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw Error('联机地址必须使用 HTTPS。');api=url.origin;}lastConfig=Date.now();return !!api;}
  async function request(path,body={},token=session?.token){if(!api)throw Error('联机服务还没有配置。');const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);try{const r=await fetch(api+'/v1/'+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body),signal:controller.signal});let data;try{data=await r.json();}catch{throw Error('主机暂时离线，请稍后重试。');}if(!r.ok){const e=Error(data.error||'同步失败，请稍后重试。');e.status=r.status;throw e;}return data;}catch(e){if(e.name==='AbortError'||e instanceof TypeError){onStatus('offline');throw Error('暂时连接不到主机；本次操作未确认，可在恢复后重试。');}throw e;}finally{clearTimeout(timeout);}}
  function save(){localStorage.setItem(SESSION_KEY,JSON.stringify(session));}
  function accept(data){validate(data.state);if(!session)return;if(data.roomId===session.roomId&&data.revision<revision)return;session.roomId=data.roomId;session.slot=data.slot;session.memberCount=data.memberCount;session.cached=data.state;save();if(data.revision!==revision){revision=data.revision;onSnapshot(data);}onStatus('connected',session);}
  async function poll(){if(!session||inflight||stopped)return;inflight=true;try{accept(await request('snapshot'));}catch(e){onStatus('offline',session);if(e.status===401)onStatus('invalid',session);if(Date.now()-lastConfig>60000)try{await config();}catch{}}finally{inflight=false;schedule();}}
  function schedule(){clearTimeout(timer);if(session&&!stopped)timer=setTimeout(poll,document.hidden?25000:4000);}
  async function attach(path,{name,invite,token}){const previous=session;const next={token:token||secret(),invite:path==='create'?(invite||secret()):null};
    // Persist the credential before the network request, so a lost response is recoverable.
    session=next;save();
    try{const data=await request(path,{name,invite:invite||next.invite},next.token);revision=-1;accept(data);schedule();return data;}catch(e){if(e.status){session=previous;save();}throw e;}}
  window.addEventListener('online',()=>{config().then(poll).catch(()=>onStatus('offline'));});document.addEventListener('visibilitychange',()=>{if(!document.hidden)config().then(poll).catch(()=>onStatus('offline'));});
  return {
    get session(){return session;},get configured(){return !!api;},
    async start(){await config();if(session){if(session.cached){validate(session.cached);onSnapshot({state:session.cached,slot:session.slot,roomId:session.roomId,memberCount:session.memberCount,cached:true});}await poll();}else onStatus(api?'available':'unconfigured');},
    async create(name){return attach('create',{name,token:session&&!session.roomId?session.token:undefined,invite:session&&!session.roomId?session.invite:undefined});},
    async join(name,invite){return attach('join',{name,invite,token:session&&!session.roomId?session.token:undefined});},
    async restore(token){const clean=token.trim().replace(/^TH1-/,'');if(!/^[a-f0-9]{64}$/.test(clean))throw Error('恢复码格式不正确。');const data=await request('snapshot',{},clean);session={token:clean};revision=-1;accept(data);schedule();return data;},
    async action(action){if(!session?.roomId)throw Error('先创建或加入一个房间。');const pending=session.pending;
      if(pending&&JSON.stringify(pending.action)!==JSON.stringify(action))throw Error('上一笔操作还未确认，请先重试上一笔操作或重新连接。');
      const body=pending||{requestId:crypto.randomUUID(),action};session.pending=body;save();
      try{const result=await request('action',body);session.pending=null;accept(result);schedule();return {...result,requestId:body.requestId};}catch(e){if(e.status){session.pending=null;save();}throw e;}},
    async retry(){if(session?.pending)return this.action(session.pending.action);await config();await poll();},
    async invitation(){if(!session?.roomId)throw Error('先创建一个房间。');if(session.memberCount>=2)throw Error('房间里已经有两个人了。');const invite=secret();await request('invite',{invite});session.invite=invite;save();return invite;},
    disconnect(){stopped=true;clearTimeout(timer);session=null;localStorage.removeItem(SESSION_KEY);},
  };
}
