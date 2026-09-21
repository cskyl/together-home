import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { constructionTotal,constructionProgress,constructionVisualProgress } from './construction.js';
import { getItem } from './items.js';
import { floors,paints,wallForOpening } from './designs.js';
import { createItemModel } from './item-mesh.js';

export function createScene(host, onSelect, onSelectItem=()=>{}) {
  const scene = new T.Scene(); scene.background = new T.Color('#e8ede6');
  const camera = new T.PerspectiveCamera(38,1,.1,180);
  let renderer;
  try { renderer = new T.WebGLRenderer({antialias:true,alpha:false}); }
  catch { host.innerHTML='<div class="webgl-error">此浏览器暂时无法显示 3D。请开启硬件加速，或用支持 WebGL 的 Chrome / Safari 打开；仍可在户型卡片查看原始平面图。</div>';return {update(){},home(){},zoom(){},top(){},select(){},dispose(){host.replaceChildren();}}; }
  renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
  renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;
  host.appendChild(renderer.domElement);renderer.domElement.setAttribute('aria-label','房屋 3D 模型，拖动旋转，滚轮或双指缩放');
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.08;controls.maxPolarAngle=Math.PI*.48;controls.minDistance=1.5;controls.maxDistance=58;controls.target.set(0,.5,0);
  scene.add(new T.HemisphereLight(0xfff9eb,0x869881,1.8));
  const sun=new T.DirectionalLight(0xfff2d5,3.2);sun.position.set(-12,22,12);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-23,right:23,top:23,bottom:-23,near:1,far:70});sun.shadow.normalBias=.04;sun.shadow.bias=-.0002;scene.add(sun);
  const fill=new T.DirectionalLight(0xc8ddf0,.9);fill.position.set(12,8,-10);scene.add(fill);
  const materials=new Map();
  function mat(color){if(!materials.has(color))materials.set(color,new T.MeshStandardMaterial({color,roughness:.82}));return materials.get(color);}
  const textures=[];
  function floorMat(tile=false){const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d');ctx.fillStyle=tile?'#d7d5cc':'#b99a76';ctx.fillRect(0,0,256,256);
    for(let i=0;i<8;i++){const y=i*32;ctx.fillStyle=tile?'#eeeae0':(i%3===0?'#c5a987':'#bda17f');ctx.fillRect(0,y,256,31);ctx.fillStyle=tile?'#c7c6bf':'#a58c6d';ctx.fillRect((i%3)*83,y,1,32);if(!tile){for(let j=0;j<8;j++){ctx.strokeStyle=`rgba(88,61,34,${.025+j*.002})`;ctx.beginPath();ctx.moveTo(0,y+j*4);ctx.lineTo(256,y+j*4+1);ctx.stroke();}}}
    const tex=new T.CanvasTexture(c);tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.repeat.set(2,2);tex.colorSpace=T.SRGBColorSpace;textures.push(tex);return new T.MeshStandardMaterial({map:tex,roughness:.82});}
  const wood=floorMat(),tile=floorMat(true);
  let root=new T.Group();scene.add(root);let pickables=[],labels=[],plan,options,selection,highlight,center=[0,0],scale=1,ground;
  const labelsHost=document.createElement('div');labelsHost.className='room-labels';host.appendChild(labelsHost);
  function box(g,x,y,z,w,h,d,color,room){const obj=new T.Mesh(new T.BoxGeometry(w,h,d),typeof color==='string'?mat(color):color);obj.position.set(x,y,z);obj.castShadow=true;obj.receiveShadow=true;g.add(obj);if(room){obj.userData.room=room;pickables.push(obj);}return obj;}
  const X=x=>(x-center[0])*scale,Z=z=>(z-center[1])*scale;
  function rect(g,x,z,w,d,y,h,color,room){return box(g,X(x+w/2),y,Z(z+d/2),w*scale,h,d*scale,color,room);}
  function line(g,points,color='#aeb9ad'){const geo=new T.BufferGeometry().setFromPoints(points.map(([x,z])=>new T.Vector3(X(x),.025,Z(z))));g.add(new T.Line(geo,new T.LineBasicMaterial({color})));}
  function shapeFloor(outline,y,depth,color){const shape=new T.Shape();outline.forEach(([x,z],i)=>i?shape.lineTo(X(x),-Z(z)):shape.moveTo(X(x),-Z(z)));shape.closePath();const obj=new T.Mesh(new T.ExtrudeGeometry(shape,{depth,bevelEnabled:false}),mat(color));obj.rotation.x=-Math.PI/2;obj.position.y=y;obj.receiveShadow=true;obj.castShadow=true;root.add(obj);return obj;}
  function wall(a,b,height,color,holes=[]){const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz)*scale;const group=new T.Group();group.position.set(X(a[0]),.22,Z(a[1]));group.rotation.y=-Math.atan2(dz,dx);
    function segment(l,r,low,high,c=color){if(r-l>.01&&high-low>.01)box(group,(l+r)/2,(low+high)/2,0,r-l,high-low,.15,c);}
    let cursor=0;for(const h of holes.sort((a,b)=>a.t-b.t)){const l=Math.max(cursor,h.t-h.w/2),r=Math.min(len,h.t+h.w/2);segment(cursor,l,0,height);segment(l,r,0,Math.min(h.bottom,height));segment(l,r,Math.min(h.top,height),height);if(height>h.bottom&&h.type==='window'&&h.installed!==false){const top=Math.min(height,h.top);const glass=new T.MeshStandardMaterial({color:'#bbd2d0',transparent:true,opacity:.48,roughness:.12,metalness:.15});box(group,(l+r)/2,(h.bottom+top)/2,0,r-l,top-h.bottom,.04,glass);for(const v of [l,r,(l+r)/2])box(group,v,(h.bottom+top)/2,0,.035,top-h.bottom,.18,'#f7f4ec');for(const v of [h.bottom,top])box(group,(l+r)/2,v,0,r-l,.035,.18,'#f7f4ec');}if(h.type==='door'&&height>1.6&&h.installed!==false)box(group,(l+r)/2,1.0,0,r-l,2,.06,'#5a6b59');if(h.type==='garage'&&height>1.6&&h.installed!==false){box(group,(l+r)/2,1.03,0,r-l,2.06,.08,'#d0cbbd');for(let i=1;i<7;i++)box(group,(l+r)/2,i*.29,.05,r-l,.015,.012,'#aba99e');}cursor=r;}segment(cursor,len,0,height);root.add(group);}
  function furnish(r){const g=new T.Group();g.position.set(X(r.x+r.w/2),.25,Z(r.z+r.d/2));root.add(g);const w=r.w*scale,d=r.d*scale;const b=(x,y,z,ww,hh,dd,c)=>box(g,x,y,z,ww,hh,dd,c,r.id);
    if(r.type==='bed'){const bw=Math.min(1.7,w*.65),bd=Math.min(2.1,d*.68);b(0,.22,0,bw,.35,bd,'#9d7b57');b(0,.45,0,bw,.24,bd,'#f4f0e7');b(0,.6,.3,bw+.03,.12,bd*.58,'#a1ada0');b(0,.65,-bd/2,bw+.1,1,.09,'#ad9274');for(const x of [-bw*.25,bw*.25])b(x,.62,-bd*.3,bw*.42,.18,.43,'#fcf9f0');for(const x of [-bw*.7,bw*.7])b(x,.29,-bd*.3,.35,.5,.4,'#a68e70');}
    if(r.type==='living'){b(0,.012,.3,w*.74,.024,d*.67,'#e7dfcd');const sw=Math.min(w*.75,2.5);b(0,.32,-d*.23,sw,.5,.85,'#c1b9a4');b(0,.66,-d*.23-.33,sw,.7,.19,'#b6ae9a');for(const x of [-sw/2+.08,sw/2-.08])b(x,.53,-d*.23,.18,.7,.9,'#b6ae9a');for(const x of [-sw*.28,0,sw*.28])b(x,.6,-d*.23,sw*.29,.18,.58,'#d9d1bf');b(0,.27,.6,1.05,.09,.62,'#9d7752');b(0,.14,.6,.62,.22,.35,'#745941');b(-w*.34,.8,d*.28,.1,1.6,.1,'#55594c');b(-w*.34,1.54,d*.28,.48,.32,.48,'#e9ddbb');b(0,.4,d*.41,Math.min(w*.7,2.1),.65,.36,'#9a7856');b(0,.95,d*.41,1.25,.8,.04,'#364239');}
    if(r.type==='kitchen'){b(w*.33,.47,0,.64,.94,d*.82,'#a4aa98');b(w*.33,.97,0,.71,.065,d*.85,'#ece9df');b(0,.47,d*.32,w*.75,.94,.65,'#a4aa98');b(0,.97,d*.32,w*.78,.065,.7,'#eeece4');if(w>2.7){b(-w*.12,.49,-d*.08,.83,.97,Math.min(d*.55,1.7),'#927354');b(-w*.12,1,-d*.08,.96,.065,Math.min(d*.55,1.7)+.15,'#f2eee5');}b(w*.32,1.02,-d*.2,.47,.055,.57,'#566662');b(w*.29,1.12,-d*.34,.035,.25,.04,'#aaa99e');}
    if(r.type==='dining'){const tw=Math.min(w*.72,1.5),td=Math.min(d*.5,.85);b(0,.76,0,tw,.08,td,'#a68860');for(const x of [-tw*.35,tw*.35]){for(const z of [-td*.32,td*.32])b(x,.37,z,.07,.74,.07,'#816c50');for(const z of [-td*.9,td*.9]){b(x,.42,z,.42,.08,.4,'#b9ad92');b(x,.7,z+Math.sign(z)*.16,.42,.6,.07,'#9c8868');}}}
    if(r.type==='study'){b(0,.74,-d*.25,w*.77,.08,.65,'#bb9d76');for(const x of [-w*.3,w*.3])b(x,.36,-d*.25,.06,.74,.58,'#626e61');for(const x of [-w*.2,w*.2]){b(x,1.02,-d*.3,.55,.35,.04,'#4e6159');b(x,.4,.15,.47,.08,.48,'#929d88');b(x,.7,.35,.47,.6,.08,'#929d88');}b(-w*.37,.9,d*.25,.35,1.8,d*.4,'#a28664');for(let i=0;i<5;i++)b(-w*.37,.35+i*.3,d*.25,.4,.035,d*.42,'#d3b68e');}
    if(r.type==='bath'){b(-w*.22,.4,-d*.27,w*.43,.8,.52,'#b7b6a8');b(-w*.22,.84,-d*.27,w*.46,.07,.56,'#f4f1e8');b(w*.26,.2,d*.1,Math.min(w*.38,.8),.4,Math.min(d*.65,1.65),'#eeece5');b(w*.26,.41,d*.1,Math.min(w*.3,.64),.03,Math.min(d*.56,1.45),'#c4d5d1');}
    if(r.type==='utility'){b(0,.45,0,Math.min(w*.7,1.3),.9,Math.min(d*.65,.7),'#eae8dc');b(0,.95,0,Math.min(w*.73,1.35),.075,Math.min(d*.68,.75),'#b19a76');}
    if(r.type==='stairs'){for(let i=0;i<10;i++)b(0,.04+i*.12,-d/2+i*d/10,w*.8,.08,d/10,'#c5b9a0');}
    if(r.type==='garage'){for(const x of [-w*.25,w*.25]){b(x,.02,0,w*.4,.025,d*.7,'#c4c8c0');}b(0,.65,-d*.39,w*.8,1.3,.42,'#a0a798');}
  }
  function roof(x,z,w,d,y){const ww=w*scale/2+.25,dd=d*scale+.5,h=ww*.44;const shape=new T.Shape();shape.moveTo(-ww,0);shape.lineTo(0,h);shape.lineTo(ww,0);shape.closePath();const geo=new T.ExtrudeGeometry(shape,{depth:dd,bevelEnabled:false});const m=new T.Mesh(geo,mat('#5a6059'));m.position.set(X(x+w/2),y,Z(z)-.25);m.castShadow=true;root.add(m);}
  function tree(x,z,size=1){const g=new T.Group();g.position.set(x,0,z);root.add(g);box(g,0,.8,0,.15,1.6,.15,'#917455');for(const [a,b,c,r]of[[0,2,0,.8],[-.35,1.8,.2,.6],[.3,1.65,-.3,.6]]){const m=new T.Mesh(new T.IcosahedronGeometry(r*size,2),mat('#7e9270'));m.position.set(a,b*size,c);m.castShadow=true;g.add(m);}}
  function update(p,o){plan=p;options=o;pickables=[];labels=[];labelsHost.replaceChildren();scene.remove(root);disposeRoot();highlight=null;root=new T.Group();scene.add(root);
    center=[(p.bounds[0]+p.bounds[2])/2,(p.bounds[1]+p.bounds[3])/2];scale=p.width/(p.bounds[2]-p.bounds[0]);const depth=(p.bounds[3]-p.bounds[1])*scale;
    const amount=o.preview?constructionTotal(p):o.amount,stages=constructionVisualProgress(amount,p),milestones=constructionProgress(amount,p),step=id=>milestones.find(phase=>phase.id===id).ratio;
    const frame=stages[1].ratio,walls=stages[2].ratio,roofRatio=stages[3].ratio,finish=step('kitchen-bath'),flooring=step('flooring');
    box(root,0,-.27,0,p.width+7,.45,depth+6,'#bcc8af');box(root,0,-.56,0,p.width+7.06,.15,depth+6.06,'#a4b498');
    if(p.garage){rect(root,...p.garage,.006,.035,'#b6b7aa');if(!p.custom)rect(root,p.garage[0],p.garage[1]+p.garage[3],p.garage[2],170,.005,.035,'#c8c8b8');}
    if(!p.custom)line(root,[...p.outline,p.outline[0]],'#819887');p.walls.forEach(w=>line(root,[[w[0],w[1]],[w[2],w[3]]],'#96ab9b'));
    if(step('survey-permits')>0&&step('foundation')<1){for(const [i,[x,z]]of p.outline.entries())if(i/p.outline.length<step('survey-permits')){box(root,X(x),.3,Z(z),.045,.6,.045,'#8f7955');box(root,X(x)+.1,.52,Z(z),.2,.1,.025,'#c67b4c');}}
    if(step('clear-grade')>0&&step('foundation')===0){for(const outline of p.outlines||[p.outline])shapeFloor(outline,.006,.025,step('excavation')>0?'#a99172':'#b7aa89');}
    if(step('foundation')>0){for(const outline of p.outlines||[p.outline])shapeFloor(outline,.02,.12*step('foundation')+.04*step('slab-utilities'),'#cecac0');if(p.porch&&step('slab-utilities')>0)rect(root,...p.porch,.06,.1,'#c4c2b5');}
    if(!o.preview&&step('inspection-clean')<1&&amount>0){box(root,-p.width/2-1,.4,depth/2+.8,.12,.8,.12,'#aa865d');box(root,-p.width/2-1,.7,depth/2+.8,.85,.3,.06,'#c69261');}
    for(const [i,r]of p.rooms.entries()){const complete=finish>i/p.rooms.length;const floor=rect(root,r.x,r.z,r.w,r.d,.205,.035,flooring>i/p.rooms.length?(p.custom?(r.floor==='oak'?wood:r.floor==='tile'?tile:floors.find(f=>f[0]===r.floor)[2]):(r.type==='bath'||r.type==='garage'||r.type==='utility'?tile:wood)):'#cecec0',r.id);floor.visible=step('slab-utilities')>0; if(complete&&r.furnished!==false)furnish(r);
      if(o.labels&&o.interior){const el=document.createElement('button');el.className='room-label';el.textContent=r.name;el.dataset.room=r.id;el.addEventListener('click',()=>onSelect(r.id));labelsHost.appendChild(el);labels.push({el,position:new T.Vector3(X(r.x+r.w/2),.28,Z(r.z+r.d*.77))});}}
    if(frame>0&&walls<1){const all=p.custom?p.walls:[...p.outline.map((a,i)=>[...a,...p.outline[(i+1)%p.outline.length]]),...p.walls];all.forEach((w,i)=>{if(i/all.length>=frame)return;const len=Math.hypot(w[2]-w[0],w[3]-w[1])*scale;const n=Math.max(2,Math.round(len/.6));for(let k=0;k<=n;k++){const f=k/n;box(root,X(w[0]+(w[2]-w[0])*f),.22+(o.interior?1.25:2.74)/2,Z(w[1]+(w[3]-w[1])*f),.06,o.interior?1.25:2.74,.06,'#bda079');}if(walls===0)wall([w[0],w[1]],[w[2],w[3]],.08,'#bc9b70');});}
    if((step('sheathing')>0||step('drywall-paint')>0)&&p.custom){
      const height=o.interior?1.22:2.74;
      p.wallSegments.forEach((segment,i)=>{const matching=p.wallSegments.filter(w=>w.exterior===segment.exterior),part=matching.indexOf(segment)/matching.length;if(part>=(segment.exterior?step('sheathing'):step('drywall-paint')))return;
        const color=id=>step('drywall-paint')<=i/p.wallSegments.length?'#cfb88d':paints.find(v=>v[0]===p.rooms.find(r=>r.id===id)?.paint)?.[2]||'#e5e2d6';
        const colors=[mat('#e6e1d3'),mat('#e6e1d3'),mat('#eee9db'),mat('#eee9db'),mat(color(segment.positive)),mat(color(segment.negative))];
        const openings=p.openings.filter(h=>wallForOpening(h,[segment])).map(h=>({t:((h.axis==='x'?h.x:h.z)-segment.start)*scale,w:h.width*scale,bottom:h.kind==='window'?.84:0,top:2.2,type:h.kind==='door'&&h.width>=5?'garage':h.kind,installed:p.openings.indexOf(h)/p.openings.length<step('windows-doors')}));
        wall(segment.a,segment.b,height,colors,openings);
      });
    }
    if((step('sheathing')>0||step('drywall-paint')>0)&&!p.custom){const exterior=p.outline.map((a,i)=>[a,p.outline[(i+1)%p.outline.length]]);const height=o.interior?1.22:2.74;
      exterior.forEach(([a,b],i)=>{if(i/exterior.length>=step('sheathing'))return;const len=Math.hypot(b[0]-a[0],b[1]-a[1]);const openings=[];for(const [x,z,w,axis='x']of [...p.windows.map(v=>[...v]),...p.doors.map(v=>[...v])]){const horiz=a[1]===b[1];if((horiz&&axis==='x'&&Math.abs(z-a[1])<2&&x>=Math.min(a[0],b[0])&&x<=Math.max(a[0],b[0]))||(!horiz&&axis==='z'&&Math.abs(x-a[0])<2&&z>=Math.min(a[1],b[1])&&z<=Math.max(a[1],b[1]))){const door=p.doors.some(v=>v[0]===x&&v[1]===z);openings.push({t:Math.hypot(x-a[0],z-a[1])*scale,w:w*scale,bottom:door?0:.84,top:door?2.2:2.2,type:door?(w*scale>2.5?'garage':'door'):'window',installed:(door?p.windows.length+p.doors.findIndex(v=>v[0]===x&&v[1]===z):p.windows.findIndex(v=>v[0]===x&&v[1]===z))/(p.windows.length+p.doors.length)<step('windows-doors')});}}wall(a,b,height,step('exterior')>i/exterior.length?'#f1eee2':'#c5aa80',openings);});
      p.walls.forEach((w,i)=>{if(i/p.walls.length<step('drywall-paint'))wall([w[0],w[1]],[w[2],w[3]],height,'#e5e2d6');});}
    if(roofRatio>0&&!o.interior&&p.custom){for(const [i,r]of p.rooms.entries())if(i/p.rooms.length<roofRatio)rect(root,r.x,r.z,r.w,r.d,3.04,.18,'#697669');}
    if(roofRatio>0&&!o.interior&&!p.custom){const rw=(p.bounds[2]-p.bounds[0])*roofRatio;roof(p.bounds[0],p.bounds[1],rw,p.garage[1]-p.bounds[1]+10,3.02);roof(p.garage[0],p.garage[1],p.garage[2]*roofRatio,p.garage[3],2.96);const garageRight=p.garage[0]+p.garage[2];const wingX=p.garage[0]>p.bounds[0]?p.bounds[0]:garageRight;const wingWidth=p.garage[0]>p.bounds[0]?p.garage[0]-p.bounds[0]:p.bounds[2]-garageRight;const wingEnd=Math.max(...p.rooms.filter(r=>r.type!=='garage').map(r=>r.z+r.d));if(wingWidth>0&&wingEnd>p.garage[1])roof(wingX,p.garage[1],wingWidth*roofRatio,wingEnd-p.garage[1],3.02);}
    if(o.interior&&step('drywall-paint')<1){
      const wetRooms=p.rooms.filter(r=>['bath','kitchen','utility'].includes(r.type));
      wetRooms.forEach((r,i)=>{if(i/wetRooms.length>=step('plumbing'))return;const x=X(r.x+r.w*.14),z=Z(r.z+r.d*.14);box(root,x,.32,z,Math.max(.12,r.w*scale*.7),.07,.07,'#729aaa');box(root,x,.66,z,.07,.7,.07,'#729aaa');});
      p.rooms.forEach((r,i)=>{if(i/p.rooms.length<step('electrical')){box(root,X(r.x+r.w*.7),.75,Z(r.z+r.d*.1),.025,1.02,.025,'#b58c4d');box(root,X(r.x+r.w*.7),.38,Z(r.z+r.d*.1),.12,.16,.05,'#738079');}if(i/p.rooms.length<step('hvac'))box(root,X(r.x+r.w*.25),1.02,Z(r.z+r.d*.14),Math.max(.25,r.w*scale*.55),.13,.17,'#a1a9a6');});
    }
    if(step('landscaping')>0){tree(-p.width/2-1.6,-depth/2+1,1.2);if(step('landscaping')>.5)tree(p.width/2+1.5,depth/2-2,.85);for(let i=0;i<7*step('landscaping');i++){box(root,-p.width/2-1,.25,-depth/2+3+i*.85,.7,.5,.7,'#8b9f79');}}
    let placedCount=0;
    if(step('slab-utilities')>0)for(const placement of o.placements||[]){
      if(placement.plan!==p.id)continue;
      const owned=o.inventory?.find(e=>e.id===placement.id),r=p.rooms.find(r=>r.id===placement.room);if(!owned||!r)continue;
      const item=getItem(owned.item),floorFurniture=['furniture','cats'].includes(item.category),onDesk=r.furnished!==false&&r.type==='study'&&placement.u===undefined&&placement.slot<6&&item.category!=='cars'&&finish>p.rooms.indexOf(r)/p.rooms.length,model=createItemModel(owned,{displayStand:!onDesk}),w=r.w*scale,d=r.d*scale;
      let x,z;
      if(placement.u!==undefined){x=(placement.u/100-.5)*w;z=(placement.v/100-.5)*d;model.rotation.y=placement.rotation*Math.PI/2;model.updateMatrixWorld(true);const size=new T.Box3().setFromObject(model).getSize(new T.Vector3()),availableW=2*Math.min(placement.u/100,1-placement.u/100)*w-.15,availableD=2*Math.min(placement.v/100,1-placement.v/100)*d-.15,fit=Math.min(1,availableW/size.x,availableD/size.z);model.scale.multiplyScalar(Math.max(floorFurniture?.001:.05,fit));}
      else if(item.category==='cars'){x=(placement.slot===0?-.25:.25)*w;z=d*.04;const sideways=placement.rotation%2===1,fit=Math.min(1,(w*.43)/(sideways?3.8:1.85),(d*.75)/(sideways?1.85:3.8));model.scale.setScalar(fit);}
      else if(floorFurniture){const i=placement.slot-12;x=(i%2===0?-.25:.25)*w;z=(i<2?-.25:.25)*d;model.rotation.y=placement.rotation*Math.PI/2;model.updateMatrixWorld(true);const size=new T.Box3().setFromObject(model).getSize(new T.Vector3()),availableW=Math.min(w*.48,w-2*Math.abs(x)-.16),availableD=Math.min(d*.48,d-2*Math.abs(z)-.16);model.scale.multiplyScalar(Math.max(.001,Math.min(1,availableW/size.x,availableD/size.z)));}
      else if(placement.slot<12){const i=placement.slot%6;x=(i-2.5)*w*.125;z=(onDesk?-.25:placement.slot<6?-.36:.36)*d;const fit=Math.min(1,(w*.118)/.85);model.scale.setScalar(fit);}
      else{const i=placement.slot-12;x=(i%2===0?-.32:.32)*w;z=(i<2?-.3:.3)*d;if(r.type==='study'){x=(i%2===0?-1:1)*w*(i<2?.2:.38);z=d*(i<2?.36:.02);}const fit=Math.min(1,w*.24/1.4,d*.24/1.3);model.scale.setScalar(fit);}
      model.position.set(X(r.x+r.w/2)+x,onDesk?1.04:.24,Z(r.z+r.d/2)+z);model.rotation.y=placement.rotation*Math.PI/2;
      model.userData.ownedId=owned.id;model.userData.room=r.id;model.traverse(n=>{if(n.isMesh){n.userData.item=owned.id;n.userData.room=r.id;pickables.push(n);}});root.add(model);placedCount++;
    }
    select(selection);renderer.domElement.dataset.plan=p.id;renderer.domElement.dataset.mode=o.preview?'preview':'construction';renderer.domElement.dataset.objects=String(root.children.length);renderer.domElement.dataset.placed=String(placedCount);renderer.domElement.dataset.stage=milestones.find(phase=>phase.ratio<1)?.id||'complete';renderer.domElement.dataset.funded=String(amount||0);renderer.domElement.dataset.budget=String(constructionTotal(p));
  }
  function select(id){selection=id;if(highlight){root.remove(highlight);highlight.geometry.dispose();highlight.material.dispose();highlight=null;}const r=plan?.rooms.find(r=>r.id===id);if(r){highlight=rect(root,r.x,r.z,r.w,r.d,.242,.015,new T.MeshBasicMaterial({color:'#d7b977',transparent:true,opacity:.38,depthWrite:false}));}labels.forEach(l=>l.el.classList.toggle('selected',l.el.dataset.room===id));}
  function home(){const fit=Math.max(1,1.15/camera.aspect)*(plan?.custom?Math.max(.4,Math.max(plan.width,plan.depth)/18):1);camera.position.set(18,21,24).multiplyScalar(fit);controls.target.set(0,.4,0);controls.update();}
  function top(){camera.position.set(0,36/Math.min(1,camera.aspect),.01);controls.target.set(0,0,0);controls.update();}
  function zoom(f){camera.position.sub(controls.target).multiplyScalar(f).add(controls.target);controls.update();}
  function focusItem(id){const model=root.children.find(m=>m.userData.ownedId===id);if(!model)return;const bounds=new T.Box3().setFromObject(model),target=bounds.getCenter(new T.Vector3()),size=bounds.getSize(new T.Vector3()),distance=Math.max(2.5,Math.max(size.x,size.y,size.z)*1.7)/Math.min(1,camera.aspect),room=plan.rooms.find(r=>r.id===model.userData.room);const direction=new T.Vector3(X(room.x+room.w/2)-target.x,0,Z(room.z+room.d/2)-target.z);if(direction.length()<.2)direction.set(1,0,1);direction.normalize().multiplyScalar(distance*.45);direction.y=distance*.95;controls.target.copy(target);camera.position.copy(target).add(direction);controls.update();}
  const ray=new T.Raycaster();const pointer=new T.Vector2();let start;
  renderer.domElement.addEventListener('pointerdown',e=>{start=[e.clientX,e.clientY];});
  renderer.domElement.addEventListener('pointerup',e=>{if(!start||Math.hypot(e.clientX-start[0],e.clientY-start[1])>5)return;const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(pointer,camera);const hit=ray.intersectObjects(pickables).find(h=>h.object.visible);if(hit){if(hit.object.userData.item)onSelectItem(hit.object.userData.item);else onSelect(hit.object.userData.room);}});
  let lastAspect=null;const observer=new ResizeObserver(()=>{const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();if(lastAspect===null||Math.abs(lastAspect-camera.aspect)>.2)home();lastAspect=camera.aspect;});observer.observe(host);
  home();let elapsed=0;renderer.setAnimationLoop(time=>{controls.update();if(time-elapsed>40){for(const l of labels){const v=l.position.clone().project(camera);l.el.style.transform=`translate(-50%,-50%) translate(${(v.x*.5+.5)*host.clientWidth}px,${(-v.y*.5+.5)*host.clientHeight}px)`;l.el.hidden=v.z>1||v.x<-1||v.x>1||v.y<-1||v.y>1||!options?.interior;}elapsed=time;}renderer.render(scene,camera);});
  function disposeRoot(){const cached=new Set([...materials.values(),wood,tile]),used=new Set();root.traverse(n=>{n.geometry?.dispose();if(n.material)for(const m of Array.isArray(n.material)?n.material:[n.material])if(!cached.has(m))used.add(m);});used.forEach(m=>m.dispose());}
  function dispose(){observer.disconnect();renderer.setAnimationLoop(null);controls.dispose();disposeRoot();for(const m of materials.values())m.dispose();wood.dispose();tile.dispose();textures.forEach(t=>t.dispose());renderer.dispose();renderer.forceContextLoss();host.replaceChildren();}
  return {update,home,zoom,top,select,focusItem,dispose};
}
