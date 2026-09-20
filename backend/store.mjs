import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { freshState, validate, balance, study, build } from '../src/state.js';
import { plans } from '../src/plans.js';

export class ApiError extends Error { constructor(message,status=400){super(message);this.status=status;} }
const hash=s=>createHash('sha256').update(s).digest('hex');
const key=s=>{if(typeof s!=='string'||!/^[a-f0-9]{64}$/.test(s))throw new ApiError('访问凭证不正确。',401);return hash(s);};
const name=s=>{if(typeof s!=='string'||!s.trim()||s.trim().length>16)throw new ApiError('称呼需要 1–16 个字。');return s.trim();};

export function createStore(path=':memory:') {
  const db=new DatabaseSync(path);db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY,state TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,invite_hash TEXT UNIQUE,invite_expires INTEGER,created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS members (key_hash TEXT PRIMARY KEY,room_id TEXT NOT NULL REFERENCES rooms(id),slot INTEGER NOT NULL CHECK(slot IN(0,1)), UNIQUE(room_id,slot));
    CREATE TABLE IF NOT EXISTS operations (room_id TEXT NOT NULL REFERENCES rooms(id),request_id TEXT NOT NULL,member_hash TEXT NOT NULL,fingerprint TEXT NOT NULL,PRIMARY KEY(room_id,request_id));`);
  const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}};
  const member=token=>{const m=db.prepare('SELECT * FROM members WHERE key_hash=?').get(key(token));if(!m)throw new ApiError('凭证无效，请使用自己的恢复码重新连接。',401);return m;};
  const snapshotBy=m=>{const room=db.prepare('SELECT * FROM rooms WHERE id=?').get(m.room_id);return {roomId:room.id,slot:m.slot,revision:room.revision,state:JSON.parse(room.state),memberCount:db.prepare('SELECT count(*) AS n FROM members WHERE room_id=?').get(m.room_id).n};};
  return {
    db,
    close(){db.close();},
    snapshot(token){return snapshotBy(member(token));},
    create(token,{name:label,invite}){const kh=key(token),ih=key(invite),labelValue=name(label);return transaction(()=>{const existing=db.prepare('SELECT * FROM members WHERE key_hash=?').get(kh);if(existing)return snapshotBy(existing);
      const recent=db.prepare('SELECT count(*) AS n FROM rooms WHERE created_at > ?').get(Date.now()-86400000).n;
      if(recent>=100)throw new ApiError('今天创建的房间较多，请稍后再试。',429);
      const id=randomUUID(),state={...freshState(),names:[labelValue,'等待你加入']};
      db.prepare('INSERT INTO rooms(id,state,invite_hash,invite_expires,created_at) VALUES(?,?,?,?,?)').run(id,JSON.stringify(state),ih,Date.now()+7*86400000,Date.now());
      db.prepare('INSERT INTO members(key_hash,room_id,slot) VALUES(?,?,0)').run(kh,id);return snapshotBy({room_id:id,slot:0});});},
    join(token,{name:label,invite}){const kh=key(token),ih=key(invite),labelValue=name(label);return transaction(()=>{const existing=db.prepare('SELECT * FROM members WHERE key_hash=?').get(kh);if(existing)return snapshotBy(existing);
      const room=db.prepare('SELECT * FROM rooms WHERE invite_hash=? AND invite_expires>?').get(ih,Date.now());if(!room)throw new ApiError('邀请已使用、已过期或不正确，请让对方重新邀请。',403);
      if(db.prepare('SELECT count(*) AS n FROM members WHERE room_id=?').get(room.id).n>=2)throw new ApiError('这个家已有两位成员。',409);
      const state=JSON.parse(room.state);state.names[1]=labelValue;validate(state);
      db.prepare('INSERT INTO members(key_hash,room_id,slot) VALUES(?,?,1)').run(kh,room.id);
      db.prepare('UPDATE rooms SET state=?, revision=revision+1,invite_hash=NULL,invite_expires=NULL WHERE id=?').run(JSON.stringify(state),room.id);return snapshotBy({room_id:room.id,slot:1});});},
    invite(token,{invite}){const ih=key(invite);return transaction(()=>{const m=member(token);if(m.slot!==0)throw new ApiError('只有创建者可以邀请。',403);if(snapshotBy(m).memberCount>=2)throw new ApiError('两位成员已经到齐，无需再次邀请。',409);db.prepare('UPDATE rooms SET invite_hash=?,invite_expires=? WHERE id=?').run(ih,Date.now()+7*86400000,m.room_id);return snapshotBy(m);});},
    action(token,{requestId,action}){if(typeof requestId!=='string'||!/^[0-9a-f-]{36}$/.test(requestId)||!action||typeof action!=='object')throw new ApiError('操作格式不正确。');return transaction(()=>{const m=member(token),before=snapshotBy(m),fp=hash(JSON.stringify(action));const previous=db.prepare('SELECT * FROM operations WHERE room_id=? AND request_id=?').get(m.room_id,requestId);if(previous){if(previous.member_hash!==m.key_hash||previous.fingerprint!==fp)throw new ApiError('操作编号已被使用，请重试。',409);return before;}
      let state=before.state;if(state.events.length>=50000&&action.type==='study')throw new ApiError('记录已达到容量上限，请先导出备份。');
      if(action.type==='study'){state=study(state,{person:m.slot,minutes:action.minutes,note:action.note??''});state.events.at(-1).id=requestId;}
      else if(action.type==='build'){if(!plans.some(p=>p.id===action.plan))throw new ApiError('请选择一个有效户型。');state=build({...state,selected:action.plan});state.events.at(-1).id=requestId;}
      else if(action.type==='select'){if(!plans.some(p=>p.id===action.plan))throw new ApiError('请选择一个有效户型。');state={...state,selected:action.plan};}
      else if(action.type==='rename'){state={...state,names:state.names.map((n,i)=>i===m.slot?name(action.name):n)};}
      else if(action.type==='undo'){const event=state.events.findLast(e=>e.type==='study'&&e.person===m.slot);if(!event)throw new ApiError('你还没有可以撤销的学习记录。');if(balance(state)<event.minutes*10)throw new ApiError('这次学习的资金已投入建设，无法撤销。');state={...state,events:state.events.filter(e=>e.id!==event.id)};try{validate(state);}catch{throw new ApiError('这次学习的资金已用于之前的建设，无法撤销。');}}
      else throw new ApiError('不支持的操作。');
      validate(state);db.prepare('UPDATE rooms SET state=?,revision=revision+1 WHERE id=?').run(JSON.stringify(state),m.room_id);
      db.prepare('INSERT INTO operations(room_id,request_id,member_hash,fingerprint) VALUES(?,?,?,?)').run(m.room_id,requestId,m.key_hash,fp);return snapshotBy(m);});}
  };
}
