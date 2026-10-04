import * as T from 'three';

// Small placement models; the catalog keeps the actual official product photos.
export function createBagModel(item){
  const group=new T.Group(),color=item.color||'#49372b',edge=new T.Color(color).offsetHSL(0,0,-.07),gold='#bb9a58';
  const leather=new T.MeshStandardMaterial({color,roughness:.67}),trim=new T.MeshStandardMaterial({color:edge,roughness:.72}),metal=new T.MeshStandardMaterial({color:gold,metalness:.72,roughness:.3});
  const add=(geometry,material,x=0,y=0,z=0)=>{const mesh=new T.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh;};
  const line=(points,material=trim,radius=.009)=>add(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),24,radius,6,false),material);
  const handle=(width,y,z,height=.17,material=leather)=>line([[-width/2,y,z],[-width*.42,y+height*.77,z],[0,y+height,z],[width*.42,y+height*.77,z],[width/2,y,z]],material,.013);
  const shape=item.shape||'bag-flap',tote=shape==='bag-tote',saddle=shape==='bag-saddle',bucket=shape==='bag-bucket',hobo=shape==='bag-hobo';
  const w=tote?.5:saddle?.43:bucket?.35:.4,h=tote?.34:bucket?.35:.28,d=tote?.18:.13;
  if(bucket){
    add(new T.CylinderGeometry(.175,.155,h,32,1,true),leather,0,h/2,0);
    add(new T.CylinderGeometry(.155,.155,.018,32),leather,0,.009,0);
    const rim=add(new T.TorusGeometry(.175,.008,6,32),trim,0,h,0);rim.rotation.x=Math.PI/2;
    handle(.29,h-.035,0,.22);line([[-.07,h-.02,.17],[0,h-.05,.18],[.06,h-.015,.17],[.015,h-.16,.18]],trim,.005);
  }else{
    const outline=new T.Shape();
    if(saddle){
      outline.moveTo(-w/2,h);outline.lineTo(w/2,h);outline.lineTo(w/2,.09);outline.quadraticCurveTo(w*.17,-.025,0,.025);outline.quadraticCurveTo(-w*.55,-.02,-w/2,.08);outline.lineTo(-w/2,h);
    }else{
      const base=tote?w*.76:w,top=hobo?w*.77:w;
      outline.moveTo(-base/2+.025,0);outline.lineTo(base/2-.025,0);outline.quadraticCurveTo(base/2,0,base/2,.025);outline.lineTo(top/2,h-.025);outline.quadraticCurveTo(top/2,h,top/2-.025,h);
      if(hobo)outline.quadraticCurveTo(0,h-.1,-top/2+.025,h);else outline.lineTo(-top/2+.025,h);
      outline.quadraticCurveTo(-top/2,h,-top/2,h-.025);outline.lineTo(-base/2,.025);outline.quadraticCurveTo(-base/2,0,-base/2+.025,0);
    }
    add(new T.ExtrudeGeometry(outline,{depth:d,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.006,bevelThickness:.006,curveSegments:12}),leather,0,.012,-d/2);
    if(tote||shape==='bag-tophandle'){
      for(const z of [-d*.43,d*.43])handle(w*.53,h-.014,z,tote?.2:.14);
      if(shape==='bag-tophandle')for(const x of [-w*.35,w*.35])for(const z of [-d*.55,d*.55])add(new T.SphereGeometry(.015,10,8),metal,x,h-.025,z);
    }else{
      handle(w*.72,h-.015,0,saddle?.21:.25,saddle||hobo?leather:metal);
      if(!hobo){
        add(new T.BoxGeometry(w*.91,h*.43,.015),leather,0,h*.78,d/2+.013);
        add(new T.BoxGeometry(.039,.025,.015),metal,0,h*.54,d/2+.027);
      }
    }
    if(shape==='bag-flap'){
      for(let i=-2;i<=2;i++)line([[i*.055-.07,.075,d/2+.01],[i*.055+.045,.17,d/2+.01]],trim,.002);
      for(let i=-2;i<=2;i++)line([[i*.055-.07,.17,d/2+.012],[i*.055+.045,.075,d/2+.012]],trim,.002);
    }
    if(saddle)line([[w*.32,h*.5,d/2+.02],[w*.32,.01,d/2+.02]],leather,.016);
  }
  group.userData.bagShape=shape;
  return group;
}
