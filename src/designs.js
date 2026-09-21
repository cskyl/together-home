// One design unit is 0.5 m. Geometry and validation are shared with the server.
import { DEFAULT_CUSTOM_BUDGET } from './construction.js';
export const GRID=48,MAX_ROOMS=20,MAX_DESIGNS=8;
export const roomTypes=[['living','客厅'],['bed','卧室'],['study','书房'],['cat','猫房'],['kitchen','厨房'],['dining','餐厅'],['bath','浴室'],['hall','走廊 / 玄关'],['garage','车库'],['utility','洗衣房'],['closet','储藏间']];
export const floors=[['oak','浅橡木','#c6ad87'],['walnut','深木色','#967453'],['tile','浅色瓷砖','#deded2'],['stone','水泥灰','#b8bfba'],['sage','鼠尾草绿','#a8b5a0'],['cream','奶油色','#e7dcc5']];
export const paints=[['white','暖白','#f1eee2'],['linen','亚麻','#d9cdb7'],['sage','浅绿','#b5c5ad'],['blue','灰蓝','#b4c4ce'],['clay','陶土','#d1aa94'],['rose','浅粉','#d4bcc0']];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const newDesignId=()=>`custom-${crypto.randomUUID()}`;
export const newRoom=(type='living',x=4,z=4,w=8,d=8)=>({id:'r-'+crypto.randomUUID(),name:roomTypes.find(t=>t[0]===type)?.[1]||'房间',type,x,z,w,d,floor:['bath','garage','utility'].includes(type)?'tile':'oak',paint:'white',furnished:type!=='cat'});
export const overlaps=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.z<b.z+b.d&&a.z+a.d>b.z;
export function roomError(room,rooms=[]){
  if(!['x','z','w','d'].every(k=>Number.isInteger(room[k]))||room.x<0||room.z<0||room.w<2||room.d<2||room.x+room.w>GRID||room.z+room.d>GRID)return '房间尺寸至少 1 米，位置要在 24 × 24 米画布内，按 0.5 米调整。';
  if(rooms.some(r=>r.id!==room.id&&overlaps(r,room)))return '房间重叠了，挪到空位或调整尺寸即可。';
  return '';
}
export function designWalls(rooms){
  const cells=new Map();
  function add(axis,fixed,start,end,side,room){for(let i=start;i<end;i++){const key=`${axis}:${fixed}:${i}`,s=cells.get(key)||{axis,fixed,start:i,end:i+1,positive:null,negative:null};s[side]=room.id;cells.set(key,s);}}
  for(const r of rooms){add('x',r.z,r.x,r.x+r.w,'positive',r);add('x',r.z+r.d,r.x,r.x+r.w,'negative',r);add('z',r.x,r.z,r.z+r.d,'negative',r);add('z',r.x+r.w,r.z,r.z+r.d,'positive',r);}
  const ordered=[...cells.values()].sort((a,b)=>a.axis.localeCompare(b.axis)||a.fixed-b.fixed||a.start-b.start),result=[];
  for(const s of ordered){const last=result.at(-1);if(last&&last.axis===s.axis&&last.fixed===s.fixed&&last.end===s.start&&last.positive===s.positive&&last.negative===s.negative)last.end=s.end;else result.push({...s});}
  return result.map(s=>({...s,exterior:!s.positive||!s.negative,a:s.axis==='x'?[s.start,s.fixed]:[s.fixed,s.start],b:s.axis==='x'?[s.end,s.fixed]:[s.fixed,s.end]}));
}
export function wallForOpening(o,walls){
  return walls.find(w=>w.axis===o.axis&&w.fixed===(o.axis==='x'?o.z:o.x)&&(o.axis==='x'?o.x:o.z)-o.width/2>=w.start+.25&&(o.axis==='x'?o.x:o.z)+o.width/2<=w.end-.25);
}
export function validOpenings(rooms,openings){const walls=designWalls(rooms);return openings.filter(o=>wallForOpening(o,walls));}
export function validateDesign(d,{empty=false,saved=false}={}){
  if(!d||typeof d.id!=='string'||!/^custom-[a-f0-9-]{36}$/.test(d.id)||typeof d.name!=='string'||!d.name.trim()||d.name.length>30||!Array.isArray(d.rooms)||d.rooms.length>MAX_ROOMS||(!empty&&!d.rooms.length)||!Array.isArray(d.openings)||d.openings.length>80)throw Error('户型格式不正确：需要名称和 1–20 个房间。');
  if(saved&&(!Number.isSafeInteger(d.version)||d.version<1))throw Error('户型版本无效。');
  if(d.budget!==undefined&&(!Number.isSafeInteger(d.budget)||d.budget<1000||d.budget>100000000))throw Error('房子总预算需要是 1,000–100,000,000 之间的整数。');
  const ids=new Set();
  for(const r of d.rooms){
    if(!r||typeof r.id!=='string'||!/^r-[a-f0-9-]{36}$/.test(r.id)||ids.has(r.id)||typeof r.name!=='string'||!r.name.trim()||r.name.length>24||!roomTypes.some(t=>t[0]===r.type)||!floors.some(f=>f[0]===r.floor)||!paints.some(p=>p[0]===r.paint)||typeof r.furnished!=='boolean')throw Error('房间名称、类型或装修选项无效。');
    ids.add(r.id);const message=roomError(r,d.rooms);if(message)throw Error(message);
  }
  const walls=designWalls(d.rooms),openIds=new Set();
  for(const o of d.openings){
    if(!o||typeof o.id!=='string'||!/^o-[a-f0-9-]{36}$/.test(o.id)||openIds.has(o.id)||!['door','window','opening'].includes(o.kind)||!['x','z'].includes(o.axis)||!Number.isInteger(o.x*2)||!Number.isInteger(o.z*2)||!Number.isInteger(o.width)||o.width<1||o.width>8||!wallForOpening(o,walls))throw Error('门窗要放在完整的墙段内，不能超出墙角。');
    openIds.add(o.id);
    if(d.openings.some(b=>b!==o&&b.axis===o.axis&&(o.axis==='x'?b.z===o.z:b.x===o.x)&&Math.abs((o.axis==='x'?b.x:b.z)-(o.axis==='x'?o.x:o.z))<(o.width+b.width)/2+.25))throw Error('门窗之间需要留一点距离，不能重叠。');
  }
  return d;
}
export function normalizeDesign(d){
  validateDesign(d);
  return {id:d.id,name:d.name.trim(),budget:d.budget??DEFAULT_CUSTOM_BUDGET,rooms:d.rooms.map(r=>({id:r.id,name:r.name.trim(),type:r.type,x:r.x,z:r.z,w:r.w,d:r.d,floor:r.floor,paint:r.paint,furnished:r.furnished})),openings:d.openings.map(o=>({id:o.id,kind:o.kind,axis:o.axis,x:o.x,z:o.z,width:o.width}))};
}
export function designToPlan(d){
  const bounds=[Math.min(...d.rooms.map(r=>r.x)),Math.min(...d.rooms.map(r=>r.z)),Math.max(...d.rooms.map(r=>r.x+r.w)),Math.max(...d.rooms.map(r=>r.z+r.d))];
  const areaM2=d.rooms.reduce((n,r)=>n+r.w*r.d/4,0),wallSegments=designWalls(d.rooms),g=d.rooms.find(r=>r.type==='garage');
  return {id:d.id,name:d.name,custom:true,version:d.version||0,title:'自己画的，随时可以调整',description:`${d.rooms.length} 个房间 · ${areaM2.toLocaleString('zh-CN')} m² · 墙色、地板和家具由你们选择。`,tag:'自定义 · 单层',area:Math.round(areaM2*10.7639).toLocaleString('en-US'),areaM2,beds:String(d.rooms.filter(r=>r.type==='bed').length),baths:String(d.rooms.filter(r=>r.type==='bath').length),width:(bounds[2]-bounds[0])*.5,depth:(bounds[3]-bounds[1])*.5,bounds,rooms:d.rooms,wallSegments,openings:d.openings,
    outline:[[bounds[0],bounds[1]],[bounds[2],bounds[1]],[bounds[2],bounds[3]],[bounds[0],bounds[3]]],outlines:d.rooms.map(r=>[[r.x,r.z],[r.x+r.w,r.z],[r.x+r.w,r.z+r.d],[r.x,r.z+r.d]]),walls:wallSegments.map(w=>[...w.a,...w.b]),porch:null,garage:g?[g.x,g.z,g.w,g.d]:null,windows:[],doors:[],source:null,price:null,budget:d.budget??DEFAULT_CUSTOM_BUDGET};
}
export function planSVG(d){
  const p=designToPlan(d),b=p.bounds,w=b[2]-b[0]+3,h=b[3]-b[1]+3;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b[0]-1.5} ${b[1]-1.5} ${w} ${h}"><rect x="${b[0]-1.5}" y="${b[1]-1.5}" width="${w}" height="${h}" fill="#f7f7ec"/>${d.rooms.map(r=>`<rect x="${r.x}" y="${r.z}" width="${r.w}" height="${r.d}" fill="${floors.find(f=>f[0]===r.floor)[2]}" opacity=".64"/><text x="${r.x+r.w/2}" y="${r.z+r.d/2}" text-anchor="middle" dominant-baseline="middle" font-size="${Math.min(.95,r.w/Math.max(3,r.name.length)*.85)}" fill="#455d46" font-family="sans-serif">${esc(r.name)}</text>`).join('')}${p.wallSegments.map(w=>`<path d="M${w.a.join(' ')}L${w.b.join(' ')}" stroke="#61725b" stroke-width=".22"/>`).join('')}${d.openings.map(o=>{const x=o.x-(o.axis==='x'?o.width/2:0),z=o.z-(o.axis==='z'?o.width/2:0);return `<path d="M${x} ${z}l${o.axis==='x'?o.width:0} ${o.axis==='z'?o.width:0}" stroke="${o.kind==='window'?'#93bbc4':'#faf8e9'}" stroke-width=".38"/>`;}).join('')}</svg>`;
}
export const planImage=d=>'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(planSVG(d));
export function designTemplate(kind='blank'){
  const d={id:newDesignId(),name:kind==='cozy'?'我的单层小屋':kind==='studio'?'我的小公寓':kind==='cat-home'?'带猫房的小屋':'新户型',rooms:[],openings:[]};
  const add=(type,name,x,z,w,depth)=>{const r=newRoom(type,x,z,w,depth);r.name=name;d.rooms.push(r);};
  const opening=(kind,axis,x,z,width=2)=>d.openings.push({id:'o-'+crypto.randomUUID(),kind,axis,x,z,width});
  if(kind==='cozy'){
    add('bed','主卧',4,4,8,8);add('bed','次卧',12,4,8,8);add('study','书房',20,4,8,8);add('hall','走廊',4,12,24,4);
    add('living','客厅',4,16,12,8);add('kitchen','厨房',16,16,6,8);add('bath','浴室',22,16,6,8);add('garage','车库',4,24,12,12);add('hall','玄关',16,24,12,4);
    for(const x of [8,16,24]){opening('door','x',x,12);opening('window','x',x,4,3);}
    opening('opening','x',10,16,4);opening('door','x',19,16);opening('door','x',25,16);opening('door','x',19,24);opening('door','x',23,28);opening('door','z',16,26);opening('door','x',10,36,8);opening('window','z',4,20,4);
  }else if(kind==='cat-home'){
    add('living','客厅 / 餐厅',8,8,24,8);add('bed','卧室',8,16,8,8);add('bath','浴室',16,16,4,8);add('kitchen','厨房',20,16,6,8);add('cat','猫房',26,16,6,8);
    d.rooms.at(-1).paint='sage';
    opening('door','x',20,8);opening('window','x',13,8,4);opening('window','x',27,8,4);
    opening('door','x',12,16);opening('door','x',18,16);opening('opening','x',23,16,4);opening('door','x',29,16);
    opening('window','x',12,24,3);opening('window','x',29,24,3);opening('window','z',32,20,3);
  }else if(kind==='studio'){
    add('living','客厅 / 工作区',8,8,16,8);add('bed','卧室',8,16,8,8);add('bath','浴室',16,16,4,8);add('kitchen','厨房',20,16,4,8);
    opening('door','x',16,8);opening('window','z',8,12,4);opening('door','x',12,16);opening('door','x',18,16);opening('opening','x',22,16,2);opening('window','x',12,24,3);
  }
  return d;
}
