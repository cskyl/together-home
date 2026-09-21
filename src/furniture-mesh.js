import * as T from 'three';

// Original furniture and cat-room props, measured in metres. The caller owns
// their geometries/materials and disposes them with the other placed items.
export function createFurnitureModel(item) {
  const root=new T.Group(),materials=new Map(),color=item.color||'#bda583';
  const wood='#b79570',dark='#56615a',linen='#e8e1cf',metal='#7c8784';
  function material(c,extra={}){const key=c+JSON.stringify(extra);if(!materials.has(key))materials.set(key,new T.MeshStandardMaterial({color:c,roughness:.78,...extra}));return materials.get(key);}
  function mesh(geometry,c,x=0,y=0,z=0,extra){const m=new T.Mesh(geometry,material(c,extra));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;root.add(m);return m;}
  const box=(x,y,z,w,h,d,c=color,extra)=>mesh(new T.BoxGeometry(w,h,d),c,x,y,z,extra);
  const cylinder=(x,y,z,r,h,c=color,rb=r,extra)=>mesh(new T.CylinderGeometry(r,rb,h,24),c,x,y,z,extra);
  const ball=(x,y,z,rx,ry,rz,c=color)=>{const m=mesh(new T.SphereGeometry(1,20,14),c,x,y,z);m.scale.set(rx,ry,rz);return m;};
  const ring=(x,y,z,r,t,c=color)=>mesh(new T.TorusGeometry(r,t,10,32),c,x,y,z);
  function legs(w,d,h,c=wood,r=.035){for(const x of [-w/2,w/2])for(const z of [-d/2,d/2])cylinder(x,h/2,z,r,h,c);}
  function handle(x,y,z,w=.15){box(x,y,z,w,.025,.035,dark);}
  function books(x,y,z,count=5){for(let i=0;i<count;i++){const h=.18+(i%3)*.035;box(x+i*.066,y+h/2,z,.047,h,.19,['#7f9788','#af836d','#b2b6a6','#b6a17a','#879eab'][i%5]);}}
  function bowl(x,y,z,c,food){const points=[[0,0],[.11,0],[.155,.075],[.15,.095],[.13,.088],[.10,.03],[0,.027]].map(([a,b])=>new T.Vector2(a,b));mesh(new T.LatheGeometry(points,28),c,x,y,z,{roughness:.4});cylinder(x,y+.034,z,.095,.009,food);}
  function cubby(x,y,z,w,h,d,c=color,cushion=linen){
    box(x,y+.025,z,w,.05,d,c);box(x,y+h-.025,z,w,.05,d,c);box(x-w/2+.023,y+h/2,z,.046,h,d,c);box(x+w/2-.023,y+h/2,z,.046,h,d,c);box(x,y+h/2,z-d/2+.018,w,h,.036,c);
    const face=new T.Shape();face.moveTo(-w/2,0);face.lineTo(w/2,0);face.lineTo(w/2,h);face.lineTo(-w/2,h);face.closePath();const hole=new T.Path();hole.absellipse(0,h*.48,w*.28,h*.34,0,Math.PI*2,true);face.holes.push(hole);
    mesh(new T.ExtrudeGeometry(face,{depth:.035,bevelEnabled:false}),c,x,y,z+d/2-.035);
    ball(x,y+.077,z,.36*w,.033,.36*d,cushion);
  }
  if(item.category==='furniture'){
    switch(item.shape){
      case 'sofa':
      case 'armchair': {
        const sofa=item.shape==='sofa',w=sofa?2.04:.83,n=sofa?3:1;
        legs(w-.2,.61,.15,dark,.036);box(0,.25,0,w,.25,.82);box(0,.6,-.36,w,.66,.16);
        for(const x of [-w/2+.07,w/2-.07]){box(x,.46,0,.15,.42,.84);box(x,.68,0,.17,.055,.8);}
        for(let i=0;i<n;i++){const x=(i-(n-1)/2)*(w-.31)/n;box(x,.414,.04,(w-.34)/n-.014,.16,.58,linen);box(x,.645,-.255,(w-.34)/n-.01,.36,.105);}
        if(sofa)for(const [x,c]of[[-.66,'#bdaf96'],[.66,'#90a3a2']]){const pillow=box(x,.61,-.12,.30,.31,.13,c);pillow.rotation.z=x*.15;pillow.rotation.x=-.18;}
        break;
      }
      case 'bed':
        legs(1.5,1.84,.18,wood,.05);box(0,.28,0,1.75,.24,2.10);box(0,.47,.015,1.64,.22,2.0,linen);box(0,.595,.31,1.66,.05,1.35,'#aab5a2');box(0,.65,-1.045,1.82,1.1,.095);box(0,.865,-.985,1.56,.2,.022,'#c5ad8c');
        for(const x of [-.41,.41]){ball(x,.621,-.69,.32,.065,.22,'#f1ecdf');box(x,.672,-.69,.40,.007,.33,'#e3dccb');}box(0,.625,.91,1.67,.065,.17,'#8e9f91');
        break;
      case 'wardrobe':
        legs(1.36,.46,.1,dark);box(0,1.12,-.015,1.58,2.06,.56);for(const x of [-.391,.391]){box(x,1.15,.279,.765,1.9,.035,linen);handle(x-Math.sign(x)*.29,1.04,.315,.027);box(x,1.15,.301,.66,1.73,.009,'#d8c8aa');box(x-Math.sign(x)*.29,1.04,.32,.026,.23,.035,dark);}box(0,2.18,0,1.65,.065,.63);break;
      case 'dresser':
        legs(.95,.32,.13,dark);box(0,.5,0,1.13,.75,.48);box(0,.895,0,1.2,.055,.54);
        for(let i=0;i<3;i++){box(0,.28+i*.22,.251,1.035,.198,.045,i%2?color:'#ceb394');handle(0,.28+i*.22,.29,.28);}break;
      case 'nightstand':
        legs(.39,.34,.14,dark,.025);for(const x of [-.243,.243])box(x,.335,0,.035,.4,.45);box(0,.335,-.21,.52,.4,.035);box(0,.153,0,.52,.035,.45);box(0,.332,0,.52,.024,.45);box(0,.55,0,.57,.035,.49);box(0,.421,.24,.47,.17,.028);handle(0,.42,.268,.11);for(let i=0;i<3;i++)box(-.023,.19+i*.04,.065,.3-i*.025,.029,.23,['#8f9d8e','#c2af8e','#b88874'][i]);break;
      case 'desk':
        legs(1.24,.53,.715,wood,.04);box(0,.745,0,1.42,.06,.69);box(-.47,.56,-.015,.34,.29,.56);box(-.47,.577,.278,.3,.18,.025);handle(-.47,.58,.304,.12);box(.10,.803,-.14,.20,.02,.14,dark);box(.10,.94,-.19,.035,.28,.035,dark);box(.10,1.103,-.20,.54,.33,.035,dark);box(.10,1.103,-.177,.495,.275,.008,'#93b4b0');box(.11,.789,.13,.40,.018,.13,'#697b72');cylinder(.55,.82,-.12,.043,.09,linen);books(-.62,.78,-.13,3);break;
      case 'officechair':
        cylinder(0,.295,0,.045,.44,metal);for(let i=0;i<5;i++){const a=i*Math.PI*2/5,x=Math.cos(a)*.25,z=Math.sin(a)*.25,spoke=box(x/2,.09,z/2,.042,.05,.29,metal);spoke.rotation.y=Math.PI/2-a;const wheel=cylinder(x,.047,z,.043,.04,dark);wheel.rotation.z=Math.PI/2;}
        box(0,.495,.015,.54,.11,.53);box(0,.75,-.232,.035,.44,.045,metal);box(0,.91,-.235,.49,.57,.075);for(let i=0;i<5;i++)box(0,.735+i*.08,-.186,.405,.012,.012,'#a8b9b5');for(const x of [-.3,.3]){box(x,.61,0,.035,.22,.035,metal);box(x,.73,.015,.072,.04,.32,dark);}break;
      case 'diningtable':
        legs(1.35,.67,.73,wood,.055);box(0,.77,0,1.7,.08,.91);box(0,.815,0,.35,.011,.86,linen);cylinder(0,.84,0,.075,.045,'#ccb591');for(let i=0;i<3;i++){const angle=i*2.1;ball(Math.cos(angle)*.058,.885,Math.sin(angle)*.058,.035,.037,.035,['#ba8f69','#b6ab70','#a2ad86'][i]);}break;
      case 'diningchair':
        legs(.37,.38,.45,wood,.027);box(0,.47,0,.49,.055,.49);box(0,.506,0,.425,.028,.41,linen);for(const x of [-.202,.202])box(x,.67,-.221,.044,.51,.044);for(const x of [-.125,0,.125])box(x,.735,-.222,.035,.25,.03);box(0,.91,-.222,.46,.065,.055);break;
      case 'tvstand':
        legs(1.4,.31,.105,dark);box(0,.129,0,1.7,.045,.43);box(0,.305,-.197,1.7,.35,.035,'#8b755a');for(const x of [-.825,-.353,.353,.825])box(x,.305,0,.045,.35,.43);box(0,.49,0,1.78,.044,.47);box(0,.285,.02,.67,.025,.4);box(0,.2,.04,.42,.065,.22,dark);for(let i=0;i<3;i++)box(-.12,.323+i*.04,.02,.25+i*.025,.03,.24,['#9ba79c','#c2b491','#b98c76'][i]);
        for(const x of [-.594,.594]){box(x,.29,.23,.465,.29,.035);handle(x,.35,.256,.17);}break;
      case 'bookcase':
        for(const x of [-.52,.52])box(x,.97,0,.055,1.94,.35);box(0,.97,-.17,1.05,1.94,.025,'#bea586');
        for(let i=0;i<6;i++){const y=.045+i*.375;box(0,y,0,1.1,.045,.38);if(i<5){books(-.43,y+.025,-.016,i%2?4:6);if(i%2){cylinder(.3,y+.09,0,.072,.13,'#9daf9b');ball(.3,y+.195,0,.055,.09,.055,'#d2c7ad');}else box(.31,y+.064,.01,.24,.075,.23,'#969f98');}}break;
    }
  }else if(item.category==='cats'){
    switch(item.shape){
      case 'tree':
        box(0,.04,0,.86,.08,.70);for(const [x,z,h]of[[-.27,-.16,1.49],[.28,.16,.91],[.05,-.18,1.75]]){cylinder(x,.08+h/2,z,.061,h,'#cdb78f');for(let j=0;j<Math.floor(h/.04);j++){const wrap=ring(x,.09+j*.04,z,.063,.004,'#ad9573');wrap.rotation.x=Math.PI/2;}}
        cubby(-.20,.22,.02,.47,.43,.45);for(const [x,y,z,w,d]of[[.23,.96,.13,.47,.49],[-.20,1.55,-.14,.62,.48],[.07,1.83,-.18,.48,.43]]){box(x,y,z,w,.055,d);ball(x,y+.046,z,w*.39,.025,d*.39,linen);}
        cylinder(.38,.735,.23,.007,.36,dark);ball(.38,.535,.23,.065,.065,.065,'#b28771');break;
      case 'condo':
        box(0,.045,0,.74,.09,.64);cubby(0,.09,0,.67,.49,.58);cubby(0,.585,0,.67,.49,.58);box(0,1.105,0,.73,.06,.64);ball(0,1.152,0,.28,.031,.23,linen);for(const x of [-.305,.305])box(x,1.18,-.04,.045,.15,.5);break;
      case 'bed': {
        const bolster=ring(0,.13,0,.36,.075);bolster.rotation.x=Math.PI/2;bolster.scale.set(1.21,1,.92);ball(0,.069,0,.39,.062,.31,linen);ball(-.1,.142,-.08,.15,.025,.11,'#b9a79a');break;
      }
      case 'litter':
        box(0,.058,0,.56,.116,.68,dark);cubby(0,.098,0,.57,.49,.68,color,'#b9b0a0');box(0,.618,0,.49,.045,.59);box(0,.652,-.03,.17,.03,.045,dark);for(const x of [-.21,-.14,-.07,.07,.14,.21])box(x,.535,-.346,.025,.075,.012,'#75857b');box(0,.045,.425,.47,.035,.2,'#b8bcae');for(let i=0;i<5;i++)box((i-2)*.078,.068,.425,.023,.008,.16,'#939f92');break;
      case 'feeder':
        legs(.48,.23,.14,wood,.022);box(0,.165,0,.65,.05,.34);bowl(-.17,.186,0,'#d8d7cd','#a88762');bowl(.17,.186,0,'#d8d7cd','#8daeb0');for(let i=0;i<8;i++)ball(-.17+Math.cos(i*2.4)*.062,.23,Math.sin(i*2.4)*.056,.015,.011,.013,'#97774e');break;
      case 'fountain':
        cylinder(0,.093,0,.205,.186,color,.215);cylinder(0,.197,0,.216,.034,linen);cylinder(0,.22,0,.179,.015,'#8db7b8',.179,{roughness:.15,metalness:.1});cylinder(0,.282,-.025,.035,.14,linen);ball(0,.361,-.025,.071,.025,.071,'#d7c886');for(let i=0;i<5;i++){const a=i*1.256;ball(Math.cos(a)*.063,.354,-.025+Math.sin(a)*.063,.055,.018,.033,linen);}cylinder(.085,.284,-.025,.008,.105,'#a4cbd0');box(0,.114,.205,.05,.036,.013,'#547e80');break;
      case 'scratcher':
        box(0,.035,0,.43,.07,.43);cylinder(0,.435,0,.075,.74,'#cdb48a');for(let i=0;i<23;i++){const wrap=ring(0,.09+i*.03,0,.076,.005,'#ac9470');wrap.rotation.x=Math.PI/2;}cylinder(0,.822,0,.09,.035);const arm=box(.085,.821,0,.21,.025,.025);cylinder(.18,.687,0,.006,.26,dark);ball(.18,.536,0,.052,.052,.052,'#9eaca0');break;
      case 'tunnel':
        for(let i=0;i<3;i++){
          const a=i*Math.PI*2/3,axis=new T.Vector3(Math.cos(a),0,Math.sin(a)),part=mesh(new T.CylinderGeometry(.17,.17,.59,28,1,true),color,axis.x*.28,.177,axis.z*.28,{side:T.DoubleSide});part.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),axis);
          for(const distance of [.13,.32,.54]){const seam=ring(axis.x*distance,.177,axis.z*distance,.174,.012,dark);seam.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),axis);}
        }ball(0,.178,0,.175,.17,.175,color);cylinder(.45,.105,.035,.006,.14,linen);ball(.45,.024,.035,.022,.022,.022,'#b48970');break;
      case 'perch':
        legs(.53,.34,.76,wood,.028);box(0,.28,-.01,.57,.035,.38);box(0,.798,0,.72,.064,.50);ball(0,.85,.014,.315,.035,.20,linen);box(0,.951,-.242,.72,.24,.045);for(const x of [-.343,.343])box(x,.9,.016,.035,.15,.46);break;
      case 'toys':
        box(0,.023,0,.43,.046,.30);for(const x of [-.204,.204])box(x,.123,0,.022,.20,.30);for(const z of [-.139,.139])box(0,.123,z,.43,.2,.022);for(let i=0;i<7;i++)for(const z of [-.153,.153])box((i-3)*.06,.12,z,.013,.17,.007,'#d7c09b');box(0,.226,-.139,.46,.025,.026);box(0,.226,.139,.46,.025,.026);
        ball(-.1,.217,.012,.067,.067,.067,'#a8b6a2');ball(.053,.244,-.053,.057,.059,.057,'#c29581');ball(.095,.214,.048,.066,.042,.040,'#aaaeb4');ball(.146,.227,.051,.025,.027,.029,'#aaaeb4');for(const x of [.14,.16])ball(x,.25,.048,.009,.014,.014,'#d2b5b0');const wand=box(-.09,.36,-.08,.012,.36,.012,wood);wand.rotation.z=-.45;const cord=new T.CatmullRomCurve3([new T.Vector3(-.012,.522,-.08),new T.Vector3(-.095,.62,-.08),new T.Vector3(-.19,.60,-.08),new T.Vector3(-.19,.557,-.08)]);mesh(new T.TubeGeometry(cord,16,.002,5,false),dark);ball(-.19,.527,-.08,.026,.048,.025,'#8aabb1');break;
    }
  }
  root.updateMatrixWorld(true);const bounds=new T.Box3().setFromObject(root);
  if(!bounds.isEmpty()){const center=bounds.getCenter(new T.Vector3());root.position.set(-center.x,-bounds.min.y,-center.z);}
  return root;
}
