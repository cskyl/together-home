// Prices are fixed game-currency prices, never retail prices.
export const categories = [
  ['lego','乐高街景'],['cars','车库'],['blind','盲盒'],['plush','娃娃'],['decor','家具装饰']
];
const history = 'https://www.lego.com/en-us/categories/modular-buildings/about';
const modulars = [
  [10182,'转角咖啡厅','Café Corner',2007,'#b99d67',400],
  [10190,'市场街','Market Street',2007,'#7c9baa',300],
  [10185,'绿色杂货店','Green Grocer',2008,'#abc393',420],
  [10197,'消防队','Fire Brigade',2009,'#ad614b',380],
  [10211,'百货商场','Grand Emporium',2010,'#d0bc8a',420],
  [10218,'宠物店','Pet Shop',2011,'#739da1',340],
  [10224,'市政厅','Town Hall',2012,'#ce8a5b',480],
  [10232,'皇宫影院','Palace Cinema',2013,'#c9b376',420],
  [10243,'巴黎餐厅','Parisian Restaurant',2014,'#9da676',380],
  [10246,'侦探事务所','Detective’s Office',2015,'#91b5bb',380],
  [10251,'积木银行','Brick Bank',2016,'#c7c8b9',400],
  [10255,'城市中心集会广场','Assembly Square',2017,'#c7ad85',600],
  [10260,'怀旧餐厅','Downtown Diner',2018,'#7ec6b1',380],
  [10264,'转角汽车修理厂','Corner Garage',2019,'#c99061',420],
  [10270,'书店','Bookshop',2020,'#b2b588',380],
  [10278,'警察局','Police Station',2021,'#cbbb9b',450],
  [10297,'精品酒店','Boutique Hotel',2022,'#d9ad8e',450],
  [10312,'爵士乐俱乐部','Jazz Club',2023,'#b76053',450],
  [10326,'自然历史博物馆','Natural History Museum',2023,'#aeb98f',600],
  [10350,'都铎街角','Tudor Corner',2025,'#d9cfb4',480],
  [11371,'购物街','Shopping Street',2026,'#c9ae8e',520]
];
export const paintOptions = [
  {id:'cream',name:'奶油白',color:'#eee9db',price:0},
  {id:'green',name:'森林绿',color:'#456653',price:80},
  {id:'blue',name:'海盐蓝',color:'#769bab',price:80},
  {id:'red',name:'酒红',color:'#963f46',price:100},
  {id:'silver',name:'银灰',color:'#aab4b7',price:100},
  {id:'black',name:'曜石黑',color:'#343a3f',price:80}
];
export const carOptions = {
  paint:{name:'车漆',values:paintOptions},
  wheels:{name:'轮毂',values:[{id:'classic',name:'经典银色',price:0},{id:'sport',name:'运动黑色',price:120},{id:'bronze',name:'古铜轮毂',price:160}]},
  cabin:{name:'内饰',values:[{id:'tan',name:'焦糖色',color:'#b88958',price:0},{id:'ivory',name:'米白',color:'#e5ddc9',price:100},{id:'dark',name:'深灰',color:'#484d50',price:80}]},
  roof:{name:'车顶',values:[{id:'solid',name:'同色车顶',price:0},{id:'glass',name:'全景玻璃',price:180},{id:'open',name:'敞篷',price:240}]},
  trim:{name:'外观套件',values:[{id:'standard',name:'标准版',price:0},{id:'sport',name:'尾翼 + 侧裙',price:200}]}
};
const variants = (names,colors,shapes) => names.map((name,i)=>({id:String(i),name,color:colors[i],shape:shapes[i]}));
const softColors=['#d2ab80','#ddc7b3','#a4bac0','#c5baa1','#caa4ad','#a8b49c'];
export const items = [
  ...modulars.map(([set,name,english,year,color,price],index)=>({id:`lego-${set}`,category:'lego',name,english,year,set,color,price,shape:'building',index,
    image:`items/lego-${set}.jpg`,source:set===10350?'https://www.lego.com/en-us/product/tudor-corner-10350':set===11371?'https://www.lego.com/en-us/product/shopping-street-11371':history,
    description:`${set} · ${english} · ${year}。商品图来自 LEGO；摆入房间的是按配色与立面特征制作的简化积木模型。`})),
  ...[
    ['coupe','双门跑车',2600,'#963f46'],['sedan','城市轿车',1800,'#eee9db'],
    ['suv','电动 SUV',2400,'#769bab'],['offroad','方盒子越野车',2800,'#456653'],
    ['wagon','旅行车',2200,'#aab4b7'],['compact','复古小车',1500,'#d3bc75']
  ].map(([shape,name,price,color])=>({id:`car-${shape}`,category:'cars',shape,name,price,color,description:'原创车型，可选 6 种车漆、3 款轮毂、3 种内饰、3 种车顶和运动套件。停在车库，选配会显示在 3D 模型上。'})),
  {id:'box-forest',category:'blind',name:'森林下班了',price:120,color:'#91aa87',shape:'box',description:'6 只森林小动物，随机开出一款。',variants:variants(['围巾小熊','奶油兔','灰蓝猫','打盹水豚','莓果狐狸','苔藓小熊'],softColors,['bear','rabbit','cat','capybara','fox','bear'])},
  {id:'box-space',category:'blind',name:'太空摸鱼队',price:150,color:'#929dbc',shape:'box',description:'6 个戴头盔的太空伙伴，换个星球继续摸鱼。',variants:variants(['月球熊','星云兔','轨道猫','土星熊','银河兔','薄荷猫'],['#ded4b8','#b6a4cc','#9cbbcf','#e0ae85','#bd8da2','#9ec5ad'],['astro-bear','astro-rabbit','astro-cat','astro-bear','astro-rabbit','astro-cat'])},
  {id:'box-dessert',category:'blind',name:'甜品休息站',price:100,color:'#d3afb3',shape:'box',description:'6 款甜品配色的小摆件，每款概率相同。',variants:variants(['草莓布丁','抹茶团子','蓝莓蛋糕','焦糖可可','芋泥泡芙','香草奶冻'],['#d5a4ad','#a5b68a','#9fabc5','#b58c64','#baa3bd','#ded4b4'],['pudding','pudding','pudding','pudding','pudding','pudding'])},
  {id:'box-cats',category:'blind',name:'猫咪今天不上班',price:120,color:'#c6b99e',shape:'box',description:'6 款不同配色的坐姿猫，收集进度单独统计。',variants:variants(['橘子','乌云','奶盖','花生','蓝莓','豆沙'],['#d8a567','#565d63','#ece0cb','#b4a081','#95a8bc','#c39fa6'],['cat','cat','cat','cat','cat','cat'])},
  ...[
    ['bear','焦糖大熊',180,'#c09b73'],['rabbit','长耳兔',180,'#e3cebd'],
    ['cat','灰蓝猫咪',160,'#94abb4'],['capybara','水豚抱枕',200,'#b5a083'],
    ['fox','围巾小狐狸',180,'#ca9570'],['panda','黑白熊猫',220,'#e3ded1']
  ].map(([shape,name,price,color])=>({id:`plush-${shape}`,category:'plush',shape,name,price,color,description:'原创软乎乎摆件，可以转个方向摆在房间里。'})),
  ...[
    ['plant','大叶盆栽',100,'#7f986b'],['lamp','蘑菇落地灯',180,'#e4bc84'],
    ['shelf','收藏展示架',280,'#ac906b'],['chair','单人躺椅',220,'#a6b5a1'],
    ['rug','圆形地毯',100,'#b4b7a3'],['record','黑胶唱片柜',250,'#99795b'],
    ['piano','立式钢琴',600,'#505b56'],['table','圆边茶几',180,'#bd9c72'],
    ['aquarium','小鱼缸',240,'#8eafb2'],['flowers','花瓶与花',80,'#c2a6b2']
  ].map(([shape,name,price,color])=>({id:`decor-${shape}`,category:'decor',shape,name,price,color,description:'放在客厅、卧室或书房，位置和朝向都可以调整。'}))
];
export const getItem = id => items.find(i=>i.id===id);
export function optionGroups(item) {
  if(item.category==='cars')return carOptions;
  if(item.category==='lego')return {display:{name:'展示方式',values:[{id:'open',name:'开放展示',price:0},{id:'case',name:'透明防尘罩',price:60},{id:'lit',name:'防尘罩 + 暖光',price:100}]}};
  return {};
}
export function quote(id,input={}) {
  const item=getItem(id);
  if(!item||!input||typeof input!=='object'||Array.isArray(input))throw Error('物品或选配无效。');
  const groups=optionGroups(item),config={};let amount=item.price;
  if(Object.keys(input).some(k=>!Object.hasOwn(groups,k)))throw Error('物品选配无效。');
  for(const [key,group] of Object.entries(groups)){
    const value=group.values.find(v=>v.id===(input[key]??group.values[0].id));
    if(!value)throw Error('物品选配无效。');config[key]=value.id;amount+=value.price;
  }
  return {item,config,amount};
}
export const itemName = owned => {
  const item=getItem(owned.item);return item?.variants?`${item.name} · ${item.variants.find(v=>v.id===owned.variant)?.name||''}`:item?.name||'物品';
};
export const configName = owned => Object.entries(optionGroups(getItem(owned.item))).map(([key,group])=>group.values.find(v=>v.id===owned.config[key])?.name).join(' · ');
export function placementRooms(plan,item) {
  return plan.rooms.filter(r=>item.category==='cars'?r.type==='garage':['living','bed','study','dining'].includes(r.type));
}
// A shared slot reserves real space: small collectibles use display ledges; furniture uses floor zones.
export function placementSlots(item) {
  if(item.category==='cars')return [0,1];
  if(item.category==='lego'||item.category==='blind')return Array.from({length:12},(_,i)=>i);
  return [12,13,14,15];
}
