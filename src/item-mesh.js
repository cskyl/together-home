import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { getItem, quote, paintOptions, carOptions } from './items.js';
import { createFurnitureModel } from './furniture-mesh.js';

export function createItemModel(owned,{displayStand=false}={}) {
  const item=getItem(owned.item||owned.id),config=quote(item.id,owned.config).config;
  const variant=item.variants?.find(v=>v.id===owned.variant);
  const shape=variant?.shape||item.shape,color=variant?.color||item.color;
  const root=new T.Group(),materials=new Map();
  const material=(c,extra={})=>{
    const key=c+JSON.stringify(extra);if(!materials.has(key))materials.set(key,new T.MeshStandardMaterial({color:c,roughness:.65,...extra}));return materials.get(key);
  };
  function mesh(geo,c,x,y,z,extra){const m=new T.Mesh(geo,material(c,extra));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;root.add(m);return m;}
  const box=(x,y,z,w,h,d,c,extra)=>mesh(new T.BoxGeometry(w,h,d),c,x,y,z,extra);
  const ball=(x,y,z,rx,ry,rz,c,extra)=>{const m=mesh(new T.SphereGeometry(1,16,12),c,x,y,z,extra);m.scale.set(rx,ry,rz);return m;};
  const cylinder=(x,y,z,rt,rb,h,c)=>mesh(new T.CylinderGeometry(rt,rb,h,16),c,x,y,z);
  if(item.category==='furniture'||item.category==='cats'){
    root.add(createFurnitureModel(item));
  }else if(item.category==='lego'){
    const wide=[10255,10326,11371].includes(item.set),w=wide?1.48:1.06,d=.79;
    box(0,.03,0,w+.15,.06,d+.22,'#777f78');box(0,.077,.39,w+.15,.045,.18,'#b1b4ab');
    const split=[10218,10246,10255,10270,10312,11371].includes(item.set),columns=split?2:1;
    for(let k=0;k<columns;k++){
      const bw=w/columns-.025,x=(k-(columns-1)/2)*w/columns,h=1.14+(item.index%3)*.09-k*.15;
      const facade=k===1?'#d0b895':color;
      box(x,h/2+.09,-.04,bw,h,.68,facade);
      for(let row=0;row<3;row++){
        const y=.31+row*.34;
        box(x,y+.15,.319,bw+.03,.055,.07,'#e4ddc4');
        const count=split?2:3;
        for(let col=0;col<count;col++){
          const wx=x+(col-(count-1)/2)*bw/(count+.3),ww=bw/(count+1.5);
          box(wx,y,.326,ww+.045,.24,.025,'#e9e3ce');box(wx,y,.344,ww,.19,.02,config.display==='lit'?'#f0cd77':'#48595b',config.display==='lit'?{emissive:'#d09b3a',emissiveIntensity:.7}:{});
          box(wx,y,.36,.012,.19,.01,'#ccc1a7');
          if(row===1&&item.index%2===0){box(wx,y-.13,.4,ww+.075,.035,.16,'#bcb395');for(const sign of [-1,1])box(wx+sign*ww*.45,y-.065,.46,.015,.13,.015,'#5e665c');box(wx,y,.46,ww+.06,.02,.018,'#5e665c');}
        }
      }
      box(x,h+.13,-.04,bw+.08,.1,.77,'#e8ddbd');box(x,h+.21,-.05,bw-.05,.065,.57,'#535d58');
      if(item.set===10350){for(const xx of [-bw*.42,0,bw*.42])box(x+xx,.95,.354,.035,.37,.035,'#51493e');box(x,1,.36,bw,.028,.03,'#51493e');}
      if(item.set===10224){box(x,h+.29,0,.37,.23,.37,'#cdbb96');const clock=cylinder(x,h+.28,.22,.085,.085,.025,'#f5edd6');clock.rotation.x=Math.PI/2;box(x,h+.30,.24,.008,.065,.012,'#5b625c');box(x+.023,h+.28,.24,.05,.008,.012,'#5b625c');}
      const awningColor=['#765b47','#637f6f','#ac7664','#93858c'][item.index%4];
      if(![10224,10326,10278].includes(item.set)){for(let j=0;j<6;j++)box(x+(j-2.5)*bw/6,.53,.45,bw/6,.055,.28,j%2?awningColor:'#e8dec4');}
      for(let a=0;a<5;a++)for(let b=0;b<3;b++)cylinder(x+(a-2)*bw/5,h+.259,(b-1)*.15,.025,.025,.015,'#66716a');
    }
    if(item.set===10326||item.set===10251){for(const x of [-.42,-.14,.14,.42]){cylinder(x,.6,.44,.035,.035,1,'#eee5cb');box(x,1.11,.43,.09,.07,.1,'#e3d8bc');}}
    if(item.set===10232){box(0,.77,.48,.67,.3,.13,'#b25744');for(let i=0;i<7;i++)ball((i-3)*.087,.87,.56,.018,.018,.018,'#f0d788',{emissive:'#d6ab42',emissiveIntensity:.8});}
    if(item.set===10260){box(-.48,.87,.41,.12,.85,.12,'#d67f8d');box(0,.52,.48,.8,.08,.13,'#b8ded0');}
    cylinder(w*.48,.4,.47,.015,.015,.7,'#4b584f');ball(w*.48,.77,.47,.065,.065,.065,'#eadcbc');
    if(config.display!=='open')box(0,.84,0,w+.28,1.63,1.11,'#c4e0da',{transparent:true,opacity:.13,roughness:.05,depthWrite:false});
    root.scale.setScalar(.48);
  }else if(item.category==='cars'){
    const paint=paintOptions.find(v=>v.id===config.paint).color,seat=carOptions.cabin.values.find(v=>v.id===config.cabin).color;
    const suv=['suv','offroad'].includes(shape),small=shape==='compact',long=shape==='wagon',w=1.48,l=small?2.8:long?3.7:3.45,bodyY=suv?.67:.5;
    box(0,bodyY,0,w,.46,l,paint,{metalness:.25,roughness:.3});box(0,.27,0,w*.86,.14,l*.94,'#303839');
    const cabinH=suv?.78:.56,cabinY=bodyY+.22+cabinH/2,cz=shape==='coupe'?-.25:-.13,cl=l*(small?.47:.5);
    box(0,bodyY+.235,cz,w*.84,.08,cl,'#4a504c');
    for(const x of [-.35,.35])for(const z of [cz+.35,cz-.5]){box(x,bodyY+.4,z,.43,.19,.44,seat);box(x,bodyY+.55,z-.15,.43,.4,.11,seat);}
    const glass={transparent:true,opacity:.35,roughness:.08,metalness:.1,depthWrite:false};
    for(const x of [-w*.41,w*.41]){box(x,cabinY,cz,.035,cabinH,cl,'#b0cbd0',glass);for(const z of [cz-cl/2,cz+cl/2])box(x,cabinY,z,.05,cabinH,.055,paint);}
    for(const z of [cz-cl/2,cz+cl/2])box(0,cabinY,z,w*.84,cabinH,.035,'#acc7cb',glass);
    if(config.roof!=='open')box(0,cabinY+cabinH/2,cz,w*.86,.075,cl+.055,config.roof==='glass'?'#627f85':paint,config.roof==='glass'?glass:{});
    const rim=config.wheels==='sport'?'#4b5155':config.wheels==='bronze'?'#ab8953':'#c0c7c9',radius=suv?.36:.3;
    for(const x of [-w*.51,w*.51])for(const z of [-l*.31,l*.31]){
      const tyre=cylinder(x,.36,z,radius,radius,.22,'#292e30');tyre.rotation.z=Math.PI/2;
      const wheel=cylinder(x+Math.sign(x)*.12,.36,z,radius*.65,radius*.65,.035,rim);wheel.rotation.z=Math.PI/2;
      const hub=cylinder(x+Math.sign(x)*.143,.36,z,.055,.055,.04,'#dadfda');hub.rotation.z=Math.PI/2;
      for(let j=0;j<5;j++){const spoke=box(x+Math.sign(x)*.144,.36,z,.04,.04,radius*1.16,config.wheels==='sport'?'#9b9e98':'#585f62');spoke.rotation.x=j*Math.PI/5;}
    }
    for(const x of [-.49,.49]){box(x,bodyY+.06,l/2+.018,.33,.11,.04,'#ece4be',{emissive:'#d5c58d',emissiveIntensity:.2});box(x,bodyY+.06,-l/2-.018,.34,.095,.04,'#9e4541');box(Math.sign(x)*.81,cabinY-.13,cz+cl*.26,.17,.11,.2,paint);}
    box(0,bodyY-.1,l/2+.024,.7,.09,.04,'#424a4d');box(0,bodyY-.08,-l/2-.024,.29,.11,.03,'#d4d6ca');
    if(config.trim==='sport'){box(0,bodyY+.48,-l*.43,w*1.04,.09,.29,'#343d3f');for(const x of [-.45,.45])box(x,bodyY+.35,-l*.43,.06,.23,.07,'#444c4c');for(const x of [-w*.52,w*.52])box(x,.34,0,.09,.14,l*.57,'#414a49');}
    if(shape==='offroad'){const spare=cylinder(0,bodyY+.13,-l/2-.11,.3,.3,.16,'#303639');spare.rotation.x=Math.PI/2;}
  }else if(item.category==='plush'||item.category==='blind'&&variant){
    if(shape==='pudding'){
      cylinder(0,.08,0,.44,.44,.1,'#e7decb');cylinder(0,.34,0,.29,.38,.47,color);ball(0,.62,0,.13,.11,.13,'#ede2cd');ball(.015,.76,0,.065,.07,.065,'#b86568');
      for(const x of [-.105,.105])ball(x,.4,.3,.025,.032,.017,'#464c46');
    }else{
      const animal=shape.replace('astro-',''),panda=animal==='panda',ears=animal==='rabbit'? .27:.105;
      ball(0,.36,0,.31,.37,.26,color);ball(0,.79,.04,.31,.29,.27,color);
      for(const x of [-.21,.21]){ball(x,.97+ears*.5,.01,animal==='rabbit'?.075:.115,ears,.085,panda?'#505551':color);ball(x,.32,.02,.12,.21,.13,panda?'#505551':color);ball(x*.75,.08,.16,.135,.09,.17,panda?'#505551':color);}
      if(['cat','fox'].includes(animal))for(const x of [-.19,.19]){const ear=mesh(new T.ConeGeometry(.13,.27,3),color,x,1.02,.025);ear.rotation.y=Math.PI;}
      if(animal==='capybara'){ball(0,.72,.23,.23,.13,.16,color);}
      if(panda)for(const x of [-.11,.11])ball(x,.82,.279,.082,.095,.021,'#535754');
      for(const x of [-.105,.105])ball(x,.83,.303,.028,.034,.019,'#353d38');
      ball(0,.725,.312,.046,.03,.018,'#70594f');ball(-.175,.742,.274,.045,.025,.016,'#cc9691');ball(.175,.742,.274,.045,.025,.016,'#cc9691');
      if(animal==='bear'||animal==='fox'){cylinder(0,.571,.012,.24,.25,.105,'#77918c');box(.13,.46,.24,.09,.24,.025,'#77918c');}
      if(shape.startsWith('astro-')){ball(0,.83,.04,.395,.415,.365,'#b9d8db',{transparent:true,opacity:.2,depthWrite:false});cylinder(0,.51,.015,.3,.3,.09,'#e4e1d4');box(0,.36,-.27,.3,.34,.13,'#d9ddd5');}
    }
    if(item.category==='blind')root.scale.setScalar(.4);
  }else if(item.category==='blind'){
    box(0,.4,0,.66,.8,.66,color);box(0,.81,0,.69,.045,.69,'#ebe3d1');box(0,.4,.34,.38,.43,.012,'#e8e0cb');
    const q=new T.TorusGeometry(.08,.018,8,16,Math.PI*1.5);mesh(q,color,0,.46,.36).rotation.z=-Math.PI/2;ball(0,.28,.363,.025,.025,.018,color);
  }else{
    if(shape==='plant'||shape==='flowers'){
      cylinder(0,.22,0,shape==='plant'?.27:.16,.18,.44,shape==='plant'?'#bb9d7d':color);
      for(let i=0;i<7;i++){const angle=i*2.4,r=shape==='plant'?.3:.18,x=Math.cos(angle)*r,z=Math.sin(angle)*r,h=.73+(i%3)*.17;const stem=cylinder(x*.48,h/2+.25,z*.48,.012,.012,h-.25,'#6f8a62');stem.rotation.z=-x*.35;const leaf=ball(x,h,z,shape==='plant'?.2:.095,shape==='plant'?.065:.095,shape==='plant'?.12:.095,shape==='plant'?'#7d986b':['#d6b4be','#e7c784','#e3d9bc'][i%3]);leaf.rotation.z=x*1.2;}
    }
    if(shape==='lamp'){cylinder(0,.04,0,.25,.28,.08,'#777b68');cylinder(0,.67,0,.025,.025,1.25,'#8e8d75');const shade=ball(0,1.32,0,.43,.24,.43,color);box(0,1.25,0,.12,.1,.12,'#e7c98a',{emissive:'#d7b660',emissiveIntensity:.7});}
    if(shape==='shelf'||shape==='record'){const h=shape==='shelf'?1.65:.7,w=shape==='shelf'?1.2:1;for(const x of [-w/2,w/2])box(x,h/2,0,.065,h,.4,color);box(0,h/2,-.2,w,h,.035,'#987c5c');for(let j=0;j<(shape==='shelf'?5:3);j++){const y=.08+j*(h-.16)/(shape==='shelf'?4:2);box(0,y,0,w,.055,.42,color);if(j<3)for(let i=0;i<6;i++)box(-w*.37+i*.09,y+.13,-.02,.057,.22+(i%2)*.04,.23,['#8c9a88','#b8a88a','#a67966','#a0afb0'][i%4]);}if(shape==='record'){box(.05,.78,.01,.66,.07,.33,'#4f5c55');cylinder(.13,.827,.01,.135,.135,.025,'#303a37');cylinder(.13,.844,.01,.045,.045,.014,'#c2ac7b');}}
    if(shape==='chair'){box(0,.39,0,.73,.19,.76,color);box(0,.7,-.32,.73,.64,.15,color);for(const x of [-.38,.38])box(x,.58,0,.13,.25,.79,color);for(const x of [-.29,.29])for(const z of [-.28,.28])cylinder(x,.14,z,.035,.025,.28,'#8a735b');}
    if(shape==='rug')cylinder(0,.014,0,.74,.74,.027,color);
    if(shape==='table'){cylinder(0,.57,0,.53,.53,.1,color);for(const angle of [0,2.094,4.188])cylinder(Math.cos(angle)*.32,.27,Math.sin(angle)*.32,.035,.055,.54,'#907753');}
    if(shape==='piano'){box(0,.57,0,1.3,1.14,.36,color);box(0,.72,.3,1.32,.13,.4,color);for(let i=0;i<20;i++){box((i-9.5)*.057,.798,.34,.052,.028,.29,'#ebe7d9');if(i%7!==2&&i%7!==6)box((i-9.5)*.057+.028,.826,.27,.03,.035,.16,'#303a35');}box(0,.3,.84,.65,.07,.32,'#987e62');for(const x of [-.26,.26])box(x,.15,.84,.04,.3,.25,'#686958');}
    if(shape==='aquarium'){box(0,.38,0,.9,.76,.42,'#9b8368');box(0,.79,0,.94,.08,.47,'#626d62');box(0,1.06,0,.88,.47,.41,'#9ac2c3',{transparent:true,opacity:.36,roughness:.08,depthWrite:false});box(0,.85,0,.87,.035,.4,'#d2c3a0');for(let i=0;i<3;i++)ball((i-1)*.2,1.01+(i%2)*.1,.03,.075,.038,.025,['#d49a5c','#d0b981','#929f75'][i]);}
  }
  if(displayStand&&['lego','blind'].includes(item.category)){
    const holder=new T.Group();holder.add(root);root.position.y=.86;
    const top=new T.Mesh(new T.BoxGeometry(.85,.07,.66),material('#b3936c'));top.position.y=.82;top.receiveShadow=true;holder.add(top);
    for(const x of [-.33,.33])for(const z of [-.24,.24]){const leg=new T.Mesh(new T.BoxGeometry(.045,.79,.045),material('#9a8060'));leg.position.set(x,.395,z);holder.add(leg);}return holder;
  }
  return root;
}

export function disposeModel(root){const geometries=new Set(),materials=new Set();root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const material of Array.isArray(o.material)?o.material:[o.material])materials.add(material);});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}

export function createItemPreview(host,owned){
  let renderer;
  try{renderer=new T.WebGLRenderer({antialias:true,alpha:true});}catch{host.textContent='此设备无法显示 3D 预览，仍可选配和购买。';return {update(){},dispose(){}};}
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;
  host.appendChild(renderer.domElement);renderer.domElement.setAttribute('aria-label','物品 3D 预览，可拖动旋转和双指缩放');
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(36,1,.01,100),controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=true;controls.minDistance=.6;controls.maxDistance=12;controls.maxPolarAngle=Math.PI*.49;controls.enablePan=false;
  scene.add(new T.HemisphereLight('#fff5df','#7e9287',2.4));const sun=new T.DirectionalLight('#fff4dd',3);sun.position.set(4,7,6);scene.add(sun);const fill=new T.DirectionalLight('#d4e0f0',2);fill.position.set(-4,4,-5);scene.add(fill);
  let model;
  function update(value,fit=false){if(model){scene.remove(model);disposeModel(model);}model=createItemModel(value);scene.add(model);renderer.domElement.dataset.item=value.item||value.id;renderer.domElement.dataset.config=JSON.stringify(value.config||{});
    if(fit){const bounds=new T.Box3().setFromObject(model),center=bounds.getCenter(new T.Vector3()),size=bounds.getSize(new T.Vector3()),radius=Math.max(size.x,size.y,size.z)*1.8;controls.target.copy(center);camera.position.copy(center).add(new T.Vector3(radius*.8,radius*.6,radius));controls.update();}}
  update(owned,true);
  const observer=new ResizeObserver(()=>{const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();});observer.observe(host);
  renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera);});
  return {update(value){update(value);},dispose(){observer.disconnect();renderer.setAnimationLoop(null);controls.dispose();disposeModel(model);renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();}};
}
